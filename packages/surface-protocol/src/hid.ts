import {
  MAX_FRAGMENT_CELLS,
  MAX_PACKET_BYTES,
  PacketKind,
  encodePacket,
  decodePacket,
  packetDirection,
  sceneChecksum,
  type Packet,
} from "./wire";
import type { DesiredScene } from "./types";
import {
  sessionId,
  type DeviceCapabilities,
} from "./types";

export const GENERIC_HID_USAGE_PAGE = 0xff60;
export const GENERIC_HID_USAGE = 0x10;
export const GENERIC_HID_OUTPUT_REPORT_ID = 0x06;
export const GENERIC_HID_INPUT_REPORT_ID = 0x07;
export const GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID = 0x08;
export const GENERIC_HID_REPORT_BODY_BYTES = 63;
export const GENERIC_HID_HOST_REPORT_BYTES =
  GENERIC_HID_REPORT_BODY_BYTES + 1;

export class HidFramingError extends Error {
  constructor(
    readonly code:
      | "wrongDirection"
      | "wrongReportId"
      | "wrongReportLength"
      | "invalidEmbeddedLength"
      | "nonZeroPadding",
    message: string,
    readonly value?: unknown,
  ) {
    super(message);
    this.name = "HidFramingError";
  }
}

/**
 * hidapi requires the report ID as byte zero on writes. The remaining 63
 * bytes are one variable-length protocol packet followed by zero padding.
 */
export function encodeGenericHidOutput(
  sequence: number,
  packet: Packet,
): Uint8Array {
  if (packetDirection(packet.kind) !== "hostToDevice") {
    throw new HidFramingError(
      "wrongDirection",
      "a device-to-host packet cannot be encoded as a HID output report",
      packet.kind,
    );
  }
  const encoded = encodePacket(sequence, packet);
  const report = new Uint8Array(GENERIC_HID_HOST_REPORT_BYTES);
  report[0] = GENERIC_HID_OUTPUT_REPORT_ID;
  report.set(encoded, 1);
  return report;
}

export function decodeGenericHidOutput(
  report: Uint8Array,
): readonly [number, Packet] {
  const decoded = decodePaddedReport(
    report,
    GENERIC_HID_OUTPUT_REPORT_ID,
    "output",
  );
  if (packetDirection(decoded[1].kind) !== "hostToDevice") {
    throw new HidFramingError(
      "wrongDirection",
      "a device-to-host packet cannot be accepted from a HID output report",
      decoded[1].kind,
    );
  }
  return decoded;
}

export function encodeGenericHidInput(
  sequence: number,
  packet: Packet,
): Uint8Array {
  if (packetDirection(packet.kind) !== "deviceToHost") {
    throw new HidFramingError(
      "wrongDirection",
      "a host-to-device packet cannot be encoded as a HID input report",
      packet.kind,
    );
  }
  const encoded = encodePacket(sequence, packet);
  const report = new Uint8Array(GENERIC_HID_HOST_REPORT_BYTES);
  report[0] = GENERIC_HID_INPUT_REPORT_ID;
  report.set(encoded, 1);
  return report;
}

/**
 * Static feature report used solely for non-mutating discovery. Session 1 and
 * packet sequence 0 are fixed sentinels; live traffic still negotiates its
 * own random session through reports 6 and 7.
 */
export function encodeGenericCapabilityFeature(
  capabilities: DeviceCapabilities,
): Uint8Array {
  const encoded = encodePacket(0, {
    kind: PacketKind.CapabilityResponse,
    sessionId: sessionId(1),
    capabilities,
  });
  const report = new Uint8Array(GENERIC_HID_HOST_REPORT_BYTES);
  report[0] = GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID;
  report.set(encoded, 1);
  return report;
}

export function decodeGenericCapabilityFeature(
  report: Uint8Array,
): DeviceCapabilities {
  const [sequence, packet] = decodePaddedReport(
    report,
    GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID,
    "capability feature",
  );
  if (
    sequence !== 0 ||
    packet.kind !== PacketKind.CapabilityResponse ||
    packet.sessionId !== 1
  ) {
    throw new HidFramingError(
      "wrongDirection",
      "generic capability feature does not contain the fixed discovery response",
      { sequence, kind: packet.kind },
    );
  }
  return packet.capabilities;
}

/**
 * hidapi backends differ on whether the nonzero report ID is present in input
 * data. Both representations are accepted; all unused report bytes must
 * remain zero so malformed or concatenated packets are never ignored.
 */
export function decodeGenericHidInput(
  report: Uint8Array,
): readonly [number, Packet] {
  const decoded = decodePaddedReport(
    report,
    GENERIC_HID_INPUT_REPORT_ID,
    "input",
  );
  if (packetDirection(decoded[1].kind) !== "deviceToHost") {
    throw new HidFramingError(
      "wrongDirection",
      "a host-to-device packet cannot be accepted from a HID input report",
      decoded[1].kind,
    );
  }
  return decoded;
}

function decodePaddedReport(
  report: Uint8Array,
  expectedReportId: number,
  label: string,
): readonly [number, Packet] {
  let body: Uint8Array;
  if (report.length === GENERIC_HID_HOST_REPORT_BYTES) {
    if (report[0] !== expectedReportId) {
      throw new HidFramingError(
        "wrongReportId",
        `generic ${label} report has the wrong report ID`,
        report[0],
      );
    }
    body = report.subarray(1);
  } else if (report.length === GENERIC_HID_REPORT_BODY_BYTES) {
    body = report;
  } else {
    throw new HidFramingError(
      "wrongReportLength",
      `generic HID ${label} must contain ${GENERIC_HID_REPORT_BODY_BYTES} body bytes, optionally prefixed by report ID ${expectedReportId}`,
      report.length,
    );
  }

  if (body.length < 12) {
    throw new HidFramingError(
      "wrongReportLength",
      `generic HID ${label} is shorter than the protocol header and checksum`,
    );
  }
  const payloadLength = body[6]! | (body[7]! << 8);
  const packetLength = 8 + payloadLength + 4;
  if (packetLength < 12 || packetLength > MAX_PACKET_BYTES) {
    throw new HidFramingError(
      "invalidEmbeddedLength",
      `generic HID ${label} declares an impossible packet length`,
      packetLength,
    );
  }
  for (let index = packetLength; index < body.length; index += 1) {
    if (body[index] !== 0) {
      throw new HidFramingError(
        "nonZeroPadding",
        `generic HID ${label} has nonzero bytes after its packet`,
        index,
      );
    }
  }
  return decodePacket(body.subarray(0, packetLength));
}

/**
 * Converts one complete scene into every fragment followed by exactly one
 * atomic commit. Eighty cells currently require fourteen fragments.
 */
export function packetsForCompleteScene(scene: DesiredScene): Packet[] {
  const canonicalCells = [...scene.cells].sort(
    (left, right) => left.cellId - right.cellId,
  );
  if (canonicalCells.length === 0) {
    return [{
      kind: PacketKind.SceneCommit,
      sessionId: scene.sessionId,
      generation: scene.generation,
      fragmentCount: 0,
      totalCells: 0,
      leaseMillis: scene.leaseMillis,
      brightness: scene.brightness,
      sceneChecksum: sceneChecksum([]),
      primaryActionCells: scene.primaryActionCells,
      secondaryActionCells: scene.secondaryActionCells,
    }];
  }
  const fragmentCount = Math.ceil(
    canonicalCells.length / MAX_FRAGMENT_CELLS,
  );
  const packets: Packet[] = [];
  for (let index = 0; index < fragmentCount; index += 1) {
    packets.push({
      kind: PacketKind.SceneFragment,
      fragment: {
        sessionId: scene.sessionId,
        generation: scene.generation,
        fragmentIndex: index,
        fragmentCount,
        totalCells: canonicalCells.length,
        cells: canonicalCells.slice(
          index * MAX_FRAGMENT_CELLS,
          (index + 1) * MAX_FRAGMENT_CELLS,
        ),
      },
    });
  }
  packets.push({
    kind: PacketKind.SceneCommit,
    sessionId: scene.sessionId,
    generation: scene.generation,
    fragmentCount,
    totalCells: canonicalCells.length,
    leaseMillis: scene.leaseMillis,
    brightness: scene.brightness,
    sceneChecksum: sceneChecksum(canonicalCells),
    primaryActionCells: scene.primaryActionCells,
    secondaryActionCells: scene.secondaryActionCells,
  });
  return packets;
}
