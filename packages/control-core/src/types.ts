export type SemanticState =
  | "idle"
  | "working"
  | "completedUnread"
  | "needsInput"
  | "failed"
  | "stale";

export type CollectionAvailability = "online" | "stale" | "unavailable";
export type EffectKind = "solid" | "pulse";
export type SyncStatus =
  | "idle"
  | "applied"
  | "partial"
  | "paused"
  | "disconnected";

export interface Rgb {
  red: number;
  green: number;
  blue: number;
}

export interface CellPresentation {
  cellId: number;
  color: Rgb;
  effect: EffectKind;
}

export interface ActionAvailability {
  enabled: boolean;
  explanation?: string;
}

export interface ResolvedTile {
  resourceId: string;
  label: string;
  context: string;
  state: SemanticState;
  action: ActionAvailability;
  retention: "normal" | "protected";
  revision: number;
}

export interface AppPreferences {
  brightness: number;
  reduceMotion: boolean;
}

export interface TaskBoardBinding {
  bindingId: string;
  cells: number[];
  workspaceRoots: string[];
}

export interface ConfigurationDocument {
  schemaVersion: number;
  taskBoard?: TaskBoardBinding;
  preferences: AppPreferences;
}

export interface DeviceCapabilities {
  protocolVersion: number;
  topologyId: string;
  firmwareBuildId?: string;
  availableCells: number[];
  supportsInputEvents: boolean;
  supportsRightHalfAcknowledgement: boolean;
  supportedEffects: EffectKind[];
  maxSceneCells: number;
  maxLeaseMillis: number;
  maxBrightness: number;
}

export interface DeviceSnapshot {
  connected: boolean;
  paused: boolean;
  activeGeneration?: number;
  leftGeneration?: number;
  rightGeneration?: number;
  leaseExpiresAtMillis?: number;
}

export interface AppliedScene {
  generation: number;
  leftGeneration?: number;
  rightGeneration?: number;
  disposition: "applied" | "partial" | "rejected";
}

export interface DeviceView {
  capabilities: DeviceCapabilities;
  snapshot: DeviceSnapshot;
  desiredGeneration?: number;
  appliedScene?: AppliedScene;
  syncStatus: SyncStatus;
  rightHalfConnected: boolean;
  detail?: string;
}

export interface BoardSlotView {
  slot: number;
  cellId: number;
  tile?: ResolvedTile;
  presentation?: CellPresentation;
}

export interface BoardView {
  cells: number[];
  slots: BoardSlotView[];
  overflow: ResolvedTile[];
  collectionAvailability: CollectionAvailability;
  interactionEpoch?: number;
}

export interface FeedbackView {
  tone: "info" | "success" | "warning" | "error";
  message: string;
}

export interface TaskSourceView {
  kind: "simulated" | "codex";
  connection: "connecting" | "online" | "degraded" | "offline";
  observation: "simulated" | "externalDiscovery" | "ownedLive";
  label: string;
  detail: string;
  executable?: string;
  version?: string;
  lastSyncedAtMillis?: number;
}

export interface AppViewState {
  revision: number;
  mode: "simulation" | "hardware";
  configuration: ConfigurationDocument;
  device: DeviceView;
  board?: BoardView;
  taskSource: TaskSourceView;
  sourceTaskCount: number;
  feedback?: FeedbackView;
}

export type RuntimeCommand =
  | { kind: "assignTaskBoard"; cells: number[] }
  | { kind: "removeTaskBoard" }
  | { kind: "setPaused"; paused: boolean }
  | { kind: "setRightHalfConnected"; connected: boolean }
  | { kind: "setDeviceConnected"; connected: boolean }
  | {
      kind: "setPreferences";
      brightness: number;
      reduceMotion: boolean;
    }
  | {
      kind: "setTaskState";
      cellId: number;
      state: SemanticState;
    }
  | { kind: "addTask" }
  | { kind: "removeTask"; cellId: number }
  | { kind: "burst" }
  | {
      kind: "setSourceAvailability";
      availability: CollectionAvailability;
    }
  | { kind: "expireSource" }
  | { kind: "expireScene" }
  | { kind: "resetSimulation" }
  | { kind: "acknowledge"; cellId: number }
  | { kind: "beginInteraction"; epoch: number }
  | { kind: "endInteraction"; epoch: number }
  | { kind: "invokeCell"; epoch: number; cellId: number };

export interface AppBackend {
  bootstrap(): Promise<AppViewState>;
  dispatch(command: RuntimeCommand): Promise<AppViewState>;
  subscribe?(listener: (state: AppViewState) => void): () => void;
}
