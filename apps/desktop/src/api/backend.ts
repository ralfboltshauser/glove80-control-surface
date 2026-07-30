import type {
  AppBackend,
  AppViewState,
  RuntimeCommand,
} from "../domain/types";
import { BrowserSimulationBackend } from "./browserSimulation";

class ElectronBackend implements AppBackend {
  async bootstrap(): Promise<AppViewState> {
    return requireBridge().bootstrap();
  }

  async dispatch(command: RuntimeCommand): Promise<AppViewState> {
    return requireBridge().dispatch(command);
  }
}

export function createBackend(): AppBackend {
  if (window.glove80ControlSurface) {
    return new ElectronBackend();
  }
  return new BrowserSimulationBackend();
}

function requireBridge() {
  const bridge = window.glove80ControlSurface;
  if (!bridge) throw new Error("Electron bridge is unavailable.");
  return bridge;
}
