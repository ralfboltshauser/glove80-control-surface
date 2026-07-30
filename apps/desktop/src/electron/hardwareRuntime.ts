import {
  cellId,
  type DeviceEvent,
} from "@glove80-control-surface/surface-protocol";
import type {
  AppBackend,
  AppViewState,
  RuntimeCommand,
  TaskSourceSnapshot,
} from "@glove80-control-surface/control-core";

import type {
  SurfaceDeviceSnapshot,
  SurfaceScene,
} from "./genericSurfaceDevice";

export interface HardwareSurface {
  snapshot(): SurfaceDeviceSnapshot;
  subscribe(
    listener: (snapshot: SurfaceDeviceSnapshot) => void,
  ): () => void;
  subscribeEvents(listener: (event: DeviceEvent) => void): () => void;
  setDesired(scene: SurfaceScene | undefined): Promise<void>;
  enable(): Promise<void>;
  setPaused(paused: boolean): Promise<void>;
  disable(): Promise<void>;
}

export interface TaskBoardRuntime extends AppBackend {
  replaceTaskSource(snapshot: TaskSourceSnapshot): Promise<AppViewState>;
}

const RETRY_MILLIS = 2_000;

/**
 * Thin production composition root. The task-board core owns allocation and
 * actions; the surface owns HID lifecycle. This class only translates between
 * their generic scene/event contracts and serializes their state changes.
 */
export class HardwareRuntime implements TaskBoardRuntime {
  private coreState?: AppViewState;
  private revision = 0;
  private queue = Promise.resolve();
  private retryTimer?: ReturnType<typeof setInterval>;
  private stopped = false;
  private stopPromise?: Promise<void>;
  private readonly unsubscribeSnapshot: () => void;
  private readonly unsubscribeEvents: () => void;

  constructor(
    private readonly core: TaskBoardRuntime,
    private readonly surface: HardwareSurface,
    private readonly onState: (state: AppViewState) => void,
  ) {
    this.unsubscribeSnapshot = surface.subscribe(() => {
      this.publishCurrent();
    });
    this.unsubscribeEvents = surface.subscribeEvents((event) => {
      void this.enqueue(async () => {
        await this.handleDeviceEvent(event);
      });
    });
  }

  bootstrap(): Promise<AppViewState> {
    return this.enqueue(async () => {
      await this.ensureCoreState();
      await this.syncSurface();
      await this.tryEnable();
      this.startRetryLoop();
      return this.view();
    });
  }

  dispatch(command: RuntimeCommand): Promise<AppViewState> {
    return this.enqueue(async () => {
      await this.ensureCoreState();
      this.coreState = await this.core.dispatch(command);
      await this.syncSurface();
      await this.tryEnable();
      return this.view();
    });
  }

  replaceTaskSource(snapshot: TaskSourceSnapshot): Promise<AppViewState> {
    return this.enqueue(async () => {
      await this.ensureCoreState();
      this.coreState = await this.core.replaceTaskSource(snapshot);
      await this.syncSurface();
      await this.tryEnable();
      return this.view();
    });
  }

  async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopped = true;
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = undefined;
    this.unsubscribeSnapshot();
    this.unsubscribeEvents();
    this.stopPromise = (async () => {
      await this.queue.catch(() => undefined);
      await this.surface.disable();
    })();
    return this.stopPromise;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async ensureCoreState(): Promise<void> {
    this.coreState ??= await this.core.bootstrap();
  }

  private async syncSurface(): Promise<void> {
    const state = this.requireCoreState();
    const desiredGeneration = state.device.desiredGeneration;
    const scene =
      state.board && desiredGeneration !== undefined
        ? {
            generation: desiredGeneration,
            brightness: state.configuration.preferences.brightness,
            cells: state.board.slots.flatMap((slot) =>
              slot.presentation
                ? [{
                    ...slot.presentation,
                    cellId: cellId(slot.presentation.cellId),
                  }]
                : [],
            ),
            primaryActionCells: state.board.slots
              .filter((slot) => slot.tile?.action.enabled)
              .map((slot) => slot.cellId),
            secondaryActionCells: state.board.slots
              .filter(
                (slot) =>
                  slot.tile?.action.enabled &&
                  (slot.tile.state === "completedUnread" ||
                    slot.tile.state === "failed"),
              )
              .map((slot) => slot.cellId),
          }
        : undefined;
    if (state.device.snapshot.paused) {
      await this.surface.setPaused(true);
      await this.surface.setDesired(scene);
    } else {
      await this.surface.setDesired(scene);
      await this.surface.setPaused(false);
    }
  }

  private async tryEnable(): Promise<void> {
    if (this.stopped) return;
    const connection = this.surface.snapshot().connection;
    if (
      connection !== "disabled" &&
      connection !== "unavailable"
    ) {
      return;
    }
    await this.surface.enable().catch(() => undefined);
  }

  private startRetryLoop(): void {
    if (this.retryTimer || this.stopped) return;
    this.retryTimer = setInterval(() => {
      void this.enqueue(async () => {
        await this.tryEnable();
      });
    }, RETRY_MILLIS);
  }

  private async handleDeviceEvent(event: DeviceEvent): Promise<void> {
    await this.ensureCoreState();
    const currentEpoch = this.coreState?.board?.interactionEpoch;
    switch (event.kind) {
      case "interactionModeEntered":
        if (!this.coreState?.board) break;
        if (
          currentEpoch !== undefined &&
          currentEpoch !== event.interactionEpoch
        ) {
          this.coreState = await this.core.dispatch({
            kind: "endInteraction",
            epoch: currentEpoch,
          });
        }
        if (this.coreState?.board?.interactionEpoch === undefined) {
          this.coreState = await this.core.dispatch({
            kind: "beginInteraction",
            epoch: event.interactionEpoch,
            bank: event.bank,
          });
          await this.syncSurface();
        }
        break;
      case "cell":
        if (
          event.event.kind === "down" &&
          this.coreState?.board?.interactionEpoch ===
            event.event.interactionEpoch
        ) {
          this.coreState = await this.core.dispatch({
            kind: "invokeCell",
            epoch: event.event.interactionEpoch,
            cellId: Number(event.event.cellId),
            bank: event.event.bank,
          });
          await this.syncSurface();
        }
        break;
      case "interactionModeExited":
        if (
          this.coreState?.board?.interactionEpoch ===
          event.interactionEpoch
        ) {
          this.coreState = await this.core.dispatch({
            kind: "endInteraction",
            epoch: event.interactionEpoch,
          });
          await this.syncSurface();
        }
        break;
      case "sceneExpired":
      case "error":
        break;
    }
    this.publishCurrent();
  }

  private publishCurrent(): void {
    if (!this.coreState || this.stopped) return;
    this.onState(this.view());
  }

  private view(): AppViewState {
    const coreState = this.requireCoreState();
    const snapshot = this.surface.snapshot();
    const connected =
      snapshot.connection === "connected" ||
      snapshot.connection === "partial" ||
      snapshot.connection === "paused";
    const paused = snapshot.connection === "paused";
    const desiredGeneration =
      snapshot.desiredGeneration ?? coreState.device.desiredGeneration;
    const syncStatus = !connected
      ? "disconnected"
      : paused
        ? "paused"
        : desiredGeneration === undefined
          ? "idle"
          : snapshot.applied?.disposition === "applied" &&
              Number(snapshot.applied.generation) === desiredGeneration
            ? "applied"
            : "partial";
    const capabilities = snapshot.capabilities;
    this.revision = Math.max(this.revision + 1, coreState.revision);
    return {
      ...coreState,
      revision: this.revision,
      mode: "hardware",
      device: {
        capabilities: capabilities
          ? {
              protocolVersion: capabilities.protocolVersion,
              topologyId: capabilities.topologyId,
              firmwareBuildId: capabilities.firmwareBuildId,
              availableCells: capabilities.availableCells.map(Number),
              supportsInputEvents: capabilities.supportsInputEvents,
              supportsRightHalfAcknowledgement:
                capabilities.supportsRightHalfAcknowledgement,
              supportedEffects: [...capabilities.supportedEffects],
              maxSceneCells: capabilities.maxSceneCells,
              maxLeaseMillis: capabilities.maxLeaseMillis,
              maxBrightness: capabilities.maxBrightness,
            }
          : coreState.device.capabilities,
        snapshot: {
          connected,
          paused,
          activeGeneration: snapshot.applied
            ? Number(snapshot.applied.generation)
            : undefined,
          leftGeneration: snapshot.applied?.leftGeneration === undefined
            ? undefined
            : Number(snapshot.applied.leftGeneration),
          rightGeneration: snapshot.applied?.rightGeneration === undefined
            ? undefined
            : Number(snapshot.applied.rightGeneration),
          leaseExpiresAtMillis: snapshot.leaseExpiresAtMillis,
        },
        desiredGeneration,
        appliedScene: snapshot.applied
          ? {
              generation: Number(snapshot.applied.generation),
              leftGeneration:
                snapshot.applied.leftGeneration === undefined
                  ? undefined
                  : Number(snapshot.applied.leftGeneration),
              rightGeneration:
                snapshot.applied.rightGeneration === undefined
                  ? undefined
                  : Number(snapshot.applied.rightGeneration),
              disposition: snapshot.applied.disposition,
            }
          : undefined,
        syncStatus,
        rightHalfConnected:
          snapshot.applied?.rightGeneration !== undefined,
        detail: snapshot.detail,
      },
    };
  }

  private requireCoreState(): AppViewState {
    if (!this.coreState) throw new Error("Task-board runtime is not ready.");
    return this.coreState;
  }
}
