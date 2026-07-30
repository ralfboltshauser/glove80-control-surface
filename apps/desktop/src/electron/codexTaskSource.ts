import type { AppViewState } from "../domain/types";
import { SimulationRuntime } from "../runtime/simulationRuntime";
import {
  CodexAppServerClient,
  type CodexConnectionHealth,
  type CodexSnapshot,
  discoverCodexExecutable,
} from "./codexAppServer";
import { mapCodexThreads } from "./codexProtocol";

export class CodexTaskSource {
  private client?: CodexAppServerClient;
  private health?: CodexConnectionHealth;
  private snapshot?: CodexSnapshot;
  private publishQueue = Promise.resolve();
  private stopped = false;

  constructor(
    private readonly runtime: SimulationRuntime,
    private readonly onState: (state: AppViewState) => void,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    const executable = await discoverCodexExecutable();
    if (this.stopped) return;
    if (!executable) {
      await this.publishUnavailable(
        "No user-installed Codex CLI was found. Install Codex or set GLOVE80_CODEX_EXECUTABLE.",
      );
      return;
    }

    this.health = {
      connection: "connecting",
      detail: "Starting Codex app-server…",
      executable,
    };
    await this.publish();
    this.client = new CodexAppServerClient({
      executable,
      onHealth: (health) => {
        this.health = health;
        this.queuePublish();
      },
      onSnapshot: (snapshot) => {
        this.snapshot = snapshot;
        this.queuePublish();
      },
    });
    this.client.start();
  }

  stop(): void {
    this.stopped = true;
    this.client?.stop();
    this.client = undefined;
  }

  private queuePublish(): void {
    this.publishQueue = this.publishQueue
      .then(() => this.publish())
      .catch((error: unknown) => {
        console.error("Codex task source update failed.", error);
      });
  }

  private async publish(): Promise<void> {
    if (this.stopped) return;
    const health = this.health;
    const snapshot = this.snapshot;
    const connection = health?.connection ?? "connecting";
    const state = await this.runtime.replaceTaskSource({
      tasks: mapCodexThreads(snapshot?.threads ?? [], {
        actionEnabled:
          process.platform === "darwin" || process.platform === "win32",
        completedUnread: snapshot?.completedUnread,
      }),
      availability:
        connection === "online"
          ? "online"
          : snapshot
            ? "stale"
            : "unavailable",
      source: {
        kind: "codex",
        connection,
        observation: "externalDiscovery",
        label: "Codex app-server",
        detail:
          health?.detail ??
          "Connecting to persisted Codex task discovery…",
        executable: health?.executable,
        version: health?.version,
        lastSyncedAtMillis: snapshot?.syncedAtMillis,
      },
    });
    this.onState(state);
  }

  private async publishUnavailable(detail: string): Promise<void> {
    const state = await this.runtime.replaceTaskSource({
      tasks: [],
      availability: "unavailable",
      source: {
        kind: "codex",
        connection: "offline",
        observation: "externalDiscovery",
        label: "Codex app-server",
        detail,
      },
    });
    this.onState(state);
  }
}
