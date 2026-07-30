import {
  cellId,
  type CellId,
  type DeviceCapabilities,
  type Rgb,
} from "./types";

export const LEGACY_GLOVE80_VENDOR_ID = 0x16c0;
export const LEGACY_GLOVE80_LEFT_PRODUCT_ID = 0x27db;
export const LEGACY_VENDOR_USAGE_PAGE = 0xff60;
export const LEGACY_VENDOR_USAGE = 0x01;
export const LEGACY_OUTPUT_REPORT_ID = 0x04;
export const LEGACY_FEATURE_REPORT_ID = 0x05;
export const LEGACY_PROTOCOL_VERSION = 0x01;
export const LEGACY_OUTPUT_BODY_BYTES = 24;
export const LEGACY_FEATURE_BODY_BYTES = 16;
export const LEGACY_LED_COUNT = 6;

/**
 * The experimental firmware controls the complete second row of the left key
 * well, from the outside column to the inside column: LH C6R2 … LH C1R2.
 *
 * The corresponding physical WS2812 addresses are 35, 29, 23, 17, 11, and 6.
 * Cell IDs are the host catalog IDs used by this repository, not LED-strip
 * addresses.
 */
export const LEGACY_SIX_CELL_IDS = Object.freeze(
  [5, 6, 7, 8, 9, 10].map(cellId),
);
export const LEGACY_SIX_LED_ADDRESSES = Object.freeze([
  35, 29, 23, 17, 11, 6,
]);

export enum LegacyOpcode {
  Set = 1,
  Clear = 2,
}

export enum LegacyStatus {
  Ok = 0,
  BadVersion = 1,
  BadOpcode = 2,
  BadFlags = 3,
  BadTimeout = 4,
  DriverError = 5,
}

export interface LegacyFeatureStatus {
  readonly version: number;
  readonly controlledLedCount: number;
  readonly maxChannel: number;
  readonly maxTimeoutSeconds: number;
  readonly lastSequence: number;
  readonly lastStatus: LegacyStatus;
  readonly active: boolean;
}

export class LegacyProtocolError extends Error {
  constructor(
    readonly code:
      | "invalidSequence"
      | "invalidTimeout"
      | "invalidColorCount"
      | "invalidColor"
      | "invalidFeatureLength"
      | "invalidFeatureReportId"
      | "invalidFeatureValue"
      | "unsupportedLegacyFirmware",
    message: string,
    readonly value?: unknown,
  ) {
    super(message);
    this.name = "LegacyProtocolError";
  }
}

export function encodeLegacySetReport(
  sequence: number,
  timeoutSeconds: number,
  colors: readonly Rgb[],
): Uint8Array {
  validateSequence(sequence);
  if (
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 1 ||
    timeoutSeconds > 60
  ) {
    throw new LegacyProtocolError(
      "invalidTimeout",
      "legacy timeout must be an integer from 1 through 60 seconds",
      timeoutSeconds,
    );
  }
  if (colors.length !== LEGACY_LED_COUNT) {
    throw new LegacyProtocolError(
      "invalidColorCount",
      `legacy report requires exactly ${LEGACY_LED_COUNT} colors`,
      colors.length,
    );
  }

  const report = new Uint8Array(LEGACY_OUTPUT_BODY_BYTES + 1);
  report[0] = LEGACY_OUTPUT_REPORT_ID;
  report[1] = LEGACY_PROTOCOL_VERSION;
  report[2] = LegacyOpcode.Set;
  report[3] = sequence;
  report[4] = 0;
  report[5] = timeoutSeconds & 0xff;
  report[6] = timeoutSeconds >>> 8;
  colors.forEach((color, index) => {
    const offset = 7 + index * 3;
    report[offset] = channel(color.red, "red");
    report[offset + 1] = channel(color.green, "green");
    report[offset + 2] = channel(color.blue, "blue");
  });
  return report;
}

export function encodeLegacyClearReport(sequence: number): Uint8Array {
  validateSequence(sequence);
  const report = new Uint8Array(LEGACY_OUTPUT_BODY_BYTES + 1);
  report[0] = LEGACY_OUTPUT_REPORT_ID;
  report[1] = LEGACY_PROTOCOL_VERSION;
  report[2] = LegacyOpcode.Clear;
  report[3] = sequence;
  return report;
}

export function decodeLegacyFeatureReport(
  bytes: Uint8Array,
): LegacyFeatureStatus {
  const bodyOffset =
    bytes.length === LEGACY_FEATURE_BODY_BYTES + 1 &&
    bytes[0] === LEGACY_FEATURE_REPORT_ID
      ? 1
      : 0;
  if (
    bytes.length !== LEGACY_FEATURE_BODY_BYTES &&
    bytes.length !== LEGACY_FEATURE_BODY_BYTES + 1
  ) {
    throw new LegacyProtocolError(
      "invalidFeatureLength",
      "legacy feature report must contain 16 body bytes, optionally prefixed by report ID 5",
      bytes.length,
    );
  }
  if (
    bytes.length === LEGACY_FEATURE_BODY_BYTES + 1 &&
    bytes[0] !== LEGACY_FEATURE_REPORT_ID
  ) {
    throw new LegacyProtocolError(
      "invalidFeatureReportId",
      "legacy feature report has the wrong report ID",
      bytes[0],
    );
  }

  const version = bytes[bodyOffset]!;
  const controlledLedCount = bytes[bodyOffset + 1]!;
  const maxChannel = bytes[bodyOffset + 2]!;
  const maxTimeoutSeconds = bytes[bodyOffset + 3]!;
  const lastSequence = bytes[bodyOffset + 4]!;
  const lastStatus = bytes[bodyOffset + 5]!;
  const active = bytes[bodyOffset + 6]!;
  if (
    maxChannel === 0 ||
    maxTimeoutSeconds === 0 ||
    maxTimeoutSeconds > 60 ||
    lastStatus > LegacyStatus.DriverError ||
    active > 1
  ) {
    throw new LegacyProtocolError(
      "invalidFeatureValue",
      "legacy feature report contains an impossible capability or status value",
      bytes,
    );
  }
  if (
    version !== LEGACY_PROTOCOL_VERSION ||
    controlledLedCount !== LEGACY_LED_COUNT
  ) {
    throw new LegacyProtocolError(
      "unsupportedLegacyFirmware",
      `expected legacy protocol 1 with six LEDs, received protocol ${version} with ${controlledLedCount} LEDs`,
      { version, controlledLedCount },
    );
  }
  return {
    version,
    controlledLedCount,
    maxChannel,
    maxTimeoutSeconds,
    lastSequence,
    lastStatus: lastStatus as LegacyStatus,
    active: active === 1,
  };
}

export function legacySixCellCapabilities(
  feature: LegacyFeatureStatus,
): DeviceCapabilities {
  return {
    protocolVersion: feature.version,
    topologyId: "glove80-legacy-left-row-2-v1",
    firmwareBuildId: "legacy01",
    availableCells: LEGACY_SIX_CELL_IDS,
    supportsInputEvents: false,
    supportsRightHalfAcknowledgement: false,
    supportedEffects: ["solid"],
    maxSceneCells: LEGACY_LED_COUNT,
    maxLeaseMillis: feature.maxTimeoutSeconds * 1_000,
    maxBrightness: feature.maxChannel,
  };
}

export function legacyColorsForCells(
  presentations: ReadonlyMap<CellId, Rgb>,
): Rgb[] {
  return LEGACY_SIX_CELL_IDS.map(
    (id) => presentations.get(id) ?? { red: 0, green: 0, blue: 0 },
  );
}

function validateSequence(sequence: number): void {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 0xff) {
    throw new LegacyProtocolError(
      "invalidSequence",
      "legacy sequence must be an integer from 1 through 255",
      sequence,
    );
  }
}

function channel(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new LegacyProtocolError(
      "invalidColor",
      `${name} channel must be an integer from 0 through 255`,
      value,
    );
  }
  return value;
}
