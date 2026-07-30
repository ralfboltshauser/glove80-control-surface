import { randomBytes } from "node:crypto";

import {
  CommandKind,
  CommandResultCode,
  GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID,
  GENERIC_HID_HOST_REPORT_BYTES,
  PacketKind,
  RightHalfStatus,
  SessionStatus,
  decodeGenericCapabilityFeature,
  decodeGenericHidInput,
  encodeGenericHidOutput,
  packetsForCompleteScene,
  packetSessionId,
  sceneGeneration,
  sessionId,
  simulatedGlove80Capabilities,
  validateCapabilities,
  validateDesiredScene,
  type AppliedScene,
  type CellPresentation,
  type DeviceCapabilities,
  type Packet,
  type SceneGeneration,
  type SessionId,
} from "@glove80-control-surface/surface-protocol";

import type {
  HidConnection,
  HidDeviceDescriptor,
  HidTransport,
} from "./hidTransport";

const GLOVE80_VENDOR_ID = 0x16c0;
const GLOVE80_LEFT_PRODUCT_ID = 0x27db;
const EXCHANGE_TIMEOUT_MILLIS = 1_500;
const DEFAULT_LEASE_MILLIS = 10_000;
const MIN_RECONNECT_MILLIS = 250;
const MAX_RECONNECT_MILLIS = 8_000;
const MAX_UNSOLICITED_PACKETS = 32;

export interface SurfaceScene {
  readonly generation: number;
  readonly brightness: number;
  readonly cells: readonly CellPresentation[];
}

export type SurfaceConnectionState =
  | "disabled"
  | "connecting"
  | "connected"
  | "partial"
  | "paused"
  | "unavailable"
  | "reconnecting";

export interface SurfaceDeviceSnapshot {
  readonly connection: SurfaceConnectionState;
  readonly desiredGeneration?: number;
  readonly applied?: AppliedScene;
  readonly leaseExpiresAtMillis?: number;
  readonly capabilities?: DeviceCapabilities;
  readonly descriptor?: HidDeviceDescriptor;
  readonly detail: string;
}

export interface SurfaceScheduler {
  now(): number;
  setTimeout(callback: () => void, delayMillis: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemScheduler: SurfaceScheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMillis) => setTimeout(callback, delayMillis),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Complete 80-cell host session. Construction and setDesired() are inert;
 * enable() is the sole boundary that may open a session and write reports.
 */
export class GenericSurfaceDevice {
  private desired?: SurfaceScene;
  private applied?: AppliedScene;
  private leaseExpiresAtMillis?: number;
  private capabilitiesValue?: DeviceCapabilities;
  private descriptor?: HidDeviceDescriptor;
  private link?: HidPacketLink;
  private session?: SessionId;
  private sessionOpen = false;
  private enabled = false;
  private paused = false;
  private packetSequence = 0;
  private reconnectDelayMillis = MIN_RECONNECT_MILLIS;
  private timer?: unknown;
  private drain?: Promise<void>;
  private drainAgain = false;
  private lifecycleEpoch = 0;
  private snapshotValue: SurfaceDeviceSnapshot = {
    connection: "disabled",
    detail: "Real keyboard output is off.",
  };
  private readonly listeners = new Set<
    (snapshot: SurfaceDeviceSnapshot) => void
  >();

  constructor(
    private readonly transport: HidTransport,
    private readonly scheduler: SurfaceScheduler = systemScheduler,
    private readonly leaseMillis = DEFAULT_LEASE_MILLIS,
    private readonly createSessionId: () => SessionId = randomSessionId,
  ) {
    if (
      !Number.isInteger(leaseMillis) ||
      leaseMillis < 1_000 ||
      leaseMillis > 60_000
    ) {
      throw new Error("Surface lease must be from 1 through 60 seconds.");
    }
  }

  snapshot(): SurfaceDeviceSnapshot {
    return cloneSnapshot(this.snapshotValue);
  }

  subscribe(
    listener: (snapshot: SurfaceDeviceSnapshot) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setDesired(scene: SurfaceScene | undefined): Promise<void> {
    const next = scene ? cloneScene(scene) : undefined;
    if (
      next &&
      this.desired?.generation === next.generation &&
      sceneFingerprint(this.desired) !== sceneFingerprint(next)
    ) {
      throw new Error(
        `Scene generation ${next.generation} cannot be reused for different content.`,
      );
    }
    if (next) {
      validateDesiredScene(
        {
          sessionId: sessionId(1),
          generation: sceneGeneration(next.generation),
          leaseMillis: this.effectiveLeaseMillis(),
          brightness: next.brightness,
          cells: next.cells,
        },
        this.capabilitiesValue ?? simulatedGlove80Capabilities(),
      );
    }
    this.desired = next;
    return this.scheduleDrain();
  }

  async enable(): Promise<void> {
    if (this.enabled) return this.scheduleDrain();
    const epoch = ++this.lifecycleEpoch;
    this.enabled = true;
    this.paused = false;
    this.update({
      connection: "connecting",
      desiredGeneration: this.desired?.generation,
      detail: "Checking the 80-cell capability handshake…",
    });
    try {
      await this.connect(epoch);
      this.requireLifecycle(epoch);
      await this.scheduleDrain();
    } catch (error) {
      if (error instanceof LifecycleCancelledError) return;
      this.enabled = false;
      await this.closeLink(false);
      throw error;
    }
  }

  async setPaused(paused: boolean): Promise<void> {
    if (paused === this.paused) return this.scheduleDrain();
    this.lifecycleEpoch += 1;
    this.paused = paused;
    await this.scheduleDrain();
  }

  async disable(): Promise<void> {
    this.enabled = false;
    this.lifecycleEpoch += 1;
    this.cancelTimer();
    await this.drain?.catch(() => undefined);
    await this.closeSession().catch(() => undefined);
    await this.closeLink(false);
    this.applied = undefined;
    this.leaseExpiresAtMillis = undefined;
    this.update({
      connection: "disabled",
      desiredGeneration: this.desired?.generation,
      capabilities: this.capabilitiesValue,
      descriptor: this.descriptor,
      detail: "Real keyboard output is off.",
    });
  }

  private scheduleDrain(): Promise<void> {
    if (this.drain) {
      this.drainAgain = true;
      return this.drain;
    }
    this.drain = this.drainLoop().finally(() => {
      this.drain = undefined;
      if (this.drainAgain) {
        this.drainAgain = false;
        void this.scheduleDrain();
      }
    });
    return this.drain;
  }

  private async drainLoop(): Promise<void> {
    do {
      this.drainAgain = false;
      await this.reconcile();
    } while (this.drainAgain);
  }

  private async reconcile(): Promise<void> {
    const epoch = this.lifecycleEpoch;
    this.cancelTimer();
    if (!this.enabled) {
      this.update({
        connection: "disabled",
        desiredGeneration: this.desired?.generation,
        capabilities: this.capabilitiesValue,
        descriptor: this.descriptor,
        detail: "Real keyboard output is off.",
      });
      return;
    }
    if (this.paused || !this.desired) {
      try {
        await this.closeSession();
        this.requireLifecycle(epoch, false);
        this.applied = undefined;
        this.leaseExpiresAtMillis = undefined;
        this.update({
          connection: this.paused ? "paused" : "connected",
          desiredGeneration: this.desired?.generation,
          capabilities: this.capabilitiesValue,
          descriptor: this.descriptor,
          detail: this.paused
            ? "The close command was acknowledged; each half also retains its independent expiry fail-safe."
            : "No scene is assigned; the close command was acknowledged.",
        });
      } catch (error) {
        if (!(error instanceof LifecycleCancelledError)) {
          await this.connectionFailed(error);
        }
      }
      return;
    }

    try {
      if (!this.link) await this.connect(epoch);
      this.requireLifecycle(epoch);
      if (!this.sessionOpen) await this.openSession();
      this.requireLifecycle(epoch);
      const desired = this.desired;
      if (this.applied?.generation !== desired.generation) {
        await this.applyCompleteScene(desired, epoch);
      } else {
        await this.renewSession();
      }
      this.requireLifecycle(epoch);
      this.reconnectDelayMillis = MIN_RECONNECT_MILLIS;
      const remaining = Math.max(
        1_000,
        (this.leaseExpiresAtMillis ?? this.scheduler.now()) -
          this.scheduler.now(),
      );
      this.timer = this.scheduler.setTimeout(
        () => void this.scheduleDrain(),
        Math.max(250, Math.floor(remaining / 2)),
      );
    } catch (error) {
      if (!(error instanceof LifecycleCancelledError)) {
        await this.connectionFailed(error);
      }
    }
  }

  private async connect(epoch: number): Promise<void> {
    const descriptors = await this.transport.enumerate();
    this.requireLifecycle(epoch);
    const matches: Array<{
      descriptor: HidDeviceDescriptor;
      capabilities: DeviceCapabilities;
    }> = [];
    const candidates = descriptors.filter(isUsbLeftCandidate);
    const candidateErrors: string[] = [];
    for (const descriptor of candidates) {
      let probeConnection: HidConnection | undefined;
      try {
        probeConnection = await this.transport.open(descriptor.path);
        this.requireLifecycle(epoch);
        const capabilities = decodeGenericCapabilityFeature(
          await probeConnection.getFeatureReport(
            GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID,
            GENERIC_HID_HOST_REPORT_BYTES,
          ),
        );
        requireCompleteGlove80(capabilities);
        matches.push({ descriptor, capabilities });
      } catch (error) {
        if (error instanceof LifecycleCancelledError) throw error;
        candidateErrors.push(errorMessage(error));
      } finally {
        await probeConnection?.close().catch(() => undefined);
      }
    }
    if (matches.length !== 1) {
      const detail =
        matches.length === 0
          ? candidates.length === 1
            ? candidateErrors[0] ??
              "The Glove80 does not expose the 80-cell capability feature."
            : "No Glove80 exposing the 80-cell vendor collection was found."
          : "More than one 80-cell Glove80 vendor collection was found; refusing an ambiguous target.";
      this.update({
        connection: "unavailable",
        desiredGeneration: this.desired?.generation,
        detail,
      });
      throw new Error(detail);
    }

    const { descriptor, capabilities: featureCapabilities } =
      matches[0]!;
    const connection = await this.transport.open(descriptor.path);
    this.requireLifecycle(epoch);
    const link = new HidPacketLink(connection);
    const candidateSession = this.session ?? this.createSessionId();
    const resumeOpenSession = this.sessionOpen;
    try {
      const response = await link.exchange(
        this.nextPacketSequence(),
        {
          kind: PacketKind.CapabilityQuery,
          sessionId: candidateSession,
        },
        PacketKind.CapabilityResponse,
      );
      this.requireLifecycle(epoch);
      if (
        response.kind !== PacketKind.CapabilityResponse ||
        response.sessionId !== candidateSession
      ) {
        throw new Error("Capability response belongs to another session.");
      }
      requireCompleteGlove80(response.capabilities);
      if (
        JSON.stringify(response.capabilities) !==
        JSON.stringify(featureCapabilities)
      ) {
        throw new Error(
          "Live capability handshake disagrees with the read-only feature report.",
        );
      }
      let resumed = false;
      if (resumeOpenSession) {
        const status = await link.exchange(
          this.nextPacketSequence(),
          {
            kind: PacketKind.StatusQuery,
            sessionId: candidateSession,
          },
          PacketKind.StatusResponse,
        );
        this.requireLifecycle(epoch);
        resumed =
          status.kind === PacketKind.StatusResponse &&
          status.status === SessionStatus.Active;
      }
      this.link = link;
      this.session = candidateSession;
      this.sessionOpen = resumed;
      this.capabilitiesValue = response.capabilities;
      this.descriptor = descriptor;
      this.update({
        connection: "connected",
        desiredGeneration: this.desired?.generation,
        capabilities: this.capabilitiesValue,
        descriptor,
        detail: "All 80 cells and both-half acknowledgements are available.",
      });
    } catch (error) {
      await link.close().catch(() => undefined);
      throw error;
    }
  }

  private async openSession(): Promise<void> {
    const response = await this.exchange(
      {
        kind: PacketKind.OpenSession,
        sessionId: this.requireSession(),
        leaseMillis: this.effectiveLeaseMillis(),
      },
      PacketKind.CommandResult,
    );
    requireCommandResult(
      response,
      CommandKind.OpenSession,
      CommandResultCode.Accepted,
    );
    this.sessionOpen = true;
  }

  private async applyCompleteScene(
    scene: SurfaceScene,
    epoch: number,
  ): Promise<void> {
    const desired = {
      sessionId: this.requireSession(),
      generation: sceneGeneration(scene.generation),
      leaseMillis: this.effectiveLeaseMillis(),
      brightness: scene.brightness,
      cells: scene.cells,
    };
    validateDesiredScene(desired, this.requireCapabilities());
    const packets = packetsForCompleteScene(desired);
    for (const packet of packets.slice(0, -1)) {
      const response = await this.exchange(
        packet,
        PacketKind.CommandResult,
      );
      requireCommandResult(
        response,
        CommandKind.SceneFragment,
        CommandResultCode.Accepted,
      );
      this.requireLifecycle(epoch);
      if (
        this.desired?.generation !== scene.generation ||
        sceneFingerprint(this.desired) !== sceneFingerprint(scene)
      ) {
        // Finish no more fragments from a superseded generation. Firmware
        // never applies them without the matching commit.
        this.drainAgain = true;
        return;
      }
    }

    const commit = packets.at(-1)!;
    this.requireLifecycle(epoch);
    const result = await this.exchange(
      commit,
      PacketKind.CommandResult,
    );
    if (
      result.kind !== PacketKind.CommandResult ||
      result.command !== CommandKind.SceneCommit ||
      (result.result !== CommandResultCode.Applied &&
        result.result !== CommandResultCode.Partial) ||
      result.centralGeneration !== desired.generation
    ) {
      throw new Error("Keyboard rejected or contradicted the atomic scene commit.");
    }
    const status = await this.readStatus(desired.generation);
    const disposition =
      result.result === CommandResultCode.Applied &&
      status.rightStatus === RightHalfStatus.Applied &&
      status.rightGeneration === desired.generation
        ? "applied"
        : "partial";
    this.applied = {
      generation: desired.generation,
      leftGeneration: status.centralGeneration,
      rightGeneration: status.rightGeneration,
      disposition,
    };
    this.leaseExpiresAtMillis =
      this.scheduler.now() + status.leaseRemainingMillis;
    this.update({
      connection: disposition === "applied" ? "connected" : "partial",
      desiredGeneration: this.desired?.generation,
      applied: this.applied,
      leaseExpiresAtMillis: this.leaseExpiresAtMillis,
      capabilities: this.capabilitiesValue,
      descriptor: this.descriptor,
      detail:
        disposition === "applied"
          ? "One complete scene is acknowledged on all 80 cells."
          : "The left half applied the scene; the right half has not acknowledged this generation.",
    });
  }

  private async renewSession(): Promise<void> {
    const response = await this.exchange(
      {
        kind: PacketKind.RenewSession,
        sessionId: this.requireSession(),
        leaseMillis: this.effectiveLeaseMillis(),
      },
      PacketKind.CommandResult,
    );
    requireCommandResult(
      response,
      CommandKind.RenewSession,
      CommandResultCode.Accepted,
    );
    const status = await this.readStatus(this.applied!.generation);
    this.applied = {
      generation: this.applied!.generation,
      leftGeneration: status.centralGeneration,
      rightGeneration: status.rightGeneration,
      disposition:
        status.rightStatus === RightHalfStatus.Applied &&
        status.rightGeneration === this.applied!.generation
          ? "applied"
          : "partial",
    };
    this.leaseExpiresAtMillis =
      this.scheduler.now() + status.leaseRemainingMillis;
    this.update({
      connection:
        this.applied.disposition === "applied" ? "connected" : "partial",
      desiredGeneration: this.desired?.generation,
      applied: this.applied,
      leaseExpiresAtMillis: this.leaseExpiresAtMillis,
      capabilities: this.capabilitiesValue,
      descriptor: this.descriptor,
      detail:
        this.applied.disposition === "applied"
          ? "The complete 80-cell scene lease is healthy."
          : "The lease is healthy on the left half; the right half is stale.",
    });
  }

  private async readStatus(
    generation: SceneGeneration,
  ): Promise<Extract<Packet, { kind: PacketKind.StatusResponse }>> {
    const response = await this.exchange(
      {
        kind: PacketKind.StatusQuery,
        sessionId: this.requireSession(),
      },
      PacketKind.StatusResponse,
    );
    if (
      response.kind !== PacketKind.StatusResponse ||
      response.status !== SessionStatus.Active ||
      response.centralGeneration !== generation ||
      response.leaseRemainingMillis === 0
    ) {
      throw new Error("Keyboard status does not confirm the committed generation.");
    }
    return response;
  }

  private async closeSession(): Promise<void> {
    if (!this.link || !this.session || !this.sessionOpen) return;
    const response = await this.exchange(
      {
        kind: PacketKind.CloseSession,
        sessionId: this.session,
      },
      PacketKind.CommandResult,
    );
    requireCommandResult(
      response,
      CommandKind.CloseSession,
      CommandResultCode.Closed,
    );
    this.sessionOpen = false;
    this.applied = undefined;
    this.leaseExpiresAtMillis = undefined;
  }

  private exchange(
    packet: Packet,
    expected: PacketKind,
  ): Promise<Packet> {
    if (!this.link) throw new Error("The 80-cell HID link is not connected.");
    return this.link.exchange(
      this.nextPacketSequence(),
      packet,
      expected,
    );
  }

  private async connectionFailed(error: unknown): Promise<void> {
    await this.closeLink(true);
    this.applied = undefined;
    this.leaseExpiresAtMillis = undefined;
    if (!this.enabled || this.paused || !this.desired) return;
    const delay = this.reconnectDelayMillis;
    this.reconnectDelayMillis = Math.min(
      MAX_RECONNECT_MILLIS,
      delay * 2,
    );
    this.update({
      connection: "reconnecting",
      desiredGeneration: this.desired.generation,
      capabilities: this.capabilitiesValue,
      descriptor: this.descriptor,
      detail: `${errorMessage(error)} Retrying in ${delay} ms; firmware lease expiry remains the fail-safe.`,
    });
    this.timer = this.scheduler.setTimeout(
      () => void this.scheduleDrain(),
      delay,
    );
  }

  private async closeLink(preserveSession: boolean): Promise<void> {
    const link = this.link;
    this.link = undefined;
    if (!preserveSession) {
      this.session = undefined;
      this.sessionOpen = false;
    }
    if (link) await link.close().catch(() => undefined);
  }

  private effectiveLeaseMillis(): number {
    return Math.min(
      this.leaseMillis,
      this.capabilitiesValue?.maxLeaseMillis ?? this.leaseMillis,
    );
  }

  private requireSession(): SessionId {
    if (!this.session) throw new Error("Surface session is unavailable.");
    return this.session;
  }

  private requireCapabilities(): DeviceCapabilities {
    if (!this.capabilitiesValue) {
      throw new Error("Surface capabilities are unavailable.");
    }
    return this.capabilitiesValue;
  }

  private nextPacketSequence(): number {
    this.packetSequence =
      this.packetSequence === 0xffff ? 1 : this.packetSequence + 1;
    return this.packetSequence;
  }

  private requireLifecycle(
    epoch: number,
    requireRunning = true,
  ): void {
    if (
      this.lifecycleEpoch !== epoch ||
      (requireRunning && (!this.enabled || this.paused))
    ) {
      throw new LifecycleCancelledError();
    }
  }

  private cancelTimer(): void {
    if (this.timer === undefined) return;
    this.scheduler.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private update(snapshot: SurfaceDeviceSnapshot): void {
    this.snapshotValue = cloneSnapshot(snapshot);
    for (const listener of this.listeners) listener(this.snapshot());
  }
}

class HidPacketLink {
  private busy = false;

  constructor(private readonly connection: HidConnection) {}

  async exchange(
    sequence: number,
    request: Packet,
    expected: PacketKind,
  ): Promise<Packet> {
    if (this.busy) {
      throw new Error("Only one bounded HID exchange may be active at a time.");
    }
    this.busy = true;
    try {
      const deadline = Date.now() + EXCHANGE_TIMEOUT_MILLIS;
      await this.connection.write(
        encodeGenericHidOutput(sequence, request),
      );
      for (let count = 0; count < MAX_UNSOLICITED_PACKETS; count += 1) {
        const remainingMillis = deadline - Date.now();
        if (remainingMillis <= 0) {
          throw new Error("Keyboard response timed out.");
        }
        const report = await this.connection.read(
          remainingMillis,
        );
        if (!report) throw new Error("Keyboard response timed out.");
        const [responseSequence, response] =
          decodeGenericHidInput(report);
        if (responseSequence !== sequence) continue;
        if (packetSessionId(response) !== packetSessionId(request)) {
          throw new Error("Keyboard response belongs to another session.");
        }
        if (response.kind === PacketKind.DeviceError) {
          if (response.requestKind !== request.kind) {
            throw new Error(
              "Keyboard error response refers to another request.",
            );
          }
          throw new Error(
            `Keyboard reported ${response.code} for packet ${response.requestKind}.`,
          );
        }
        if (response.kind !== expected) {
          throw new Error(
            `Expected response ${expected}, received ${response.kind}.`,
          );
        }
        return response;
      }
      throw new Error("Too many unrelated keyboard packets preceded the response.");
    } finally {
      this.busy = false;
    }
  }

  close(): Promise<void> {
    return this.connection.close();
  }
}

function isUsbLeftCandidate(
  descriptor: HidDeviceDescriptor,
): boolean {
  return (
    descriptor.vendorId === GLOVE80_VENDOR_ID &&
    descriptor.productId === GLOVE80_LEFT_PRODUCT_ID
  );
}

function requireCompleteGlove80(capabilities: DeviceCapabilities): void {
  validateCapabilities(capabilities);
  const expected = simulatedGlove80Capabilities();
  if (
    capabilities.topologyId !== expected.topologyId ||
    capabilities.availableCells.length !== 80 ||
    capabilities.availableCells.some((cell, index) => cell !== index) ||
    !capabilities.supportsInputEvents ||
    !capabilities.supportsRightHalfAcknowledgement ||
    !capabilities.supportedEffects.includes("solid") ||
    !capabilities.supportedEffects.includes("pulse") ||
    capabilities.maxSceneCells !== 80 ||
    capabilities.maxLeaseMillis < 1_000 ||
    capabilities.maxBrightness < 1
  ) {
    throw new Error(
      "The connected vendor collection does not expose the complete 80-cell Glove80 contract.",
    );
  }
}

function requireCommandResult(
  packet: Packet,
  command: CommandKind,
  result: CommandResultCode,
): void {
  if (
    packet.kind !== PacketKind.CommandResult ||
    packet.command !== command ||
    packet.result !== result
  ) {
    throw new Error(
      `Keyboard did not acknowledge command ${command} with result ${result}.`,
    );
  }
}

function randomSessionId(): SessionId {
  return sessionId(randomBytes(4).readUInt32LE(0) || 1);
}

function cloneScene(scene: SurfaceScene): SurfaceScene {
  sceneGeneration(scene.generation);
  return {
    generation: scene.generation,
    brightness: scene.brightness,
    cells: scene.cells.map((cell) => ({
      cellId: cell.cellId,
      color: { ...cell.color },
      effect: cell.effect,
    })),
  };
}

function sceneFingerprint(scene: SurfaceScene): string {
  const cells = [...scene.cells]
    .sort((left, right) => left.cellId - right.cellId)
    .map((cell) => [
      cell.cellId,
      cell.color.red,
      cell.color.green,
      cell.color.blue,
      cell.effect,
    ]);
  return JSON.stringify([scene.brightness, cells]);
}

function cloneSnapshot(
  snapshot: SurfaceDeviceSnapshot,
): SurfaceDeviceSnapshot {
  return {
    ...snapshot,
    capabilities: snapshot.capabilities
      ? {
          ...snapshot.capabilities,
          availableCells: [...snapshot.capabilities.availableCells],
          supportedEffects: [...snapshot.capabilities.supportedEffects],
        }
      : undefined,
    descriptor: snapshot.descriptor
      ? { ...snapshot.descriptor }
      : undefined,
    applied: snapshot.applied ? { ...snapshot.applied } : undefined,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class LifecycleCancelledError extends Error {
  constructor() {
    super("Surface lifecycle changed while an operation was in flight.");
    this.name = "LifecycleCancelledError";
  }
}
