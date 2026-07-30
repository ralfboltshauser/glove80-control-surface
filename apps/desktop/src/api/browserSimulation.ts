import type { ConfigurationDocument } from "../domain/types";
import {
  parseConfiguration,
  SimulationRuntime,
  type ConfigurationStore,
} from "../runtime/simulationRuntime";

const storageKey = "glove80-control-surface.simulation.configuration.v1";

class BrowserConfigurationStore implements ConfigurationStore {
  read(): unknown | undefined {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return undefined;
    try {
      return parseConfiguration(JSON.parse(stored));
    } catch {
      window.localStorage.setItem(
        `${storageKey}.corrupt-${Date.now()}`,
        stored,
      );
      window.localStorage.removeItem(storageKey);
      return undefined;
    }
  }

  write(configuration: ConfigurationDocument): void {
    window.localStorage.setItem(storageKey, JSON.stringify(configuration));
  }
}

export class BrowserSimulationBackend extends SimulationRuntime {
  constructor() {
    super(new BrowserConfigurationStore(), {
      demo: new URLSearchParams(window.location.search).has("demo"),
    });
  }
}
