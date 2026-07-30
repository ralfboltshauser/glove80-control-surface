import { randomBytes } from "node:crypto";

import {
  CommandKind,
  CommandResultCode,
  GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID,
  GENERIC_HID_HOST_REPORT_BYTES,
  GENERIC_HID_INPUT_REPORT_ID,
  PacketKind,
  RightHalfStatus,
  SessionStatus,
  cellId,
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
  type DeviceEvent,
  type Packet,
  type SceneGeneration,
  type SessionId,
} from "@glove80-control-surface/surface-protocol";
import glove80Topology from "../../../../firmware/topology/glove80-rgb-80-v1.json";

import type {
  HidConnection,
  HidDeviceDescriptor,
  HidTransport,
} from "./hidTransport";

const GLOVE80_VENDOR_ID = 0x16c0;
const GLOVE80_LEFT_PRODUCT_ID = 0x27db;
const EXCHANGE_TIMEOUT_MILLIS = 1_500;
const RIGHT_ACK_WAIT_MILLIS = 4_000;
const RIGHT_ACK_POLL_MILLIS = 100;
const DEFAULT_LEASE_MILLIS = 16_000;
const MIN_RECONNECT_MILLIS = 250;
const MAX_RECONNECT_MILLIS = 8_000;
const POSITION_TO_PHYSICAL_CELL = validatedPermutation(
  glove80Topology.zmkPositionToCell,
  "zmkPositionToCell",
);
const PHYSICAL_CELL_TO_LED_CHANNEL = validatedPermutation(
  glove80Topology.cellToLedChannel,
  "cellToLedChannel",
);

export interface SurfaceScene {
  readonly generation: number;
  readonly brightness: number;
  readonly cells: readonly CellPresentation[];
  readonly primaryActionCells: readonly number[];
  readonly secondaryActionCells: readonly number[];
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
  wait(delayMillis: number): Promise<void>;
}

const systemScheduler: SurfaceScheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMillis) => setTimeout(callback, delayMillis),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  wait: (delayMillis) =>
    new Promise((resolve) => setTimeout(resolve, delayMillis)),
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
  private connectionFailure?: Promise<void>;
  private lifecycleEpoch = 0;
  private interactionEpoch?: number;
  private interactionBank?: "primary" | "secondary";
  private interactionSequence?: number;
  private interactionResetRequired = false;
  private readonly interactionPressed = new Set<number>();
  private snapshotValue: SurfaceDeviceSnapshot = {
    connection: "disabled",
    detail: "Real keyboard output is off.",
  };
  private readonly listeners = new Set<
    (snapshot: SurfaceDeviceSnapshot) => void
  >();
  private readonly eventListeners = new Set<
    (event: DeviceEvent) => void
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

  subscribeEvents(listener: (event: DeviceEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
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
          primaryActionCells: next.primaryActionCells.map(cellId),
          secondaryActionCells: next.secondaryActionCells.map(cellId),
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
    if (this.paused) {
      try {
        await this.closeSession();
        this.requireLifecycle(epoch, false);
        this.applied = undefined;
        this.leaseExpiresAtMillis = undefined;
        this.update({
          connection: "paused",
          desiredGeneration: this.desired?.generation,
          capabilities: this.capabilitiesValue,
          descriptor: this.descriptor,
          detail:
            "The close command was acknowledged; each half also retains its independent expiry fail-safe.",
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
      if (this.interactionResetRequired && this.sessionOpen) {
        await this.closeSession();
        this.requireLifecycle(epoch);
      }
      if (!this.desired) {
        await this.closeSession();
        this.requireLifecycle(epoch);
        this.applied = undefined;
        this.leaseExpiresAtMillis = undefined;
        this.update({
          connection: "connected",
          capabilities: this.capabilitiesValue,
          descriptor: this.descriptor,
          detail:
            "The Glove80 control endpoint is connected; no scene is assigned.",
        });
        return;
      }
      if (!this.sessionOpen) await this.openSession();
      this.requireLifecycle(epoch);
      const desired = this.desired;
      if (this.applied?.generation !== desired.generation) {
        await this.applyCompleteScene(desired, epoch);
      } else {
        await this.renewSession(epoch);
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
    const candidates = [...new Map(
      descriptors
        .filter(isUsbLeftCandidate)
        .map((descriptor) => [descriptor.path, descriptor]),
    ).values()];
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
    const candidateSession = this.session ?? this.createSessionId();
    const resumeOpenSession = this.sessionOpen;
    this.resetInteraction();
    let link!: HidPacketLink;
    link = new HidPacketLink(
      connection,
      (packet) => this.publishDeviceEvent(packet, candidateSession),
      (error) => {
        if (this.link !== link || !this.enabled || this.paused) return;
        void this.connectionFailed(error);
      },
    );
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
        if (
          resumed &&
          status.kind === PacketKind.StatusResponse &&
          (status.interactionEpoch !== undefined ||
            this.interactionResetRequired)
        ) {
          const closed = await link.exchange(
            this.nextPacketSequence(),
            {
              kind: PacketKind.CloseSession,
              sessionId: candidateSession,
            },
            PacketKind.CommandResult,
          );
          requireCommandResult(
            closed,
            CommandKind.CloseSession,
            CommandResultCode.Closed,
          );
          resumed = false;
          this.interactionResetRequired = false;
        }
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
    // A newly accepted firmware session cannot retain the old interaction.
    this.interactionResetRequired = false;
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
      cells: scene.cells
        .map((cell) => ({
          ...cell,
          cellId: cellId(
            PHYSICAL_CELL_TO_LED_CHANNEL[Number(cell.cellId)]!,
          ),
        }))
        .sort((left, right) => Number(left.cellId) - Number(right.cellId)),
      primaryActionCells: scene.primaryActionCells.map((cell) =>
        cellId(PHYSICAL_CELL_TO_LED_CHANNEL[cell]!),
      ),
      secondaryActionCells: scene.secondaryActionCells.map((cell) =>
        cellId(PHYSICAL_CELL_TO_LED_CHANNEL[cell]!),
      ),
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
    const status = await this.readStatusAwaitingRight(
      desired.generation,
      epoch,
    );
    const disposition =
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

  private async renewSession(epoch: number): Promise<void> {
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
    const status = await this.readStatusAwaitingRight(
      this.applied!.generation,
      epoch,
    );
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
    if (
      this.interactionEpoch !== undefined &&
      response.interactionEpoch !== this.interactionEpoch
    ) {
      this.invalidateInteraction(this.requireSession());
    }
    return response;
  }

  private async readStatusAwaitingRight(
    generation: SceneGeneration,
    epoch: number,
  ): Promise<Extract<Packet, { kind: PacketKind.StatusResponse }>> {
    this.requireLifecycle(epoch);
    let status = await this.readStatus(generation);
    const attempts = Math.ceil(
      RIGHT_ACK_WAIT_MILLIS / RIGHT_ACK_POLL_MILLIS,
    );
    for (
      let attempt = 0;
      status.rightStatus === RightHalfStatus.Syncing &&
      attempt < attempts;
      attempt += 1
    ) {
      await this.scheduler.wait(RIGHT_ACK_POLL_MILLIS);
      this.requireLifecycle(epoch);
      status = await this.readStatus(generation);
    }
    return status;
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
    this.interactionResetRequired = false;
    this.resetInteraction();
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
    if (this.connectionFailure) return this.connectionFailure;
    this.connectionFailure = this.handleConnectionFailure(error).finally(
      () => {
        this.connectionFailure = undefined;
      },
    );
    return this.connectionFailure;
  }

  private async handleConnectionFailure(error: unknown): Promise<void> {
    await this.closeLink(true);
    this.applied = undefined;
    this.leaseExpiresAtMillis = undefined;
    if (!this.enabled || this.paused) return;
    const delay = this.reconnectDelayMillis;
    this.reconnectDelayMillis = Math.min(
      MAX_RECONNECT_MILLIS,
      delay * 2,
    );
    this.update({
      connection: "reconnecting",
      desiredGeneration: this.desired?.generation,
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
    if (this.session) {
      this.invalidateInteraction(this.session);
    } else {
      this.resetInteraction();
    }
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

  private publishDeviceEvent(
    packet: Packet,
    expectedSession = this.session,
  ): void {
    if (packet.kind === PacketKind.CellEvent) {
      packet = {
        ...packet,
        cellId: cellId(
          POSITION_TO_PHYSICAL_CELL[Number(packet.cellId)]!,
        ),
      };
    }
    if (
      !expectedSession ||
      packetSessionId(packet) !== expectedSession
    ) {
      return;
    }
    const event = packetToDeviceEvent(packet);
    if (!event) return;
    switch (event.kind) {
      case "interactionModeEntered":
        if (this.interactionEpoch !== undefined) {
          this.invalidateInteraction(expectedSession);
          return;
        }
        this.interactionEpoch = event.interactionEpoch;
        this.interactionBank = event.bank;
        this.interactionSequence = event.sequence;
        this.interactionPressed.clear();
        this.publishEvent(event);
        return;
      case "cell": {
        const cell = Number(event.event.cellId);
        if (
          this.interactionEpoch !== event.event.interactionEpoch ||
          this.interactionBank !== event.event.bank ||
          !isNextEventSequence(
            this.interactionSequence,
            event.event.sequence,
          ) ||
          (event.event.kind === "down"
            ? this.interactionPressed.has(cell)
            : !this.interactionPressed.has(cell))
        ) {
          this.invalidateInteraction(expectedSession);
          return;
        }
        this.interactionSequence = event.event.sequence;
        if (event.event.kind === "down") {
          this.interactionPressed.add(cell);
        } else {
          this.interactionPressed.delete(cell);
        }
        this.publishEvent(event);
        return;
      }
      case "interactionModeExited":
        if (
          this.interactionEpoch !== event.interactionEpoch ||
          this.interactionBank !== event.bank ||
          !isNextEventSequence(this.interactionSequence, event.sequence)
        ) {
          this.invalidateInteraction(expectedSession);
          return;
        }
        this.publishEvent(event);
        this.resetInteraction();
        return;
      case "sceneExpired":
        // The firmware has already destroyed the expired session. Fail any
        // host interaction closed without racing a redundant CloseSession
        // against the replacement session.
        this.invalidateInteraction(expectedSession, false);
        this.sessionOpen = false;
        this.applied = undefined;
        this.leaseExpiresAtMillis = undefined;
        this.cancelTimer();
        this.update({
          connection: "connected",
          desiredGeneration: this.desired?.generation,
          capabilities: this.capabilitiesValue,
          descriptor: this.descriptor,
          detail:
            "The firmware lease expired and cleared the temporary scene; restoring desired state.",
        });
        this.publishEvent(event);
        void this.scheduleDrain();
        return;
      default:
        this.publishEvent(event);
    }
  }

  private invalidateInteraction(
    session: SessionId,
    requireSessionReset = true,
  ): void {
    if (
      this.interactionEpoch !== undefined &&
      this.interactionSequence !== undefined
    ) {
      this.publishEvent({
        kind: "interactionModeExited",
        sessionId: session,
        sequence: this.interactionSequence,
        interactionEpoch: this.interactionEpoch,
        bank: this.interactionBank ?? "primary",
      });
    }
    if (
      requireSessionReset &&
      this.enabled &&
      !this.paused &&
      this.sessionOpen
    ) {
      this.interactionResetRequired = true;
      void this.scheduleDrain();
    }
    this.resetInteraction();
  }

  private resetInteraction(): void {
    this.interactionEpoch = undefined;
    this.interactionBank = undefined;
    this.interactionSequence = undefined;
    this.interactionPressed.clear();
  }

  private publishEvent(event: DeviceEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }
}

function validatedPermutation(
  candidate: readonly number[],
  label: string,
): readonly number[] {
  if (
    candidate.length !== 80 ||
    [...candidate]
      .sort((left, right) => left - right)
      .some((value, index) => value !== index)
  ) {
    throw new Error(`${label} must be a permutation of 0 through 79.`);
  }
  return Object.freeze([...candidate]);
}

class HidPacketLink {
  private closed = false;
  private pending?: {
    readonly sequence: number;
    readonly request: Packet;
    readonly expected: PacketKind;
    readonly resolve: (packet: Packet) => void;
    readonly reject: (error: Error) => void;
    readonly timeout: ReturnType<typeof setTimeout>;
  };

  constructor(
    private readonly connection: HidConnection,
    private readonly onEvent: (packet: Packet) => void,
    private readonly onFatal: (error: Error) => void,
  ) {
    void this.readLoop();
  }

  async exchange(
    sequence: number,
    request: Packet,
    expected: PacketKind,
  ): Promise<Packet> {
    if (this.closed) {
      throw new Error("The HID link is closed.");
    }
    if (this.pending) {
      throw new Error("Only one bounded HID exchange may be active at a time.");
    }
    return new Promise<Packet>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending?.sequence !== sequence) return;
        this.pending = undefined;
        reject(new Error("Keyboard response timed out."));
      }, EXCHANGE_TIMEOUT_MILLIS);
      this.pending = {
        sequence,
        request,
        expected,
        resolve,
        reject,
        timeout,
      };
      void this.connection
        .write(encodeGenericHidOutput(sequence, request))
        .catch((error: unknown) => {
          if (this.pending?.sequence !== sequence) return;
          clearTimeout(this.pending.timeout);
          this.pending = undefined;
          reject(
            error instanceof Error
              ? error
              : new Error(String(error)),
          );
        });
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.pending) {
      clearTimeout(this.pending.timeout);
      this.pending.reject(new Error("The HID link was closed."));
      this.pending = undefined;
    }
    await this.connection.close();
  }

  private async readLoop(): Promise<void> {
    while (!this.closed) {
      try {
        const report = await this.connection.read(250);
        if (!report) {
          await new Promise<void>((resolve) => setImmediate(resolve));
          continue;
        }
        if (
          report.length === GENERIC_HID_HOST_REPORT_BYTES &&
          report[0] !== GENERIC_HID_INPUT_REPORT_ID
        ) {
          continue;
        }
        if (
          report.length !== GENERIC_HID_HOST_REPORT_BYTES &&
          report.length !== GENERIC_HID_HOST_REPORT_BYTES - 1
        ) {
          continue;
        }
        const [sequence, packet] = decodeGenericHidInput(report);
        if (isDeviceEventPacket(packet)) {
          this.onEvent(packet);
          continue;
        }
        const pending = this.pending;
        if (!pending || sequence !== pending.sequence) continue;
        clearTimeout(pending.timeout);
        this.pending = undefined;
        if (
          packetSessionId(packet) !==
          packetSessionId(pending.request)
        ) {
          pending.reject(
            new Error("Keyboard response belongs to another session."),
          );
          continue;
        }
        if (packet.kind === PacketKind.DeviceError) {
          pending.reject(
            packet.requestKind !== pending.request.kind
              ? new Error(
                  "Keyboard error response refers to another request.",
                )
              : new Error(
                  `Keyboard reported ${packet.code} for packet ${packet.requestKind}.`,
                ),
          );
          continue;
        }
        if (packet.kind !== pending.expected) {
          pending.reject(
            new Error(
              `Expected response ${pending.expected}, received ${packet.kind}.`,
            ),
          );
          continue;
        }
        pending.resolve(packet);
      } catch (error) {
        if (this.closed) return;
        const pending = this.pending;
        if (pending) {
          clearTimeout(pending.timeout);
          this.pending = undefined;
          pending.reject(
            error instanceof Error
              ? error
              : new Error(String(error)),
          );
        }
        if (!pending) {
          this.onFatal(
            error instanceof Error
              ? error
              : new Error(String(error)),
          );
        }
        return;
      }
    }
  }
}

function isDeviceEventPacket(packet: Packet): boolean {
  return (
    packet.kind === PacketKind.CellEvent ||
    packet.kind === PacketKind.InteractionModeEntered ||
    packet.kind === PacketKind.InteractionModeExited ||
    packet.kind === PacketKind.SceneExpired
  );
}

function isNextEventSequence(
  previous: number | undefined,
  next: number,
): boolean {
  if (previous === undefined) return false;
  return next === (previous === 0xffff_ffff ? 1 : previous + 1);
}

function packetToDeviceEvent(packet: Packet): DeviceEvent | undefined {
  switch (packet.kind) {
    case PacketKind.CellEvent:
      return {
        kind: "cell",
        event: {
          sessionId: packet.sessionId,
          sequence: packet.eventSequence,
          interactionEpoch: packet.interactionEpoch,
          bank: packet.bank,
          cellId: packet.cellId,
          kind: packet.eventKind,
        },
      };
    case PacketKind.InteractionModeEntered:
      return {
        kind: "interactionModeEntered",
        sessionId: packet.sessionId,
        sequence: packet.eventSequence,
        interactionEpoch: packet.interactionEpoch,
        bank: packet.bank,
      };
    case PacketKind.InteractionModeExited:
      return {
        kind: "interactionModeExited",
        sessionId: packet.sessionId,
        sequence: packet.eventSequence,
        interactionEpoch: packet.interactionEpoch,
        bank: packet.bank,
      };
    case PacketKind.SceneExpired:
      return {
        kind: "sceneExpired",
        sessionId: packet.sessionId,
        generation: packet.generation,
      };
    default:
      return undefined;
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
    primaryActionCells: [...scene.primaryActionCells],
    secondaryActionCells: [...scene.secondaryActionCells],
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
  return JSON.stringify([
    scene.brightness,
    cells,
    [...scene.primaryActionCells].sort((a, b) => a - b),
    [...scene.secondaryActionCells].sort((a, b) => a - b),
  ]);
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
