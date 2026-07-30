import { describe, expect, it } from "vitest";

import {
  SimulationRuntime,
  type ConfigurationDocument,
  type ConfigurationStore,
  type ResolvedTile,
} from "@glove80-control-surface/control-core";
import {
  cellId,
  sceneGeneration,
  sessionId,
  simulatedGlove80Capabilities,
  type DeviceEvent,
} from "@glove80-control-surface/surface-protocol";

import {
  HardwareRuntime,
  type HardwareSurface,
} from "./hardwareRuntime";
import type {
  SurfaceDeviceSnapshot,
  SurfaceScene,
} from "./genericSurfaceDevice";

class MemoryStore implements ConfigurationStore {
  constructor(public value?: ConfigurationDocument) {}

  read(): unknown | undefined {
    return this.value;
  }

  write(configuration: ConfigurationDocument): void {
    this.value = structuredClone(configuration);
  }
}

class FakeSurface implements HardwareSurface {
  desired?: SurfaceScene;
  enableCount = 0;
  disableCount = 0;
  readonly operations: string[] = [];
  private snapshotValue: SurfaceDeviceSnapshot = {
    connection: "disabled",
    detail: "off",
  };
  private readonly snapshotListeners = new Set<
    (snapshot: SurfaceDeviceSnapshot) => void
  >();
  private readonly eventListeners = new Set<
    (event: DeviceEvent) => void
  >();

  snapshot(): SurfaceDeviceSnapshot {
    return structuredClone(this.snapshotValue);
  }

  subscribe(listener: (snapshot: SurfaceDeviceSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  subscribeEvents(listener: (event: DeviceEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  async setDesired(scene: SurfaceScene | undefined): Promise<void> {
    this.operations.push(`desired:${scene?.generation ?? "none"}`);
    this.desired = scene ? structuredClone(scene) : undefined;
    if (this.snapshotValue.connection === "connected") this.applyDesired();
  }

  async enable(): Promise<void> {
    this.operations.push("enable");
    this.enableCount += 1;
    this.snapshotValue = {
      connection: "connected",
      capabilities: simulatedGlove80Capabilities(),
      descriptor: {
        path: "fake",
        vendorId: 0x16c0,
        productId: 0x27db,
      },
      detail: "connected",
    };
    this.applyDesired();
  }

  async setPaused(paused: boolean): Promise<void> {
    this.operations.push(`paused:${paused}`);
    if (paused) {
      this.snapshotValue = {
        ...this.snapshotValue,
        connection: "paused",
        applied: undefined,
        leaseExpiresAtMillis: undefined,
        detail: "paused",
      };
      this.emitSnapshot();
      return;
    }
    if (
      this.snapshotValue.connection === "disabled" ||
      this.snapshotValue.connection === "unavailable"
    ) {
      return;
    }
    this.snapshotValue = {
      ...this.snapshotValue,
      connection: "connected",
      detail: "connected",
    };
    this.applyDesired();
  }

  async disable(): Promise<void> {
    this.operations.push("disable");
    this.disableCount += 1;
    this.snapshotValue = {
      ...this.snapshotValue,
      connection: "disabled",
      applied: undefined,
      leaseExpiresAtMillis: undefined,
      detail: "off",
    };
    this.emitSnapshot();
  }

  emitEvent(event: DeviceEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }

  private applyDesired(): void {
    const generation = this.desired?.generation;
    this.snapshotValue = {
      ...this.snapshotValue,
      desiredGeneration: generation,
      applied: generation
        ? {
            generation: sceneGeneration(generation),
            leftGeneration: sceneGeneration(generation),
            rightGeneration: sceneGeneration(generation),
            disposition: "applied",
          }
        : undefined,
      leaseExpiresAtMillis: generation ? 10_000 : undefined,
    };
    this.emitSnapshot();
  }

  private emitSnapshot(): void {
    for (const listener of this.snapshotListeners) {
      listener(this.snapshot());
    }
  }
}

describe("hardware runtime composition", () => {
  it("boots into hardware mode and carries a physical action back to the LEDs", async () => {
    const opened: string[] = [];
    const surface = new FakeSurface();
    const published: string[] = [];
    const runtime = new HardwareRuntime(
      new SimulationRuntime(new MemoryStore(configuration([0])), {
        initialTasks: [task("thread-1", "Release", "completedUnread")],
        invokeTask: async (selected) => {
          opened.push(selected.resourceId);
        },
      }),
      surface,
      (state) => published.push(state.device.syncStatus),
    );

    const boot = await runtime.bootstrap();
    expect(boot.mode).toBe("hardware");
    expect(boot.device.syncStatus).toBe("applied");
    expect(surface.enableCount).toBe(1);
    expect(surface.desired?.cells).toHaveLength(1);
    expect(surface.desired?.cells[0]?.color).toEqual({
      red: 52,
      green: 199,
      blue: 89,
    });

    surface.emitEvent({
      kind: "interactionModeEntered",
      sessionId: sessionId(7),
      sequence: 1,
      interactionEpoch: 91,
    });
    surface.emitEvent({
      kind: "cell",
      event: {
        sessionId: sessionId(7),
        sequence: 2,
        interactionEpoch: 91,
        cellId: cellId(0),
        kind: "down",
      },
    });
    await waitFor(() => opened.length === 1);

    expect(opened).toEqual(["thread-1"]);
    expect(surface.desired?.cells[0]?.color).toEqual({
      red: 220,
      green: 226,
      blue: 235,
    });
    expect(published).toContain("applied");

    surface.emitEvent({
      kind: "interactionModeExited",
      sessionId: sessionId(7),
      sequence: 3,
      interactionEpoch: 91,
    });
    await waitFor(
      () =>
        published.length > 0 &&
        surface.operations.filter((item) => item.startsWith("desired:"))
          .length >= 4,
    );
    await runtime.stop();
    expect(surface.disableCount).toBe(1);
  });

  it("ignores physical interaction entry until a board exists", async () => {
    const surface = new FakeSurface();
    const runtime = new HardwareRuntime(
      new SimulationRuntime(new MemoryStore()),
      surface,
      () => undefined,
    );
    await runtime.bootstrap();

    surface.emitEvent({
      kind: "interactionModeEntered",
      sessionId: sessionId(8),
      sequence: 1,
      interactionEpoch: 92,
    });
    const assigned = await runtime.dispatch({
      kind: "assignTaskBoard",
      cells: [0, 40],
    });

    expect(assigned.board?.interactionEpoch).toBeUndefined();
    expect(assigned.board?.cells).toEqual([0, 40]);
    await runtime.stop();
  });

  it("pauses before replacing desired state and stops idempotently", async () => {
    const surface = new FakeSurface();
    const runtime = new HardwareRuntime(
      new SimulationRuntime(new MemoryStore(configuration([0]))),
      surface,
      () => undefined,
    );
    await runtime.bootstrap();
    surface.operations.length = 0;

    const paused = await runtime.dispatch({
      kind: "setPaused",
      paused: true,
    });

    expect(paused.device.syncStatus).toBe("paused");
    expect(surface.operations.slice(0, 2)).toEqual([
      "paused:true",
      expect.stringMatching(/^desired:/),
    ]);
    await Promise.all([runtime.stop(), runtime.stop()]);
    expect(surface.disableCount).toBe(1);
  });
});

function configuration(cells: number[]): ConfigurationDocument {
  return {
    schemaVersion: 1,
    preferences: { brightness: 48, reduceMotion: false },
    taskBoard: {
      bindingId: "codex-task-board",
      cells,
      workspaceRoots: [],
    },
  };
}

function task(
  resourceId: string,
  label: string,
  state: ResolvedTile["state"],
): ResolvedTile {
  return {
    resourceId,
    label,
    context: "test",
    state,
    action: { enabled: true },
    retention: "protected",
    revision: 1,
  };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMillis = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMillis;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("condition timed out");
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
