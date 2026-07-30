import type {
  AppViewState,
  RuntimeCommand,
} from "./domain/types";

declare global {
  interface Window {
    glove80ControlSurface?: {
      bootstrap(): Promise<AppViewState>;
      dispatch(command: RuntimeCommand): Promise<AppViewState>;
      onStateChanged(listener: (state: AppViewState) => void): () => void;
    };
    glove80DesktopLifecycle?: {
      setDraftDirty(dirty: boolean): void;
      onSaveDraftRequested(listener: () => void): () => void;
    };
  }
}

export {};
