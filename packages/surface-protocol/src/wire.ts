import {
  GLOVE80_CELL_COUNT,
  ProtocolError,
  cellId,
  sceneGeneration,
  sessionId,
  validateCapabilities,
  validatePresentation,
  type CellEventKind,
  type CellId,
  type CellPresentation,
  type DeviceCapabilities,
  type DeviceErrorCode,
  type EffectKind,
  type SceneGeneration,
  type SessionId,
} from "./types";

const MAGIC_0 = 0x47;
const MAGIC_1 = 0x38;
const VERSION = 2;
const HEADER_BYTES = 8;
const CHECKSUM_BYTES = 4;
const MAX_PAYLOAD_BYTES = 64 - HEADER_BYTES - CHECKSUM_BYTES;
const CELL_WIRE_BYTES = 6;
const FRAGMENT_HEADER_BYTES = 12;
const CAPABILITY_BITMAP_BYTES = GLOVE80_CELL_COUNT / 8;
const MAX_TOPOLOGY_ID_BYTES = 20;
const MAX_FIRMWARE_BUILD_ID_BYTES = 8;

export const MAX_PACKET_BYTES = 64;
export const MAX_FRAGMENT_CELLS = Math.floor(
  (MAX_PAYLOAD_BYTES - FRAGMENT_HEADER_BYTES) / CELL_WIRE_BYTES,
);

export type PacketDirection = "hostToDevice" | "deviceToHost";

export enum PacketKind {
  CapabilityQuery = 1,
  OpenSession = 2,
  RenewSession = 3,
  SceneFragment = 4,
  SceneCommit = 5,
  CloseSession = 6,
  CellEvent = 7,
  CapabilityResponse = 8,
  StatusQuery = 9,
  StatusResponse = 10,
  CommandResult = 11,
  DeviceError = 12,
  InteractionModeEntered = 13,
  InteractionModeExited = 14,
  SceneExpired = 15,
}

export enum CommandKind {
  OpenSession = 2,
  RenewSession = 3,
  SceneFragment = 4,
  SceneCommit = 5,
  CloseSession = 6,
}

export enum CommandResultCode {
  Accepted = 0,
  Applied = 1,
  Partial = 2,
  Closed = 3,
}

export enum SessionStatus {
  Active = 0,
  Expired = 1,
  Unknown = 2,
}

export enum RightHalfStatus {
  Absent = 0,
  Incompatible = 1,
  Syncing = 2,
  Applied = 3,
  PowerLimited = 4,
}

export interface SceneFragment {
  readonly sessionId: SessionId;
  readonly generation: SceneGeneration;
  readonly fragmentIndex: number;
  readonly fragmentCount: number;
  readonly totalCells: number;
  readonly cells: readonly CellPresentation[];
}

export type Packet =
  | { readonly kind: PacketKind.CapabilityQuery; readonly sessionId: SessionId }
  | {
      readonly kind: PacketKind.CapabilityResponse;
      readonly sessionId: SessionId;
      readonly capabilities: DeviceCapabilities;
    }
  | { readonly kind: PacketKind.StatusQuery; readonly sessionId: SessionId }
  | {
      readonly kind: PacketKind.StatusResponse;
      readonly sessionId: SessionId;
      readonly status: SessionStatus;
      readonly leaseRemainingMillis: number;
      readonly centralGeneration?: SceneGeneration;
      readonly rightGeneration?: SceneGeneration;
      readonly rightStatus: RightHalfStatus;
      readonly interactionEpoch?: number;
    }
  | {
      readonly kind: PacketKind.OpenSession | PacketKind.RenewSession;
      readonly sessionId: SessionId;
      readonly leaseMillis: number;
    }
  | { readonly kind: PacketKind.SceneFragment; readonly fragment: SceneFragment }
  | {
      readonly kind: PacketKind.SceneCommit;
      readonly sessionId: SessionId;
      readonly generation: SceneGeneration;
      readonly fragmentCount: number;
      readonly totalCells: number;
      readonly leaseMillis: number;
      readonly brightness: number;
      readonly sceneChecksum: number;
    }
  | { readonly kind: PacketKind.CloseSession; readonly sessionId: SessionId }
  | {
      readonly kind: PacketKind.CommandResult;
      readonly sessionId: SessionId;
      readonly command: CommandKind;
      readonly result: CommandResultCode;
      readonly centralGeneration?: SceneGeneration;
      readonly rightGeneration?: SceneGeneration;
    }
  | {
      readonly kind: PacketKind.DeviceError;
      readonly sessionId: SessionId;
      readonly requestKind: PacketKind;
      readonly code: DeviceErrorCode;
    }
  | {
      readonly kind: PacketKind.InteractionModeEntered | PacketKind.InteractionModeExited;
      readonly sessionId: SessionId;
      readonly eventSequence: number;
      readonly interactionEpoch: number;
    }
  | {
      readonly kind: PacketKind.CellEvent;
      readonly sessionId: SessionId;
      readonly eventSequence: number;
      readonly interactionEpoch: number;
      readonly cellId: CellId;
      readonly eventKind: CellEventKind;
    }
  | {
      readonly kind: PacketKind.SceneExpired;
      readonly sessionId: SessionId;
      readonly generation: SceneGeneration;
    };

type WireErrorCode =
  | "invalidPacketLength"
  | "invalidMagic"
  | "unsupportedVersion"
  | "unknownPacketKind"
  | "unknownCommandKind"
  | "unknownCommandResult"
  | "unknownSessionStatus"
  | "unknownRightHalfStatus"
  | "unknownDeviceError"
  | "invalidErrorRequestKind"
  | "invalidPayloadLength"
  | "lengthMismatch"
  | "checksumMismatch"
  | "payloadTooLarge"
  | "invalidFragmentIndex"
  | "invalidFragmentCellCount"
  | "invalidFragmentLayout"
  | "duplicateFragmentCell"
  | "invalidCommit"
  | "zeroLease"
  | "invalidWireCapabilities"
  | "invalidStatus"
  | "invalidCommandResult"
  | "invalidGenerationState"
  | "zeroInteractionEpoch"
  | "zeroEventSequence"
  | "nonZeroReservedByte"
  | "nonZeroReservedBits"
  | "unknownCellEventKind";

export class WireError extends Error {
  constructor(
    readonly code: WireErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "WireError";
  }
}

export function packetDirection(kind: PacketKind): PacketDirection {
  switch (kind) {
    case PacketKind.CapabilityQuery:
    case PacketKind.OpenSession:
    case PacketKind.RenewSession:
    case PacketKind.SceneFragment:
    case PacketKind.SceneCommit:
    case PacketKind.CloseSession:
    case PacketKind.StatusQuery:
      return "hostToDevice";
    default:
      return "deviceToHost";
  }
}

export function packetSessionId(packet: Packet): SessionId {
  return packet.kind === PacketKind.SceneFragment ? packet.fragment.sessionId : packet.sessionId;
}

export function encodePacket(sequence: number, packet: Packet): Uint8Array {
  assertUnsigned(sequence, 0xffff, "packet sequence");
  const payload = new ByteWriter();
  encodePayload(payload, packet);
  if (payload.length > MAX_PAYLOAD_BYTES) {
    throw new WireError(
      "payloadTooLarge",
      `payload with ${payload.length} bytes cannot fit one packet`,
      payload.length,
    );
  }

  const encoded = new Uint8Array(HEADER_BYTES + payload.length + CHECKSUM_BYTES);
  const view = new DataView(encoded.buffer);
  encoded[0] = MAGIC_0;
  encoded[1] = MAGIC_1;
  encoded[2] = VERSION;
  encoded[3] = packet.kind;
  view.setUint16(4, sequence, true);
  view.setUint16(6, payload.length, true);
  encoded.set(payload.bytes(), HEADER_BYTES);
  view.setUint32(encoded.length - CHECKSUM_BYTES, crc32(encoded.subarray(0, -4)), true);
  return encoded;
}

export function decodePacket(bytes: Uint8Array): readonly [number, Packet] {
  if (bytes.length < HEADER_BYTES + CHECKSUM_BYTES || bytes.length > MAX_PACKET_BYTES) {
    throw new WireError(
      "invalidPacketLength",
      `packet length ${bytes.length} is outside protocol limits`,
      bytes.length,
    );
  }
  if (bytes[0] !== MAGIC_0 || bytes[1] !== MAGIC_1) {
    throw new WireError("invalidMagic", "packet magic is invalid");
  }
  if (bytes[2] !== VERSION) {
    throw new WireError(
      "unsupportedVersion",
      `wire protocol version ${bytes[2]} is unsupported`,
      bytes[2],
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payloadLength = view.getUint16(6, true);
  const expectedLength = HEADER_BYTES + payloadLength + CHECKSUM_BYTES;
  if (bytes.length !== expectedLength) {
    throw new WireError(
      "lengthMismatch",
      `declared payload length ${payloadLength} does not match actual length ${
        bytes.length - HEADER_BYTES - CHECKSUM_BYTES
      }`,
      { declared: payloadLength, actual: bytes.length - HEADER_BYTES - CHECKSUM_BYTES },
    );
  }

  const checksumOffset = bytes.length - CHECKSUM_BYTES;
  if (
    crc32(bytes.subarray(0, checksumOffset)) !== view.getUint32(checksumOffset, true)
  ) {
    throw new WireError("checksumMismatch", "packet checksum does not match");
  }

  const sequence = view.getUint16(4, true);
  const kind = packetKindFromWire(bytes[3]!);
  return [sequence, decodePayload(kind, bytes.subarray(HEADER_BYTES, checksumOffset))];
}

function encodePayload(writer: ByteWriter, packet: Packet): void {
  switch (packet.kind) {
    case PacketKind.CapabilityQuery:
    case PacketKind.StatusQuery:
      writer.u32(validateSession(packet.sessionId));
      return;
    case PacketKind.CapabilityResponse:
      encodeCapabilities(writer, packet.sessionId, packet.capabilities);
      return;
    case PacketKind.StatusResponse:
      validateStatus(
        packet.status,
        packet.leaseRemainingMillis,
        packet.centralGeneration,
        packet.rightGeneration,
        packet.rightStatus,
        packet.interactionEpoch,
      );
      writer
        .u32(validateSession(packet.sessionId))
        .u8(packet.status)
        .u32(packet.leaseRemainingMillis)
        .u32(packet.centralGeneration ?? 0)
        .u32(packet.rightGeneration ?? 0)
        .u8(packet.rightStatus)
        .u32(packet.interactionEpoch ?? 0);
      return;
    case PacketKind.OpenSession:
    case PacketKind.RenewSession:
      validateLease(packet.leaseMillis);
      writer.u32(validateSession(packet.sessionId)).u32(packet.leaseMillis);
      return;
    case PacketKind.SceneFragment:
      encodeFragment(writer, packet.fragment);
      return;
    case PacketKind.SceneCommit:
      validateCommit(
        packet.fragmentCount,
        packet.totalCells,
        packet.leaseMillis,
        packet.sceneChecksum,
      );
      assertUnsigned(packet.brightness, 0xff, "brightness");
      writer
        .u32(validateSession(packet.sessionId))
        .u32(validateGeneration(packet.generation))
        .u8(packet.fragmentCount)
        .u8(packet.totalCells)
        .u32(packet.leaseMillis)
        .u8(packet.brightness)
        .u32(packet.sceneChecksum);
      return;
    case PacketKind.CloseSession:
      writer.u32(validateSession(packet.sessionId));
      return;
    case PacketKind.CommandResult:
      validateCommandResult(
        packet.command,
        packet.result,
        packet.centralGeneration,
        packet.rightGeneration,
      );
      writer
        .u32(validateSession(packet.sessionId))
        .u8(packet.command)
        .u8(packet.result)
        .u32(packet.centralGeneration ?? 0)
        .u32(packet.rightGeneration ?? 0);
      return;
    case PacketKind.DeviceError:
      if (packetDirection(packet.requestKind) !== "hostToDevice") {
        throw new WireError(
          "invalidErrorRequestKind",
          "device error cannot refer to a device-originated packet kind",
          packet.requestKind,
        );
      }
      writer
        .u32(validateSession(packet.sessionId))
        .u8(packet.requestKind)
        .u8(deviceErrorToWire(packet.code));
      return;
    case PacketKind.InteractionModeEntered:
    case PacketKind.InteractionModeExited:
      validateEventSequence(packet.eventSequence);
      validateInteractionEpoch(packet.interactionEpoch);
      writer
        .u32(validateSession(packet.sessionId))
        .u32(packet.eventSequence)
        .u32(packet.interactionEpoch);
      return;
    case PacketKind.CellEvent:
      validateEventSequence(packet.eventSequence);
      validateInteractionEpoch(packet.interactionEpoch);
      writer
        .u32(validateSession(packet.sessionId))
        .u32(packet.eventSequence)
        .u32(packet.interactionEpoch)
        .u8(cellId(packet.cellId))
        .u8(packet.eventKind === "down" ? 0 : 1);
      return;
    case PacketKind.SceneExpired:
      writer
        .u32(validateSession(packet.sessionId))
        .u32(validateGeneration(packet.generation));
  }
}

function decodePayload(kind: PacketKind, bytes: Uint8Array): Packet {
  const reader = new ByteReader(bytes);
  switch (kind) {
    case PacketKind.CapabilityQuery:
    case PacketKind.StatusQuery:
      reader.expectLength(4);
      return { kind, sessionId: sessionId(reader.u32(0)) };
    case PacketKind.CapabilityResponse:
      return decodeCapabilities(reader);
    case PacketKind.StatusResponse: {
      reader.expectLength(22);
      const status = sessionStatusFromWire(reader.u8(4));
      const leaseRemainingMillis = reader.u32(5);
      const centralGeneration = optionalGeneration(reader.u32(9));
      const rightGeneration = optionalGeneration(reader.u32(13));
      const rightStatus = rightHalfStatusFromWire(reader.u8(17));
      const interactionEpoch = optionalNonzero(reader.u32(18));
      validateStatus(
        status,
        leaseRemainingMillis,
        centralGeneration,
        rightGeneration,
        rightStatus,
        interactionEpoch,
      );
      return {
        kind,
        sessionId: sessionId(reader.u32(0)),
        status,
        leaseRemainingMillis,
        centralGeneration,
        rightGeneration,
        rightStatus,
        interactionEpoch,
      };
    }
    case PacketKind.OpenSession:
    case PacketKind.RenewSession: {
      reader.expectLength(8);
      const leaseMillis = reader.u32(4);
      validateLease(leaseMillis);
      return { kind, sessionId: sessionId(reader.u32(0)), leaseMillis };
    }
    case PacketKind.SceneFragment:
      return { kind, fragment: decodeFragment(reader) };
    case PacketKind.SceneCommit: {
      reader.expectLength(19);
      const fragmentCount = reader.u8(8);
      const totalCells = reader.u8(9);
      const leaseMillis = reader.u32(10);
      const checksum = reader.u32(15);
      validateCommit(fragmentCount, totalCells, leaseMillis, checksum);
      return {
        kind,
        sessionId: sessionId(reader.u32(0)),
        generation: sceneGeneration(reader.u32(4)),
        fragmentCount,
        totalCells,
        leaseMillis,
        brightness: reader.u8(14),
        sceneChecksum: checksum,
      };
    }
    case PacketKind.CloseSession:
      reader.expectLength(4);
      return { kind, sessionId: sessionId(reader.u32(0)) };
    case PacketKind.CommandResult: {
      reader.expectLength(14);
      const command = commandKindFromWire(reader.u8(4));
      const result = commandResultFromWire(reader.u8(5));
      const centralGeneration = optionalGeneration(reader.u32(6));
      const rightGeneration = optionalGeneration(reader.u32(10));
      validateCommandResult(command, result, centralGeneration, rightGeneration);
      return {
        kind,
        sessionId: sessionId(reader.u32(0)),
        command,
        result,
        centralGeneration,
        rightGeneration,
      };
    }
    case PacketKind.DeviceError: {
      reader.expectLength(6);
      const requestKind = packetKindFromWire(reader.u8(4));
      if (packetDirection(requestKind) !== "hostToDevice") {
        throw new WireError(
          "invalidErrorRequestKind",
          "device error cannot refer to a device-originated packet kind",
          requestKind,
        );
      }
      return {
        kind,
        sessionId: sessionId(reader.u32(0)),
        requestKind,
        code: deviceErrorFromWire(reader.u8(5)),
      };
    }
    case PacketKind.InteractionModeEntered:
    case PacketKind.InteractionModeExited: {
      reader.expectLength(12);
      const eventSequence = reader.u32(4);
      const interactionEpoch = reader.u32(8);
      validateEventSequence(eventSequence);
      validateInteractionEpoch(interactionEpoch);
      return {
        kind,
        sessionId: sessionId(reader.u32(0)),
        eventSequence,
        interactionEpoch,
      };
    }
    case PacketKind.CellEvent: {
      reader.expectLength(14);
      const eventSequence = reader.u32(4);
      const interactionEpoch = reader.u32(8);
      validateEventSequence(eventSequence);
      validateInteractionEpoch(interactionEpoch);
      const eventKind = cellEventKindFromWire(reader.u8(13));
      return {
        kind,
        sessionId: sessionId(reader.u32(0)),
        eventSequence,
        interactionEpoch,
        cellId: cellId(reader.u8(12)),
        eventKind,
      };
    }
    case PacketKind.SceneExpired:
      reader.expectLength(8);
      return {
        kind,
        sessionId: sessionId(reader.u32(0)),
        generation: sceneGeneration(reader.u32(4)),
      };
  }
}

function encodeCapabilities(
  writer: ByteWriter,
  id: SessionId,
  capabilities: DeviceCapabilities,
): void {
  validateCapabilities(capabilities);
  const topology = asciiBytes(capabilities.topologyId);
  const build = asciiBytes(capabilities.firmwareBuildId);
  if (
    topology.length > MAX_TOPOLOGY_ID_BYTES ||
    build.length === 0 ||
    build.length > MAX_FIRMWARE_BUILD_ID_BYTES
  ) {
    throw new WireError("invalidWireCapabilities", "wire capability fields are invalid");
  }

  writer
    .u32(validateSession(id))
    .u16(capabilities.protocolVersion)
    .u8(topology.length)
    .raw(topology)
    .u8(build.length)
    .raw(build);

  const bitmap = new Uint8Array(CAPABILITY_BITMAP_BYTES);
  for (const cell of capabilities.availableCells) {
    bitmap[Math.floor(cell / 8)]! |= 1 << (cell % 8);
  }
  writer.raw(bitmap);

  let features = 0;
  if (capabilities.supportsInputEvents) features |= 1;
  if (capabilities.supportsRightHalfAcknowledgement) features |= 2;
  let effects = 0;
  for (const effect of capabilities.supportedEffects) effects |= 1 << effectToWire(effect);
  writer
    .u8(features)
    .u8(effects)
    .u8(capabilities.maxSceneCells)
    .u32(capabilities.maxLeaseMillis)
    .u8(capabilities.maxBrightness);
}

function decodeCapabilities(reader: ByteReader): Packet {
  const fixedBytes =
    4 + 2 + 1 + 1 + CAPABILITY_BITMAP_BYTES + 1 + 1 + 1 + 4 + 1;
  if (reader.length < fixedBytes) {
    throw invalidPayloadLength(reader.length);
  }
  const topologyLength = reader.u8(6);
  if (topologyLength > MAX_TOPOLOGY_ID_BYTES) {
    throw new WireError("invalidWireCapabilities", "wire capability fields are invalid");
  }
  const topologyStart = 7;
  const topologyEnd = topologyStart + topologyLength;
  const topologyId = asciiString(reader.slice(topologyStart, topologyEnd));
  const buildLength = reader.u8(topologyEnd);
  if (
    buildLength === 0 ||
    buildLength > MAX_FIRMWARE_BUILD_ID_BYTES
  ) {
    throw new WireError("invalidWireCapabilities", "wire capability fields are invalid");
  }
  reader.expectLength(fixedBytes + topologyLength + buildLength);
  const buildStart = topologyEnd + 1;
  const buildEnd = buildStart + buildLength;
  const firmwareBuildId = asciiString(reader.slice(buildStart, buildEnd));
  const bitmapStart = buildEnd;
  const availableCells: CellId[] = [];
  for (let byteIndex = 0; byteIndex < CAPABILITY_BITMAP_BYTES; byteIndex += 1) {
    const byte = reader.u8(bitmapStart + byteIndex);
    for (let bit = 0; bit < 8; bit += 1) {
      if ((byte & (1 << bit)) !== 0) availableCells.push(cellId(byteIndex * 8 + bit));
    }
  }
  const featureFlags = reader.u8(bitmapStart + CAPABILITY_BITMAP_BYTES);
  if ((featureFlags & ~0b11) !== 0) {
    throw new WireError(
      "nonZeroReservedBits",
      `reserved bits must be zero, got ${featureFlags & ~0b11}`,
      featureFlags & ~0b11,
    );
  }
  const effectFlags = reader.u8(bitmapStart + CAPABILITY_BITMAP_BYTES + 1);
  if (effectFlags === 0 || (effectFlags & ~0b11) !== 0) {
    throw new WireError("invalidWireCapabilities", "wire capability fields are invalid");
  }
  const supportedEffects: EffectKind[] = [];
  for (let value = 0; value <= 1; value += 1) {
    if ((effectFlags & (1 << value)) !== 0) supportedEffects.push(effectFromWire(value));
  }
  const limitsStart = bitmapStart + CAPABILITY_BITMAP_BYTES + 2;
  const capabilities: DeviceCapabilities = {
    protocolVersion: reader.u16(4),
    topologyId,
    firmwareBuildId,
    availableCells,
    supportsInputEvents: (featureFlags & 1) !== 0,
    supportsRightHalfAcknowledgement: (featureFlags & 2) !== 0,
    supportedEffects,
    maxSceneCells: reader.u8(limitsStart),
    maxLeaseMillis: reader.u32(limitsStart + 1),
    maxBrightness: reader.u8(limitsStart + 5),
  };
  validateCapabilities(capabilities);
  return {
    kind: PacketKind.CapabilityResponse,
    sessionId: sessionId(reader.u32(0)),
    capabilities,
  };
}

function encodeFragment(writer: ByteWriter, fragment: SceneFragment): void {
  validateFragment(fragment);
  writer
    .u32(validateSession(fragment.sessionId))
    .u32(validateGeneration(fragment.generation))
    .u8(fragment.fragmentIndex)
    .u8(fragment.fragmentCount)
    .u8(fragment.totalCells)
    .u8(fragment.cells.length);
  for (const cell of fragment.cells) {
    validatePresentation(cell);
    writer
      .u8(cell.cellId)
      .u8(cell.color.red)
      .u8(cell.color.green)
      .u8(cell.color.blue)
      .u8(effectToWire(cell.effect))
      .u8(0);
  }
}

function decodeFragment(reader: ByteReader): SceneFragment {
  if (reader.length < FRAGMENT_HEADER_BYTES) throw invalidPayloadLength(reader.length);
  const cellCount = reader.u8(11);
  reader.expectLength(FRAGMENT_HEADER_BYTES + cellCount * CELL_WIRE_BYTES);
  const cells: CellPresentation[] = [];
  for (let index = 0; index < cellCount; index += 1) {
    const offset = FRAGMENT_HEADER_BYTES + index * CELL_WIRE_BYTES;
    if (reader.u8(offset + 5) !== 0) {
      throw new WireError(
        "nonZeroReservedByte",
        `reserved byte must be zero, got ${reader.u8(offset + 5)}`,
        reader.u8(offset + 5),
      );
    }
    cells.push({
      cellId: cellId(reader.u8(offset)),
      color: {
        red: reader.u8(offset + 1),
        green: reader.u8(offset + 2),
        blue: reader.u8(offset + 3),
      },
      effect: effectFromWire(reader.u8(offset + 4)),
    });
  }
  const fragment: SceneFragment = {
    sessionId: sessionId(reader.u32(0)),
    generation: sceneGeneration(reader.u32(4)),
    fragmentIndex: reader.u8(8),
    fragmentCount: reader.u8(9),
    totalCells: reader.u8(10),
    cells,
  };
  validateFragment(fragment);
  return fragment;
}

export function validateFragment(fragment: SceneFragment): void {
  validateSession(fragment.sessionId);
  validateGeneration(fragment.generation);
  assertUnsigned(fragment.fragmentIndex, 0xff, "fragment index");
  assertUnsigned(fragment.fragmentCount, 0xff, "fragment count");
  assertUnsigned(fragment.totalCells, 0xff, "total cells");
  if (fragment.fragmentCount === 0 || fragment.fragmentIndex >= fragment.fragmentCount) {
    throw new WireError(
      "invalidFragmentIndex",
      `fragment index ${fragment.fragmentIndex} is invalid for ${fragment.fragmentCount} fragments`,
      { index: fragment.fragmentIndex, count: fragment.fragmentCount },
    );
  }
  const carried = fragment.cells.length;
  const total = fragment.totalCells;
  if (
    total === 0 ||
    total > GLOVE80_CELL_COUNT ||
    carried === 0 ||
    carried > MAX_FRAGMENT_CELLS ||
    carried > total
  ) {
    throw new WireError(
      "invalidFragmentCellCount",
      `fragment cell count ${carried} is invalid`,
      carried,
    );
  }
  const exactFragmentCount = Math.ceil(total / MAX_FRAGMENT_CELLS);
  const exactCarried =
    fragment.fragmentIndex === exactFragmentCount - 1
      ? total - fragment.fragmentIndex * MAX_FRAGMENT_CELLS
      : MAX_FRAGMENT_CELLS;
  if (
    fragment.fragmentCount !== exactFragmentCount ||
    carried !== exactCarried
  ) {
    throw new WireError(
      "invalidFragmentLayout",
      `fragment ${fragment.fragmentIndex} does not use the canonical layout for ${total} cells`,
      {
        fragments: fragment.fragmentCount,
        carried,
        expectedFragments: exactFragmentCount,
        expectedCarried: exactCarried,
      },
    );
  }
  const cells = new Set<number>();
  for (const presentation of fragment.cells) {
    validatePresentation(presentation);
    if (cells.has(presentation.cellId)) {
      throw new WireError("duplicateFragmentCell", "fragment repeats a cell");
    }
    cells.add(presentation.cellId);
  }
}

function validateLease(value: number): void {
  assertUnsigned(value, 0xffff_ffff, "lease");
  if (value === 0) throw new WireError("zeroLease", "lease must be nonzero");
}

function validateCommit(
  fragmentCount: number,
  totalCells: number,
  leaseMillis: number,
  checksum: number,
): void {
  assertUnsigned(fragmentCount, 0xff, "fragment count");
  assertUnsigned(totalCells, 0xff, "total cells");
  assertUnsigned(checksum, 0xffff_ffff, "scene checksum");
  validateLease(leaseMillis);
  if (fragmentCount === 0 && totalCells === 0) {
    if (checksum === sceneChecksum([])) return;
    throw new WireError("invalidCommit", "scene commit fields are invalid");
  }
  if (
    totalCells === 0 ||
    totalCells > GLOVE80_CELL_COUNT ||
    fragmentCount === 0 ||
    fragmentCount > totalCells ||
    fragmentCount * MAX_FRAGMENT_CELLS < totalCells
  ) {
    throw new WireError("invalidCommit", "scene commit fields are invalid");
  }
}

function validateStatus(
  status: SessionStatus,
  leaseRemainingMillis: number,
  centralGeneration?: SceneGeneration,
  rightGeneration?: SceneGeneration,
  rightStatus: RightHalfStatus = RightHalfStatus.Absent,
  interactionEpoch?: number,
): void {
  assertUnsigned(leaseRemainingMillis, 0xffff_ffff, "remaining lease");
  validateGenerationOrder(centralGeneration, rightGeneration);
  if (interactionEpoch !== undefined) validateInteractionEpoch(interactionEpoch);
  if (status === SessionStatus.Active && leaseRemainingMillis > 0) {
    if (
      rightStatus === RightHalfStatus.Applied
        ? centralGeneration !== undefined &&
          rightGeneration === centralGeneration
        : rightGeneration === undefined
    ) {
      return;
    }
  }
  if (
    (status === SessionStatus.Expired || status === SessionStatus.Unknown) &&
    leaseRemainingMillis === 0 &&
    centralGeneration === undefined &&
    rightGeneration === undefined &&
    rightStatus === RightHalfStatus.Absent &&
    interactionEpoch === undefined
  ) {
    return;
  }
  throw new WireError("invalidStatus", "session status fields contradict one another");
}

function validateCommandResult(
  command: CommandKind,
  result: CommandResultCode,
  centralGeneration?: SceneGeneration,
  rightGeneration?: SceneGeneration,
): void {
  validateGenerationOrder(centralGeneration, rightGeneration);
  let valid = false;
  switch (command) {
    case CommandKind.OpenSession:
      valid =
        result === CommandResultCode.Accepted &&
        centralGeneration === undefined &&
        rightGeneration === undefined;
      break;
    case CommandKind.RenewSession:
    case CommandKind.SceneFragment:
      valid = result === CommandResultCode.Accepted;
      break;
    case CommandKind.SceneCommit:
      if (result === CommandResultCode.Applied) {
        valid =
          centralGeneration !== undefined &&
          (rightGeneration === undefined || rightGeneration === centralGeneration);
      } else if (result === CommandResultCode.Partial) {
        valid =
          centralGeneration !== undefined &&
          (rightGeneration === undefined || rightGeneration !== centralGeneration);
      }
      break;
    case CommandKind.CloseSession:
      valid =
        result === CommandResultCode.Closed &&
        centralGeneration === undefined &&
        rightGeneration === undefined;
  }
  if (!valid) {
    throw new WireError(
      "invalidCommandResult",
      "command result fields contradict one another",
    );
  }
}

function validateGenerationOrder(
  centralGeneration?: SceneGeneration,
  rightGeneration?: SceneGeneration,
): void {
  if (centralGeneration !== undefined) validateGeneration(centralGeneration);
  if (rightGeneration !== undefined) validateGeneration(rightGeneration);
  if (
    centralGeneration === undefined &&
    rightGeneration !== undefined
  ) {
    throw new WireError(
      "invalidGenerationState",
      "right generation requires an equal or newer central generation",
    );
  }
}

function validateInteractionEpoch(value: number): void {
  assertUnsigned(value, 0xffff_ffff, "interaction epoch");
  if (value === 0) {
    throw new WireError("zeroInteractionEpoch", "interaction epoch must be nonzero");
  }
}

function validateEventSequence(value: number): void {
  assertUnsigned(value, 0xffff_ffff, "event sequence");
  if (value === 0) {
    throw new WireError("zeroEventSequence", "device event sequence must be nonzero");
  }
}

export function sceneChecksum(cells: readonly CellPresentation[]): number {
  const bytes = new Uint8Array(cells.length * 5);
  cells.forEach((cell, index) => {
    validatePresentation(cell);
    const offset = index * 5;
    bytes[offset] = cell.cellId;
    bytes[offset + 1] = cell.color.red;
    bytes[offset + 2] = cell.color.green;
    bytes[offset + 3] = cell.color.blue;
    bytes[offset + 4] = effectToWire(cell.effect);
  });
  return crc32(bytes);
}

function packetKindFromWire(value: number): PacketKind {
  if (value >= PacketKind.CapabilityQuery && value <= PacketKind.SceneExpired) {
    return value as PacketKind;
  }
  throw new WireError("unknownPacketKind", `packet kind ${value} is unknown`, value);
}

function commandKindFromWire(value: number): CommandKind {
  if (value >= CommandKind.OpenSession && value <= CommandKind.CloseSession) {
    return value as CommandKind;
  }
  throw new WireError("unknownCommandKind", `command kind ${value} is unknown`, value);
}

function commandResultFromWire(value: number): CommandResultCode {
  if (value >= CommandResultCode.Accepted && value <= CommandResultCode.Closed) {
    return value as CommandResultCode;
  }
  throw new WireError("unknownCommandResult", `command result ${value} is unknown`, value);
}

function sessionStatusFromWire(value: number): SessionStatus {
  if (value >= SessionStatus.Active && value <= SessionStatus.Unknown) {
    return value as SessionStatus;
  }
  throw new WireError("unknownSessionStatus", `session status ${value} is unknown`, value);
}

function rightHalfStatusFromWire(value: number): RightHalfStatus {
  if (value >= RightHalfStatus.Absent && value <= RightHalfStatus.PowerLimited) {
    return value as RightHalfStatus;
  }
  throw new WireError(
    "unknownRightHalfStatus",
    `right-half status ${value} is unknown`,
    value,
  );
}

function effectToWire(value: EffectKind): number {
  if (value === "solid") return 0;
  if (value === "pulse") return 1;
  throw new ProtocolError("unknownEffect", `effect ${String(value)} is unknown`, value);
}

function effectFromWire(value: number): EffectKind {
  if (value === 0) return "solid";
  if (value === 1) return "pulse";
  throw new ProtocolError("unknownEffect", `effect value ${value} is unknown`, value);
}

function cellEventKindFromWire(value: number): CellEventKind {
  if (value === 0) return "down";
  if (value === 1) return "up";
  throw new WireError("unknownCellEventKind", `cell event kind ${value} is unknown`, value);
}

function deviceErrorToWire(value: DeviceErrorCode): number {
  switch (value) {
    case "invalidPacket":
      return 0;
    case "unsupportedVersion":
      return 1;
    case "sessionExpired":
      return 2;
    case "incompatibleRightHalf":
      return 3;
    case "electricalLimit":
      return 4;
    case "sessionBusy":
      return 5;
  }
}

function deviceErrorFromWire(value: number): DeviceErrorCode {
  const values: readonly DeviceErrorCode[] = [
    "invalidPacket",
    "unsupportedVersion",
    "sessionExpired",
    "incompatibleRightHalf",
    "electricalLimit",
    "sessionBusy",
  ];
  const code = values[value];
  if (code !== undefined) return code;
  throw new WireError("unknownDeviceError", `device error ${value} is unknown`, value);
}

function optionalGeneration(value: number): SceneGeneration | undefined {
  return value === 0 ? undefined : sceneGeneration(value);
}

function optionalNonzero(value: number): number | undefined {
  return value === 0 ? undefined : value;
}

function validateSession(value: SessionId): number {
  return sessionId(value);
}

function validateGeneration(value: SceneGeneration): number {
  return sceneGeneration(value);
}

function assertUnsigned(value: number, maximum: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(`${label} must be an unsigned integer no greater than ${maximum}`);
  }
}

function invalidPayloadLength(length: number): WireError {
  return new WireError(
    "invalidPayloadLength",
    `payload length ${length} is invalid for the packet kind`,
    length,
  );
}

function asciiBytes(value: string): Uint8Array {
  const result = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 0x7f) {
      throw new WireError("invalidWireCapabilities", "wire capability fields are invalid");
    }
    result[index] = code;
  }
  return result;
}

function asciiString(value: Uint8Array): string {
  let result = "";
  for (const byte of value) {
    if (byte > 0x7f) {
      throw new WireError("invalidWireCapabilities", "wire capability fields are invalid");
    }
    result += String.fromCharCode(byte);
  }
  return result;
}

class ByteWriter {
  readonly #bytes: number[] = [];

  get length(): number {
    return this.#bytes.length;
  }

  u8(value: number): this {
    assertUnsigned(value, 0xff, "u8");
    this.#bytes.push(value);
    return this;
  }

  u16(value: number): this {
    assertUnsigned(value, 0xffff, "u16");
    this.#bytes.push(value & 0xff, (value >>> 8) & 0xff);
    return this;
  }

  u32(value: number): this {
    assertUnsigned(value, 0xffff_ffff, "u32");
    this.#bytes.push(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    );
    return this;
  }

  raw(value: Uint8Array): this {
    this.#bytes.push(...value);
    return this;
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.#bytes);
  }
}

class ByteReader {
  readonly #view: DataView;

  constructor(readonly bytes: Uint8Array) {
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.length;
  }

  expectLength(expected: number): void {
    if (this.length !== expected) throw invalidPayloadLength(this.length);
  }

  u8(offset: number): number {
    return this.#view.getUint8(offset);
  }

  u16(offset: number): number {
    return this.#view.getUint16(offset, true);
  }

  u32(offset: number): number {
    return this.#view.getUint32(offset, true);
  }

  slice(start: number, end: number): Uint8Array {
    return this.bytes.subarray(start, end);
  }
}

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}
