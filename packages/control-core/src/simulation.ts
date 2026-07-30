import type {
  AppBackend,
  AppViewState,
  CollectionAvailability,
  ConfigurationDocument,
  FeedbackView,
  ResolvedTile,
  RuntimeCommand,
  SemanticState,
} from "./types";

const demoCells = [0, 1, 2, 40, 41, 42, 3, 4, 5, 43, 44, 45];

export interface ConfigurationStore {
  read(): unknown | undefined;
  write(configuration: ConfigurationDocument): void;
  recoveryMessage?(): string | undefined;
}

export interface SimulationRuntimeOptions {
  demo?: boolean;
}

interface FrozenAction {
  resourceId: string;
  observedRevision: number;
  enabled: boolean;
}

export function defaultConfiguration(): ConfigurationDocument {
  return {
    schemaVersion: 1,
    preferences: { brightness: 48, reduceMotion: false },
  };
}

function initialTasks(): ResolvedTile[] {
  return [
    task("task-1", "Glove80 control surface", "needsInput"),
    task("task-2", "Cross-platform desktop shell", "working"),
    task("task-3", "Codex app-server research", "completedUnread"),
    task("task-4", "Firmware protocol notes", "idle"),
    task("task-5", "Visual editor review", "failed"),
    task("task-6", "Hardware descriptor audit", "idle", "glove80-status"),
  ];
}

function task(
  resourceId: string,
  label: string,
  state: SemanticState,
  context = "glove80-control-surface",
): ResolvedTile {
  return {
    resourceId,
    label,
    context,
    state,
    action: { enabled: true },
    retention: stateRetention(state),
    revision: 1,
  };
}

function stateRetention(
  state: SemanticState,
): ResolvedTile["retention"] {
  return state === "idle" || state === "stale" ? "normal" : "protected";
}

function statePriority(state: SemanticState): number {
  switch (state) {
    case "needsInput":
    case "failed":
      return 0;
    case "working":
      return 1;
    case "completedUnread":
      return 2;
    case "idle":
      return 3;
    case "stale":
      return 4;
  }
}

export class SimulationRuntime implements AppBackend {
  private configuration: ConfigurationDocument;
  private tasks = initialTasks();
  private displayTasks = initialTasks();
  private allocation = new Map<number, string>();
  private frozenActions?: Map<number, FrozenAction>;
  private interactionEpoch?: number;
  private deferred = false;
  private acknowledged = new Map<string, number>();
  private sourceAvailability: CollectionAvailability = "online";
  private sourceTaskCount = this.tasks.length;
  private revision = 1;
  private generation = 1;
  private activeGeneration?: number;
  private leftGeneration?: number;
  private rightGeneration?: number;
  private connected = true;
  private paused = false;
  private rightConnected = true;
  private feedback?: FeedbackView;
  private nextTaskNumber = 7;

  constructor(
    private readonly store: ConfigurationStore,
    options: SimulationRuntimeOptions = {},
  ) {
    this.configuration = this.loadConfiguration();
    const recoveryMessage = this.store.recoveryMessage?.();
    if (recoveryMessage) {
      this.feedback = message("error", recoveryMessage);
    }
    if (
      !this.configuration.taskBoard &&
      options.demo
    ) {
      this.configuration.taskBoard = {
        bindingId: "codex-task-board",
        cells: demoCells,
        workspaceRoots: [],
      };
    }
    this.reconcile();
    this.applyScene();
  }

  async bootstrap(): Promise<AppViewState> {
    return this.view();
  }

  async dispatch(command: RuntimeCommand): Promise<AppViewState> {
    this.feedback = undefined;
    switch (command.kind) {
      case "assignTaskBoard":
        this.ensureInteractionInactive();
        this.assign(command.cells);
        break;
      case "removeTaskBoard":
        this.ensureInteractionInactive();
        {
          const nextConfiguration = cloneConfiguration(this.configuration);
          delete nextConfiguration.taskBoard;
          this.commitConfiguration(nextConfiguration);
        }
        this.allocation.clear();
        this.cancelInteraction();
        this.clearScene();
        this.feedback = message("info", "Task board removed. The simulator scene is clear.");
        break;
      case "setPaused":
        this.paused = command.paused;
        if (this.paused) {
          this.cancelInteraction();
          this.clearScene();
          this.feedback = message("info", "Surface paused. Normal typing would remain unchanged.");
        } else {
          this.applyScene();
          this.feedback = message("success", "Surface resumed with a fresh complete scene.");
        }
        break;
      case "setRightHalfConnected":
        this.rightConnected = command.connected;
        if (!command.connected) {
          this.rightGeneration = undefined;
          this.feedback = message(
            "warning",
            "Right half disconnected. Left-half state remains available.",
          );
        } else {
          this.applyScene();
          this.feedback = message(
            "success",
            "Right half reconnected and acknowledged the fresh scene.",
          );
        }
        break;
      case "setDeviceConnected":
        this.connected = command.connected;
        if (command.connected) {
          this.applyScene();
          this.feedback = message(
            "success",
            "Simulated Glove80 reconnected and synchronized.",
          );
        } else {
          this.cancelInteraction();
          this.clearScene();
          this.feedback = message(
            "warning",
            "Keyboard disconnected. Desired state is retained locally.",
          );
        }
        break;
      case "setPreferences":
        if (command.brightness > 96) {
          throw new Error("Brightness exceeds the simulated device maximum.");
        }
        this.commitConfiguration({
          ...cloneConfiguration(this.configuration),
          preferences: {
            brightness: command.brightness,
            reduceMotion: command.reduceMotion,
          },
        });
        this.applyScene();
        this.feedback = message(
          "success",
          command.reduceMotion
            ? "Appearance saved. Pulsing states now use steady light."
            : "Appearance saved. Working and input-needed states may pulse.",
        );
        break;
      case "setTaskState":
        this.setTaskState(command.cellId, command.state);
        break;
      case "addTask":
        this.addTask("idle", "New Codex task");
        this.publish();
        this.feedback = message(
          "info",
          "A new task entered the existing board without a settings change.",
        );
        break;
      case "removeTask":
        this.removeTask(command.cellId);
        break;
      case "burst":
        for (const state of [
          "needsInput",
          "working",
          "completedUnread",
          "failed",
          "idle",
        ] satisfies SemanticState[]) {
          this.addTask(state, "Burst task");
        }
        this.publish();
        this.feedback = message(
          "info",
          "Five tasks arrived together. Existing represented tasks kept their physical slots.",
        );
        break;
      case "setSourceAvailability":
        this.sourceAvailability = command.availability;
        this.publish();
        this.feedback = message(
          command.availability === "online" ? "success" : "warning",
          command.availability === "online"
            ? "Task source restored."
            : "Task source is unavailable; actions are disabled.",
        );
        break;
      case "expireSource":
        this.sourceAvailability = "stale";
        this.applyScene();
        this.feedback = message(
          "warning",
          "The source lease expired. Tasks remain identifiable but actions are disabled.",
        );
        break;
      case "expireScene":
        this.cancelInteraction();
        this.clearScene();
        this.feedback = message(
          "warning",
          "The device lease expired and cleared the temporary scene.",
        );
        break;
      case "resetSimulation":
        this.resetTransientState();
        this.feedback = message(
          "success",
          "Simulation restored to its deterministic device, session, clock, and task state.",
        );
        break;
      case "acknowledge":
        this.acknowledge(command.cellId);
        break;
      case "beginInteraction":
        if (command.epoch === 0 || this.interactionEpoch) {
          throw new Error("An interaction is already active.");
        }
        this.interactionEpoch = command.epoch;
        this.frozenActions = new Map(
          [...this.allocation].flatMap(([cellId, resourceId]) => {
            const tile = this.displayTasks.find(
              (candidate) => candidate.resourceId === resourceId,
            );
            return tile
              ? [[
                  cellId,
                  {
                    resourceId,
                    observedRevision: tile.revision,
                    enabled:
                      this.sourceAvailability === "online" &&
                      tile.action.enabled,
                  },
                ] as const]
              : [];
          }),
        );
        this.applyScene();
        break;
      case "endInteraction":
        if (this.interactionEpoch !== command.epoch) {
          throw new Error("Interaction epoch does not match.");
        }
        this.interactionEpoch = undefined;
        this.frozenActions = undefined;
        if (this.deferred) {
          this.deferred = false;
          this.reconcile();
          this.displayTasks = this.tasks.map((item) => ({ ...item }));
        }
        this.applyScene();
        break;
      case "invokeCell":
        this.invoke(command.epoch, command.cellId);
        break;
    }
    this.revision += 1;
    return this.view();
  }

  private assign(cells: number[]) {
    if (
      cells.length === 0 ||
      new Set(cells).size !== cells.length ||
      cells.some((cell) => cell < 0 || cell >= 80)
    ) {
      throw new Error("Choose one or more unique Glove80 keys.");
    }
    this.commitConfiguration({
      ...cloneConfiguration(this.configuration),
      taskBoard: {
        bindingId: "codex-task-board",
        cells: [...cells],
        workspaceRoots: [],
      },
    });
    this.reconcile();
    this.displayTasks = this.tasks.map((item) => ({ ...item }));
    this.applyScene();
    this.feedback = message(
      "success",
      "Codex task board saved. New tasks now fill these keys automatically.",
    );
  }

  private setTaskState(cellId: number, state: SemanticState) {
    const resourceId = this.resourceAt(cellId);
    const selected = this.tasks.find((item) => item.resourceId === resourceId);
    if (!selected) {
      throw new Error("The selected task is no longer available.");
    }
    selected.state = state;
    selected.retention = stateRetention(state);
    selected.revision += 1;
    const label = selected.label;
    this.sourceAvailability = "online";
    this.publish();
    this.feedback = message("info", `Simulated “${label}” changing to ${state}.`);
  }

  private addTask(state: SemanticState, prefix: string) {
    const number = this.nextTaskNumber;
    this.nextTaskNumber += 1;
    this.tasks.push(
      task(
        `task-${number}`,
        `${prefix} ${number}`,
        state,
        number % 2 === 0
          ? "glove80-control-surface"
          : "another-workspace",
      ),
    );
  }

  private removeTask(cellId: number) {
    const resourceId = this.resourceAt(cellId);
    this.tasks = this.tasks.filter((item) => item.resourceId !== resourceId);
    this.publish();
    this.feedback = message(
      "info",
      "The task left; the next eligible task may fill its slot.",
    );
  }

  private publish() {
    this.sourceTaskCount = this.tasks.length;
    if (this.interactionEpoch) {
      this.deferred = true;
    } else {
      this.reconcile();
      this.displayTasks = this.tasks.map((item) => ({ ...item }));
    }
    this.applyScene();
  }

  private reconcile() {
    const cells = this.configuration.taskBoard?.cells ?? [];
    const candidates = [...this.tasks].sort(
      (left, right) => statePriority(left.state) - statePriority(right.state),
    );
    const eligible = new Set(candidates.map((item) => item.resourceId));
    for (const [cell, resource] of this.allocation) {
      if (!cells.includes(cell) || !eligible.has(resource)) {
        this.allocation.delete(cell);
      }
    }
    for (const candidate of candidates) {
      if ([...this.allocation.values()].includes(candidate.resourceId)) {
        continue;
      }
      const empty = cells.find((cell) => !this.allocation.has(cell));
      if (empty !== undefined) {
        this.allocation.set(empty, candidate.resourceId);
        continue;
      }
      const candidatePriority = candidates.indexOf(candidate);
      const replacement = [...this.allocation.entries()]
        .map(([cell, resource]) => ({
          cell,
          occupant: candidates.find((item) => item.resourceId === resource),
          priority: candidates.findIndex((item) => item.resourceId === resource),
        }))
        .filter(
          (entry) =>
            entry.occupant !== undefined &&
            this.effectiveRetention(entry.occupant) === "normal" &&
            entry.priority > candidatePriority,
        )
        .sort((left, right) => right.priority - left.priority)[0];
      if (replacement) {
        this.allocation.set(replacement.cell, candidate.resourceId);
      }
    }
  }

  private acknowledge(cellId: number) {
    const resourceId = this.resourceAt(cellId);
    const selected = this.tasks.find((item) => item.resourceId === resourceId);
    if (!selected) {
      throw new Error("The selected task is no longer available.");
    }
    this.acknowledged.set(resourceId, selected.revision);
    this.applyScene();
    this.feedback = message("success", `Acknowledged ${selected.label}.`);
  }

  private effectiveRetention(
    tile: ResolvedTile,
  ): ResolvedTile["retention"] {
    const acknowledgedRevision = this.acknowledged.get(tile.resourceId);
    return acknowledgedRevision !== undefined &&
      acknowledgedRevision >= tile.revision &&
      (tile.state === "completedUnread" || tile.state === "failed")
      ? "normal"
      : tile.retention;
  }

  private invoke(epoch: number, cellId: number) {
    if (this.interactionEpoch !== epoch || !this.frozenActions) {
      throw new Error("Hold the control layer before invoking a task.");
    }
    const frozen = this.frozenActions.get(cellId);
    const selected = this.tasks.find(
      (item) => item.resourceId === frozen?.resourceId,
    );
    if (
      !frozen ||
      !selected ||
      !frozen.enabled ||
      !selected.action.enabled ||
      this.sourceAvailability !== "online"
    ) {
      this.feedback = message(
        "warning",
        "This action is currently unavailable.",
      );
      return;
    }
    this.feedback = message(
      "success",
      `Simulation would open “${selected.label}” in Codex.`,
    );
  }

  private resourceAt(cellId: number): string {
    const resourceId = this.allocation.get(cellId);
    if (!resourceId) {
      throw new Error("The selected key has no task.");
    }
    return resourceId;
  }

  private applyScene() {
    this.generation += 1;
    if (!this.connected || this.paused || !this.configuration.taskBoard) {
      this.clearScene();
      return;
    }
    this.activeGeneration = this.generation;
    // A complete scene applies to both supported halves even when one
    // half's subset is empty; otherwise an old overlay could survive there.
    this.leftGeneration = this.generation;
    this.rightGeneration = this.rightConnected
      ? this.generation
      : undefined;
  }

  private clearScene() {
    this.activeGeneration = undefined;
    this.leftGeneration = undefined;
    this.rightGeneration = undefined;
  }

  private view(): AppViewState {
    const cells = this.configuration.taskBoard?.cells ?? [];
    const byId = new Map(this.displayTasks.map((item) => [item.resourceId, item]));
    const slots = cells.map((cellId, slot) => {
      const resourceId = this.allocation.get(cellId);
      const sourceTile = resourceId ? byId.get(resourceId) : undefined;
      const acknowledgedRevision = resourceId
        ? this.acknowledged.get(resourceId)
        : undefined;
      const tile = sourceTile
        ? {
            ...sourceTile,
            state:
              this.sourceAvailability !== "online"
                ? ("stale" as const)
                : acknowledgedRevision !== undefined &&
                    acknowledgedRevision >= sourceTile.revision &&
                    (sourceTile.state === "completedUnread" ||
                      sourceTile.state === "failed")
                  ? ("idle" as const)
                  : sourceTile.state,
            action:
              this.sourceAvailability === "online"
                ? sourceTile.action
                : {
                    enabled: false,
                    explanation: "Source is stale or unavailable",
                  },
          }
        : undefined;
      return {
        slot,
        cellId,
        tile,
        presentation: tile
          ? {
              cellId,
              color: stateColor(tile.state),
              effect:
                this.configuration.preferences.reduceMotion ||
                (tile.state !== "working" && tile.state !== "needsInput")
                  ? ("solid" as const)
                  : ("pulse" as const),
            }
          : undefined,
      };
    });
    const represented = new Set(this.allocation.values());
    const overflow = this.displayTasks
      .filter((item) => !represented.has(item.resourceId))
      .sort(
        (left, right) =>
          statePriority(left.state) - statePriority(right.state),
      );
    const desiredGeneration = this.configuration.taskBoard
      ? this.generation
      : undefined;
    const syncStatus = !this.connected
      ? ("disconnected" as const)
      : this.paused
        ? ("paused" as const)
        : !this.configuration.taskBoard
          ? ("idle" as const)
          : this.leftGeneration === desiredGeneration &&
              this.rightGeneration === desiredGeneration
            ? ("applied" as const)
            : ("partial" as const);
    return {
      revision: this.revision,
      mode: "simulation",
      configuration: cloneConfiguration(this.configuration),
      device: {
        capabilities: {
          protocolVersion: 2,
          topologyId: "glove80-rgb-80-v1",
          availableCells: Array.from({ length: 80 }, (_, index) => index),
          supportsInputEvents: true,
          supportsRightHalfAcknowledgement: true,
          supportedEffects: ["solid", "pulse"],
          maxSceneCells: 80,
          maxLeaseMillis: 60_000,
          maxBrightness: 96,
        },
        snapshot: {
          connected: this.connected,
          paused: this.paused,
          activeGeneration: this.activeGeneration,
          leftGeneration: this.leftGeneration,
          rightGeneration: this.rightGeneration,
          leaseExpiresAtMillis: this.activeGeneration ? 6_000 : undefined,
        },
        desiredGeneration,
        appliedScene: this.activeGeneration
          ? {
              generation: this.activeGeneration,
              leftGeneration: this.leftGeneration,
              rightGeneration: this.rightGeneration,
              disposition: syncStatus === "applied" ? "applied" : "partial",
            }
          : undefined,
        syncStatus,
        rightHalfConnected: this.rightConnected,
      },
      board: this.configuration.taskBoard
        ? {
            cells,
            slots,
            overflow,
            collectionAvailability: this.sourceAvailability,
            interactionEpoch: this.interactionEpoch,
          }
        : undefined,
      sourceTaskCount: this.sourceTaskCount,
      feedback: this.feedback,
    };
  }

  private loadConfiguration(): ConfigurationDocument {
    const stored = this.store.read();
    return stored === undefined
      ? defaultConfiguration()
      : parseConfiguration(stored);
  }

  private cancelInteraction() {
    this.interactionEpoch = undefined;
    this.frozenActions = undefined;
    this.deferred = false;
  }

  private ensureInteractionInactive() {
    if (this.interactionEpoch !== undefined) {
      throw new Error(
        "Finish the active control-layer interaction before changing its assignment.",
      );
    }
  }

  private resetTransientState() {
    this.tasks = initialTasks();
    this.displayTasks = initialTasks();
    this.allocation = new Map();
    this.cancelInteraction();
    this.acknowledged = new Map();
    this.sourceAvailability = "online";
    this.sourceTaskCount = this.tasks.length;
    this.nextTaskNumber = 7;
    this.generation = 1;
    this.activeGeneration = undefined;
    this.leftGeneration = undefined;
    this.rightGeneration = undefined;
    this.connected = true;
    this.paused = false;
    this.rightConnected = true;
    this.reconcile();
    this.applyScene();
  }

  private commitConfiguration(next: ConfigurationDocument) {
    const validated = parseConfiguration(next);
    this.store.write(validated);
    this.configuration = validated;
  }
}

export function parseConfiguration(value: unknown): ConfigurationDocument {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Unsupported configuration.");
  }
  const preferences = value.preferences;
  if (
    !isRecord(preferences) ||
    !Number.isInteger(preferences.brightness) ||
    (preferences.brightness as number) < 0 ||
    (preferences.brightness as number) > 255 ||
    typeof preferences.reduceMotion !== "boolean"
  ) {
    throw new Error("Invalid preferences.");
  }
  const configuration: ConfigurationDocument = {
    schemaVersion: 1,
    preferences: {
      brightness: preferences.brightness as number,
      reduceMotion: preferences.reduceMotion,
    },
  };
  if (value.taskBoard !== undefined) {
    const board = value.taskBoard;
    if (
      !isRecord(board) ||
      typeof board.bindingId !== "string" ||
      board.bindingId.trim() === "" ||
      !Array.isArray(board.cells) ||
      board.cells.length === 0 ||
      board.cells.some(
        (cell) => !Number.isInteger(cell) || cell < 0 || cell >= 80,
      ) ||
      new Set(board.cells).size !== board.cells.length ||
      !Array.isArray(board.workspaceRoots) ||
      board.workspaceRoots.some((root) => typeof root !== "string")
    ) {
      throw new Error("Invalid task board.");
    }
    configuration.taskBoard = {
      bindingId: board.bindingId,
      cells: [...board.cells] as number[],
      workspaceRoots: [...board.workspaceRoots] as string[],
    };
  }
  return configuration;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stateColor(state: SemanticState) {
  switch (state) {
    case "idle":
      return { red: 220, green: 226, blue: 235 };
    case "working":
      return { red: 54, green: 132, blue: 255 };
    case "completedUnread":
      return { red: 52, green: 199, blue: 89 };
    case "needsInput":
      return { red: 255, green: 176, blue: 32 };
    case "failed":
      return { red: 255, green: 69, blue: 58 };
    case "stale":
      return { red: 92, green: 96, blue: 104 };
  }
}

function cloneConfiguration(
  configuration: ConfigurationDocument,
): ConfigurationDocument {
  return {
    schemaVersion: configuration.schemaVersion,
    preferences: { ...configuration.preferences },
    taskBoard: configuration.taskBoard
      ? {
          bindingId: configuration.taskBoard.bindingId,
          cells: [...configuration.taskBoard.cells],
          workspaceRoots: [...configuration.taskBoard.workspaceRoots],
        }
      : undefined,
  };
}

function message(
  tone: FeedbackView["tone"],
  text: string,
): FeedbackView {
  return { tone, message: text };
}
