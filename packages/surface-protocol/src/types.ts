export const PROTOCOL_VERSION = 3;
export const GLOVE80_CELL_COUNT = 80;

declare const cellIdBrand: unique symbol;
declare const sessionIdBrand: unique symbol;
declare const sceneGenerationBrand: unique symbol;

export type CellId = number & { readonly [cellIdBrand]: true };
export type SessionId = number & { readonly [sessionIdBrand]: true };
export type SceneGeneration = number & { readonly [sceneGenerationBrand]: true };

export class ProtocolError extends Error {
  constructor(
    readonly code:
      | "cellOutOfRange"
      | "zeroSessionId"
      | "zeroSceneGeneration"
      | "unsupportedVersion"
      | "emptyTopologyId"
      | "invalidCapabilities"
      | "duplicateCapabilityCell"
      | "duplicateCapabilityEffect"
      | "unknownEffect"
      | "unsupportedEffect"
      | "leaseOutOfRange"
      | "brightnessOutOfRange"
      | "sceneTooLarge"
      | "unavailableCell"
      | "duplicateSceneCell"
      | "duplicateActionCell",
    message: string,
    readonly value?: unknown,
  ) {
    super(message);
    this.name = "ProtocolError";
  }
}

function assertIntegerInRange(value: number, maximum: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(`${label} must be an unsigned integer no greater than ${maximum}`);
  }
}

export function cellId(value: number): CellId {
  assertIntegerInRange(value, 0xff, "cell ID");
  if (value >= GLOVE80_CELL_COUNT) {
    throw new ProtocolError(
      "cellOutOfRange",
      `cell ${value} is outside the supported Glove80 topology`,
      value,
    );
  }
  return value as CellId;
}

export function sessionId(value: number): SessionId {
  assertIntegerInRange(value, 0xffff_ffff, "session ID");
  if (value === 0) {
    throw new ProtocolError("zeroSessionId", "session ID must be non-zero", value);
  }
  return value as SessionId;
}

export function sceneGeneration(value: number): SceneGeneration {
  assertIntegerInRange(value, 0xffff_ffff, "scene generation");
  if (value === 0) {
    throw new ProtocolError(
      "zeroSceneGeneration",
      "scene generation must be non-zero",
      value,
    );
  }
  return value as SceneGeneration;
}

export type Half = "left" | "right";
export type EffectKind = "solid" | "pulse";
export type ActionBank = "primary" | "secondary";

export interface Rgb {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

export interface CellPresentation {
  readonly cellId: CellId;
  readonly color: Rgb;
  readonly effect: EffectKind;
}

export interface DeviceCapabilities {
  readonly protocolVersion: number;
  readonly topologyId: string;
  readonly firmwareBuildId: string;
  readonly availableCells: readonly CellId[];
  readonly supportsInputEvents: boolean;
  readonly supportsRightHalfAcknowledgement: boolean;
  readonly supportedEffects: readonly EffectKind[];
  readonly maxSceneCells: number;
  readonly maxLeaseMillis: number;
  readonly maxBrightness: number;
}

export function simulatedGlove80Capabilities(): DeviceCapabilities {
  return {
    protocolVersion: PROTOCOL_VERSION,
    topologyId: "glove80-rgb-80-v1",
    firmwareBuildId: "g80m4a06",
    availableCells: Array.from({ length: GLOVE80_CELL_COUNT }, (_, value) => cellId(value)),
    supportsInputEvents: true,
    supportsRightHalfAcknowledgement: true,
    supportedEffects: ["solid", "pulse"],
    maxSceneCells: GLOVE80_CELL_COUNT,
    maxLeaseMillis: 60_000,
    maxBrightness: 96,
  };
}

export function validateCapabilities(capabilities: DeviceCapabilities): void {
  if (capabilities.protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolError(
      "unsupportedVersion",
      `protocol version ${capabilities.protocolVersion} is unsupported`,
      capabilities.protocolVersion,
    );
  }
  if (capabilities.topologyId.trim() === "") {
    throw new ProtocolError("emptyTopologyId", "topology ID cannot be empty");
  }
  if (capabilities.firmwareBuildId.trim() === "") {
    throw new ProtocolError(
      "invalidCapabilities",
      "firmware build ID cannot be empty",
    );
  }
  if (
    !Number.isInteger(capabilities.maxSceneCells) ||
    capabilities.maxSceneCells === 0 ||
    capabilities.maxSceneCells > capabilities.availableCells.length ||
    !Number.isInteger(capabilities.maxLeaseMillis) ||
    capabilities.maxLeaseMillis === 0 ||
    capabilities.maxLeaseMillis > 0xffff_ffff ||
    !Number.isInteger(capabilities.maxBrightness) ||
    capabilities.maxBrightness < 0 ||
    capabilities.maxBrightness > 0xff ||
    capabilities.supportedEffects.length === 0
  ) {
    throw new ProtocolError("invalidCapabilities", "capability limits are inconsistent");
  }

  const cells = new Set<number>();
  for (const value of capabilities.availableCells) {
    cellId(value);
    if (cells.has(value)) {
      throw new ProtocolError(
        "duplicateCapabilityCell",
        "capabilities contain a duplicate cell",
      );
    }
    cells.add(value);
  }

  const effects = new Set<EffectKind>();
  for (const effect of capabilities.supportedEffects) {
    if (effect !== "solid" && effect !== "pulse") {
      throw new ProtocolError("unknownEffect", `effect ${String(effect)} is unknown`, effect);
    }
    if (effects.has(effect)) {
      throw new ProtocolError(
        "duplicateCapabilityEffect",
        "capabilities contain a duplicate effect",
      );
    }
    effects.add(effect);
  }
}

export interface DesiredScene {
  readonly sessionId: SessionId;
  readonly generation: SceneGeneration;
  readonly leaseMillis: number;
  readonly brightness: number;
  readonly cells: readonly CellPresentation[];
  readonly primaryActionCells: readonly CellId[];
  readonly secondaryActionCells: readonly CellId[];
}

export function validateDesiredScene(
  scene: DesiredScene,
  capabilities: DeviceCapabilities,
): void {
  validateCapabilities(capabilities);
  sessionId(scene.sessionId);
  sceneGeneration(scene.generation);
  if (
    !Number.isInteger(scene.leaseMillis) ||
    scene.leaseMillis === 0 ||
    scene.leaseMillis > capabilities.maxLeaseMillis
  ) {
    throw new ProtocolError(
      "leaseOutOfRange",
      `lease ${scene.leaseMillis}ms is outside device limits`,
      scene.leaseMillis,
    );
  }
  if (
    !Number.isInteger(scene.brightness) ||
    scene.brightness < 0 ||
    scene.brightness > capabilities.maxBrightness
  ) {
    throw new ProtocolError(
      "brightnessOutOfRange",
      `brightness ${scene.brightness} is outside device limits`,
      scene.brightness,
    );
  }
  if (scene.cells.length > capabilities.maxSceneCells) {
    throw new ProtocolError(
      "sceneTooLarge",
      `scene has ${scene.cells.length} cells, exceeding device limits`,
      scene.cells.length,
    );
  }

  const available = new Set<number>(capabilities.availableCells);
  const effects = new Set<EffectKind>(capabilities.supportedEffects);
  const seen = new Set<number>();
  for (const presentation of scene.cells) {
    validatePresentation(presentation);
    if (!available.has(presentation.cellId)) {
      throw new ProtocolError(
        "unavailableCell",
        `cell ${presentation.cellId} is not exposed by this device`,
        presentation.cellId,
      );
    }
    if (!effects.has(presentation.effect)) {
      throw new ProtocolError(
        "unsupportedEffect",
        `effect ${presentation.effect} is not supported`,
        presentation.effect,
      );
    }
    if (seen.has(presentation.cellId)) {
      throw new ProtocolError(
        "duplicateSceneCell",
        `scene contains cell ${presentation.cellId} more than once`,
        presentation.cellId,
      );
    }
    seen.add(presentation.cellId);
  }
  validateActionCells(scene.primaryActionCells, available);
  validateActionCells(scene.secondaryActionCells, available);
}

function validateActionCells(
  cells: readonly CellId[],
  available: ReadonlySet<number>,
): void {
  const seen = new Set<number>();
  for (const value of cells) {
    cellId(value);
    if (!available.has(value)) {
      throw new ProtocolError(
        "unavailableCell",
        `action cell ${value} is not exposed by this device`,
        value,
      );
    }
    if (seen.has(value)) {
      throw new ProtocolError(
        "duplicateActionCell",
        `action mask contains cell ${value} more than once`,
        value,
      );
    }
    seen.add(value);
  }
}

export function validatePresentation(presentation: CellPresentation): void {
  cellId(presentation.cellId);
  for (const [channel, value] of Object.entries(presentation.color)) {
    assertIntegerInRange(value, 0xff, `${channel} color channel`);
  }
  if (presentation.effect !== "solid" && presentation.effect !== "pulse") {
    throw new ProtocolError(
      "unknownEffect",
      `effect ${String(presentation.effect)} is unknown`,
      presentation.effect,
    );
  }
}

export type ApplyDisposition = "applied" | "partial" | "rejected";

export interface AppliedScene {
  readonly generation: SceneGeneration;
  readonly leftGeneration?: SceneGeneration;
  readonly rightGeneration?: SceneGeneration;
  readonly disposition: ApplyDisposition;
}

export type CellEventKind = "down" | "up";

export interface CellEvent {
  readonly sessionId: SessionId;
  readonly sequence: number;
  readonly interactionEpoch: number;
  readonly cellId: CellId;
  readonly kind: CellEventKind;
  readonly bank: ActionBank;
}

export type DeviceErrorCode =
  | "invalidPacket"
  | "unsupportedVersion"
  | "sessionExpired"
  | "incompatibleRightHalf"
  | "electricalLimit"
  | "sessionBusy";

export type DeviceEvent =
  | { readonly kind: "cell"; readonly event: CellEvent }
  | {
      readonly kind: "interactionModeEntered";
      readonly sessionId: SessionId;
      readonly sequence: number;
      readonly interactionEpoch: number;
      readonly bank: ActionBank;
    }
  | {
      readonly kind: "interactionModeExited";
      readonly sessionId: SessionId;
      readonly sequence: number;
      readonly interactionEpoch: number;
      readonly bank: ActionBank;
    }
  | {
      readonly kind: "sceneExpired";
      readonly sessionId: SessionId;
      readonly generation: SceneGeneration;
    }
  | {
      readonly kind: "error";
      readonly sessionId: SessionId;
      readonly code: DeviceErrorCode;
    };

export interface DeviceSnapshot {
  readonly connected: boolean;
  readonly paused: boolean;
  readonly activeGeneration?: SceneGeneration;
  readonly leftGeneration?: SceneGeneration;
  readonly rightGeneration?: SceneGeneration;
  readonly leaseExpiresAtMillis?: number;
}
