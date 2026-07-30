import { describe, expect, it } from "vitest";

import {
  CommandKind,
  CommandResultCode,
  GENERIC_HID_INPUT_REPORT_ID,
  GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID,
  GENERIC_HID_OUTPUT_REPORT_ID,
  GENERIC_HID_USAGE,
  GENERIC_HID_USAGE_PAGE,
  PacketKind,
  RightHalfStatus,
  SessionStatus,
  cellId,
  decodeGenericHidOutput,
  encodeGenericHidInput,
  encodeGenericCapabilityFeature,
  sceneChecksum,
  sessionId,
  simulatedGlove80Capabilities,
  type CellPresentation,
  type Packet,
  type SceneGeneration,
  type SceneFragment,
  type SessionId,
} from "@glove80-control-surface/surface-protocol";

import {
  GenericSurfaceDevice,
  type SurfaceScheduler,
  type SurfaceScene,
} from "./genericSurfaceDevice";
import type {
  HidConnection,
  HidDeviceDescriptor,
  HidTransport,
} from "./hidTransport";

const genericDescriptor: HidDeviceDescriptor = {
  path: "generic-80",
  vendorId: 0x16c0,
  productId: 0x27db,
  product: "Glove80 Left",
  usagePage: GENERIC_HID_USAGE_PAGE,
  usage: GENERIC_HID_USAGE,
};

describe("complete 80-cell surface device", () => {
  it("requires the exact generic collection and applies one atomic scene across both halves", async () => {
    const transport = new FakeFirmwareTransport([
      genericDescriptor,
      {
        ...genericDescriptor,
        path: "legacy-six",
        usage: 1,
      },
      {
        ...genericDescriptor,
        path: "keyboard",
        usagePage: 1,
        usage: 6,
      },
    ]);
    const scheduler = new FakeScheduler();
    const surface = new GenericSurfaceDevice(
      transport,
      scheduler,
      10_000,
      () => sessionId(0x1234),
    );
    await surface.setDesired(fullScene(4));
    expect(transport.outputReports).toHaveLength(0);

    await surface.enable();

    const packets = transport.hostPackets;
    expect(packets[0]?.kind).toBe(PacketKind.CapabilityQuery);
    expect(packets[1]?.kind).toBe(PacketKind.OpenSession);
    expect(
      packets.filter((packet) => packet.kind === PacketKind.SceneFragment),
    ).toHaveLength(14);
    expect(
      packets.filter((packet) => packet.kind === PacketKind.SceneCommit),
    ).toHaveLength(1);
    expect(packets.at(-1)?.kind).toBe(PacketKind.StatusQuery);
    expect(transport.appliedCells).toHaveLength(80);
    expect(transport.appliedCells.map((cell) => cell.cellId)).toEqual(
      Array.from({ length: 80 }, (_, index) => index),
    );
    expect(surface.snapshot()).toMatchObject({
      connection: "connected",
      desiredGeneration: 4,
      applied: {
        generation: 4,
        leftGeneration: 4,
        rightGeneration: 4,
        disposition: "applied",
      },
      leaseExpiresAtMillis: 10_000,
    });

    await surface.disable();
    expect(transport.hostPackets.at(-1)?.kind).toBe(
      PacketKind.CloseSession,
    );
    expect(transport.openConnections).toBe(0);
  });

  it("reports independent right-half acknowledgement without discarding the left scene", async () => {
    const transport = new FakeFirmwareTransport([genericDescriptor]);
    transport.rightConnected = false;
    const surface = new GenericSurfaceDevice(
      transport,
      new FakeScheduler(),
      10_000,
      () => sessionId(9),
    );
    await surface.setDesired(fullScene(8));
    await surface.enable();

    expect(surface.snapshot()).toMatchObject({
      connection: "partial",
      applied: {
        generation: 8,
        leftGeneration: 8,
        rightGeneration: undefined,
        disposition: "partial",
      },
    });
    expect(transport.appliedCells).toHaveLength(80);
    await surface.disable();
  });

  it("coalesces superseded fragments and commits only the newest complete generation", async () => {
    const transport = new FakeFirmwareTransport([genericDescriptor]);
    const surface = new GenericSurfaceDevice(
      transport,
      new FakeScheduler(),
      10_000,
      () => sessionId(10),
    );
    await surface.enable();
    transport.blockNextWrite();

    const first = surface.setDesired(fullScene(1, 11));
    await transport.writeStarted();
    const middle = surface.setDesired(fullScene(2, 22));
    const newest = surface.setDesired(fullScene(3, 33));
    transport.releaseWrite();
    await Promise.all([first, middle, newest]);
    await waitFor(() => surface.snapshot().applied?.generation === 3);

    const committed = transport.hostPackets
      .filter((packet) => packet.kind === PacketKind.SceneCommit)
      .map((packet) =>
        packet.kind === PacketKind.SceneCommit
          ? packet.generation
          : undefined,
      );
    expect(committed).toEqual([3]);
    expect(transport.appliedCells[0]?.color.red).toBe(33);
    await surface.disable();
  });

  it("rejects reuse of one generation for different physical content", async () => {
    const surface = new GenericSurfaceDevice(
      new FakeFirmwareTransport([genericDescriptor]),
      new FakeScheduler(),
      10_000,
      () => sessionId(16),
    );
    await surface.setDesired(fullScene(1, 10));
    expect(() => surface.setDesired(fullScene(1, 20))).toThrow(
      /cannot be reused/,
    );
  });

  it("serializes disable behind an in-flight fragment and never commits afterward", async () => {
    const transport = new FakeFirmwareTransport([genericDescriptor]);
    const surface = new GenericSurfaceDevice(
      transport,
      new FakeScheduler(),
      10_000,
      () => sessionId(17),
    );
    await surface.enable();
    transport.blockNextWrite();
    const applying = surface.setDesired(fullScene(1));
    await transport.writeStarted();
    const disabling = surface.disable();
    transport.releaseWrite();
    await Promise.all([applying, disabling]);

    expect(
      transport.hostPackets.some(
        (packet) => packet.kind === PacketKind.SceneCommit,
      ),
    ).toBe(false);
    expect(surface.snapshot().connection).toBe("disabled");
    expect(transport.openConnections).toBe(0);
  });

  it("retains one logical session ID across transient link reconnects", async () => {
    const transport = new FakeFirmwareTransport([genericDescriptor]);
    const scheduler = new FakeScheduler();
    let created = 0;
    const surface = new GenericSurfaceDevice(
      transport,
      scheduler,
      10_000,
      () => sessionId(++created),
    );
    await surface.enable();
    transport.failNextWrite = true;
    await surface.setDesired(fullScene(1));
    expect(surface.snapshot().connection).toBe("reconnecting");

    scheduler.advanceToNext();
    await waitFor(() => surface.snapshot().applied?.generation === 1);

    expect(created).toBe(1);
    expect(
      new Set(
        transport.hostPackets.map((packet) =>
          packet.kind === PacketKind.SceneFragment
            ? packet.fragment.sessionId
            : packet.sessionId,
        ),
      ),
    ).toEqual(new Set([1]));
    await surface.disable();
  });

  it("renews at half the lease and clears through CloseSession on pause", async () => {
    const transport = new FakeFirmwareTransport([genericDescriptor]);
    const scheduler = new FakeScheduler();
    const surface = new GenericSurfaceDevice(
      transport,
      scheduler,
      10_000,
      () => sessionId(11),
    );
    await surface.setDesired(fullScene(5));
    await surface.enable();

    scheduler.advanceToNext();
    await waitFor(
      () =>
        transport.hostPackets.filter(
          (packet) => packet.kind === PacketKind.RenewSession,
        ).length === 1 &&
        surface.snapshot().leaseExpiresAtMillis === 15_000,
    );
    expect(surface.snapshot().leaseExpiresAtMillis).toBe(15_000);

    await surface.setPaused(true);
    expect(transport.hostPackets.at(-1)?.kind).toBe(
      PacketKind.CloseSession,
    );
    expect(surface.snapshot()).toMatchObject({
      connection: "paused",
      desiredGeneration: 5,
      applied: undefined,
    });

    await surface.setPaused(false);
    expect(surface.snapshot()).toMatchObject({
      connection: "connected",
      applied: { generation: 5, disposition: "applied" },
    });
    await surface.disable();
  });

  it("retains the newest desired generation through a cable failure and bounded reconnect", async () => {
    const transport = new FakeFirmwareTransport([genericDescriptor]);
    const scheduler = new FakeScheduler();
    const surface = new GenericSurfaceDevice(
      transport,
      scheduler,
      10_000,
      () => sessionId(12),
    );
    await surface.enable();
    transport.failNextWrite = true;

    await surface.setDesired(fullScene(6, 60));
    expect(surface.snapshot()).toMatchObject({
      connection: "reconnecting",
      desiredGeneration: 6,
      applied: undefined,
    });
    await surface.setDesired(fullScene(7, 70));

    scheduler.advanceToNext();
    await waitFor(() => surface.snapshot().applied?.generation === 7);

    expect(surface.snapshot()).toMatchObject({
      connection: "connected",
      desiredGeneration: 7,
      applied: { generation: 7 },
    });
    expect(transport.appliedCells[0]?.color.red).toBe(70);
    await surface.disable();
  });

  it("refuses missing, ambiguous, and incomplete 80-cell capabilities", async () => {
    const missing = new GenericSurfaceDevice(
      new FakeFirmwareTransport([]),
      new FakeScheduler(),
      10_000,
      () => sessionId(13),
    );
    await expect(missing.enable()).rejects.toThrow(/No Glove80/);

    const ambiguous = new GenericSurfaceDevice(
      new FakeFirmwareTransport([
        genericDescriptor,
        { ...genericDescriptor, path: "generic-80-2" },
      ]),
      new FakeScheduler(),
      10_000,
      () => sessionId(14),
    );
    await expect(ambiguous.enable()).rejects.toThrow(/More than one/);

    const incompleteTransport = new FakeFirmwareTransport([
      genericDescriptor,
    ]);
    incompleteTransport.capabilities = {
      ...simulatedGlove80Capabilities(),
      availableCells: Array.from({ length: 40 }, (_, index) =>
        cellId(index),
      ),
      maxSceneCells: 40,
    };
    const incomplete = new GenericSurfaceDevice(
      incompleteTransport,
      new FakeScheduler(),
      10_000,
      () => sessionId(15),
    );
    await expect(incomplete.enable()).rejects.toThrow(
      /complete 80-cell Glove80 contract/,
    );
  });
});

class FakeFirmwareTransport implements HidTransport {
  readonly outputReports: Uint8Array[] = [];
  readonly hostPackets: Packet[] = [];
  appliedCells: CellPresentation[] = [];
  capabilities = simulatedGlove80Capabilities();
  rightConnected = true;
  failNextWrite = false;
  openConnections = 0;
  private session?: SessionId;
  private sessionOpen = false;
  private leaseMillis = 0;
  private centralGeneration?: number;
  private rightGeneration?: number;
  private fragments = new Map<number, SceneFragment>();
  private inputQueue: Uint8Array[] = [];
  private blocked?: Deferred<void>;
  private started?: Deferred<void>;

  constructor(private readonly descriptors: HidDeviceDescriptor[]) {}

  async enumerate(): Promise<readonly HidDeviceDescriptor[]> {
    return this.descriptors.map((descriptor) => ({ ...descriptor }));
  }

  async open(path: string): Promise<HidConnection> {
    const descriptor = this.descriptors.find(
      (candidate) => candidate.path === path,
    );
    if (!descriptor) {
      throw new Error("Unknown fake HID path.");
    }
    this.openConnections += 1;
    let closed = false;
    return {
      getFeatureReport: async (reportId) => {
        if (
          reportId !== GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID ||
          (descriptor.usage !== GENERIC_HID_USAGE &&
            descriptor.path !== "generic")
        ) {
          throw new Error("Unsupported fake feature report.");
        }
        return encodeGenericCapabilityFeature(this.capabilities);
      },
      read: async () => {
        if (closed) throw new Error("Fake HID connection is closed.");
        return this.inputQueue.shift();
      },
      write: async (report) => {
        if (closed) throw new Error("Fake HID connection is closed.");
        this.started?.resolve();
        if (this.blocked) await this.blocked.promise;
        if (this.failNextWrite) {
          this.failNextWrite = false;
          throw new Error("Simulated USB cable loss.");
        }
        expect(report[0]).toBe(GENERIC_HID_OUTPUT_REPORT_ID);
        this.outputReports.push(Uint8Array.from(report));
        const [sequence, packet] = decodeGenericHidOutput(report);
        this.hostPackets.push(packet);
        this.respond(sequence, this.handle(packet));
      },
      close: async () => {
        if (closed) return;
        closed = true;
        this.openConnections -= 1;
      },
    };
  }

  blockNextWrite(): void {
    this.blocked = deferred<void>();
    this.started = deferred<void>();
  }

  writeStarted(): Promise<void> {
    return this.started?.promise ?? Promise.resolve();
  }

  releaseWrite(): void {
    this.blocked?.resolve();
    this.blocked = undefined;
  }

  private handle(packet: Packet): Packet {
    switch (packet.kind) {
      case PacketKind.CapabilityQuery:
        return {
          kind: PacketKind.CapabilityResponse,
          sessionId: packet.sessionId,
          capabilities: this.capabilities,
        };
      case PacketKind.OpenSession:
        if (this.sessionOpen && this.session !== packet.sessionId) {
          return {
            kind: PacketKind.DeviceError,
            sessionId: packet.sessionId,
            requestKind: PacketKind.OpenSession,
            code: "sessionBusy",
          };
        }
        this.session = packet.sessionId;
        this.sessionOpen = true;
        this.leaseMillis = packet.leaseMillis;
        return commandResult(
          packet.sessionId,
          CommandKind.OpenSession,
          CommandResultCode.Accepted,
        );
      case PacketKind.RenewSession:
        this.requireSession(packet.sessionId);
        this.leaseMillis = packet.leaseMillis;
        return commandResult(
          packet.sessionId,
          CommandKind.RenewSession,
          CommandResultCode.Accepted,
        );
      case PacketKind.SceneFragment:
        this.requireSession(packet.fragment.sessionId);
        this.fragments.set(
          packet.fragment.fragmentIndex,
          packet.fragment,
        );
        return commandResult(
          packet.fragment.sessionId,
          CommandKind.SceneFragment,
          CommandResultCode.Accepted,
        );
      case PacketKind.SceneCommit: {
        this.requireSession(packet.sessionId);
        const cells = [...this.fragments.values()]
          .sort(
            (left, right) =>
              left.fragmentIndex - right.fragmentIndex,
          )
          .flatMap((fragment) => fragment.cells);
        if (
          cells.length !== packet.totalCells ||
          sceneChecksum(cells) !== packet.sceneChecksum
        ) {
          throw new Error("Fake firmware received an invalid atomic commit.");
        }
        this.appliedCells = cells.map((cell) => ({
          cellId: cell.cellId,
          color: { ...cell.color },
          effect: cell.effect,
        }));
        this.fragments.clear();
        this.centralGeneration = packet.generation;
        this.rightGeneration = this.rightConnected
          ? packet.generation
          : undefined;
        this.leaseMillis = packet.leaseMillis;
        return {
          kind: PacketKind.CommandResult,
          sessionId: packet.sessionId,
          command: CommandKind.SceneCommit,
          result: this.rightConnected
            ? CommandResultCode.Applied
            : CommandResultCode.Partial,
          centralGeneration: packet.generation,
          rightGeneration: this.rightGeneration as
            | SceneGeneration
            | undefined,
        };
      }
      case PacketKind.StatusQuery:
        this.requireSession(packet.sessionId);
        return {
          kind: PacketKind.StatusResponse,
          sessionId: packet.sessionId,
          status: SessionStatus.Active,
          leaseRemainingMillis: this.leaseMillis,
          centralGeneration: this.centralGeneration as
            | SceneGeneration
            | undefined,
          rightGeneration: this.rightGeneration as
            | SceneGeneration
            | undefined,
          rightStatus: this.rightConnected
            ? RightHalfStatus.Applied
            : RightHalfStatus.Absent,
        };
      case PacketKind.CloseSession:
        this.requireSession(packet.sessionId);
        this.sessionOpen = false;
        this.appliedCells = [];
        this.centralGeneration = undefined;
        this.rightGeneration = undefined;
        return commandResult(
          packet.sessionId,
          CommandKind.CloseSession,
          CommandResultCode.Closed,
        );
      default:
        throw new Error(`Unexpected host packet ${packet.kind}.`);
    }
  }

  private respond(sequence: number, packet: Packet): void {
    const report = encodeGenericHidInput(sequence, packet);
    expect(report[0]).toBe(GENERIC_HID_INPUT_REPORT_ID);
    this.inputQueue.push(report);
  }

  private requireSession(candidate: SessionId): void {
    if (!this.sessionOpen || candidate !== this.session) {
      throw new Error("Fake firmware session is not open.");
    }
  }
}

class FakeScheduler implements SurfaceScheduler {
  private time = 0;
  private nextId = 1;
  private timers = new Map<
    number,
    { callback: () => void; at: number }
  >();

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, delayMillis: number): number {
    const id = this.nextId++;
    this.timers.set(id, { callback, at: this.time + delayMillis });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  advanceToNext(): void {
    const next = [...this.timers.entries()].sort(
      (left, right) => left[1].at - right[1].at,
    )[0];
    if (!next) throw new Error("No fake timer is scheduled.");
    this.timers.delete(next[0]);
    this.time = next[1].at;
    next[1].callback();
  }
}

function fullScene(generation: number, red = 40): SurfaceScene {
  return {
    generation,
    brightness: 48,
    cells: Array.from({ length: 80 }, (_, index) => ({
      cellId: cellId(index),
      color: {
        red,
        green: index,
        blue: 79 - index,
      },
      effect: index % 2 === 0 ? "solid" : "pulse",
    })),
  };
}

function commandResult(
  id: SessionId,
  command: CommandKind,
  result: CommandResultCode,
): Packet {
  return {
    kind: PacketKind.CommandResult,
    sessionId: id,
    command,
    result,
  };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value?: T | PromiseLike<T>): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {
    promise,
    resolve: (value) => resolve(value as T | PromiseLike<T>),
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("Condition did not become true.");
}
