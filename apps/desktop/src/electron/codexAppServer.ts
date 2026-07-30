import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { CodexThread, ThreadListPage } from "./codexProtocol";
import { parseThreadListPage } from "./codexProtocol";

const maxLineBytes = 1_048_576;
const maxPendingRequests = 32;
const maxInboundBytesPerSecond = 4 * 1_048_576;
const maxInboundMessagesPerSecond = 2_048;
const sourceKinds = [
  "cli",
  "vscode",
  "appServer",
  "subAgent",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "subAgentOther",
  "unknown",
];

export interface CodexConnectionHealth {
  connection: "connecting" | "online" | "degraded" | "offline";
  detail: string;
  executable: string;
  version?: string;
}

export interface CodexSnapshot {
  threads: CodexThread[];
  completedUnread: ReadonlySet<string>;
  syncedAtMillis: number;
  executable: string;
  version?: string;
}

export interface CodexAppServerOptions {
  executable: string;
  args?: string[];
  version?: string;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  restartBaseMs?: number;
  restartMaximumMs?: number;
  random?: () => number;
  onHealth: (health: CodexConnectionHealth) => void;
  onSnapshot: (snapshot: CodexSnapshot) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface RpcMessage {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export class CodexAppServerClient {
  private child?: ChildProcessWithoutNullStreams;
  private decoder = new BoundedJsonlDecoder(maxLineBytes);
  private pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private restartTimer?: ReturnType<typeof setTimeout>;
  private restartAttempt = 0;
  private stopped = true;
  private refreshing = false;
  private threads: CodexThread[] = [];
  private completedUnread = new Set<string>();
  private observations = new Map<
    string,
    { fingerprint: string; revision: number }
  >();
  private nextObservedRevision = 1;
  private lastStderr = "";
  private version?: string;
  private inboundWindowStartedAt = 0;
  private inboundWindowBytes = 0;
  private inboundWindowMessages = 0;

  constructor(private readonly options: CodexAppServerOptions) {
    this.version = options.version;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.rejectPending(new Error("Codex app-server stopped."));
    this.child?.kill();
    this.child = undefined;
  }

  async refreshNow(): Promise<void> {
    if (!this.child || this.refreshing) return;
    await this.refresh();
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.options.onHealth({
      connection: "connecting",
      detail: "Starting Codex app-server…",
      executable: this.options.executable,
      version: this.version,
    });
    this.decoder = new BoundedJsonlDecoder(maxLineBytes);
    this.lastStderr = "";
    this.inboundWindowStartedAt = Date.now();
    this.inboundWindowBytes = 0;
    this.inboundWindowMessages = 0;
    const child = spawn(
      this.options.executable,
      this.options.args ?? ["app-server", "--listen", "stdio://"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    this.child = child;
    child.stdout.on("data", (chunk: Buffer) => this.receive(chunk, child));
    child.stderr.on("data", (chunk: Buffer) =>
      this.receiveStderr(chunk, child),
    );
    for (const stream of [child.stdin, child.stdout, child.stderr]) {
      stream.on("error", (error) => this.disconnect(child, error));
    }
    child.once("error", (error) => this.disconnect(child, error));
    child.once("exit", (code, signal) => {
      this.disconnect(
        child,
        new Error(
          `Codex app-server exited (${signal ?? code ?? "unknown"}).`,
        ),
      );
    });

    try {
      await waitForSpawn(child);
      if (!this.version) {
        this.version = await readCodexVersion(this.options.executable);
      }
      this.options.onHealth({
        connection: "connecting",
        detail: "Initializing the Codex app-server protocol…",
        executable: this.options.executable,
        version: this.version,
      });
      await this.request("initialize", {
        clientInfo: {
          name: "glove80_control_surface",
          title: "Glove80 Control Surface",
          version: "0.0.0",
        },
        capabilities: {
          optOutNotificationMethods: [
            "item/agentMessage/delta",
            "item/commandExecution/outputDelta",
            "item/fileChange/outputDelta",
          ],
        },
      });
      this.notify("initialized", {});
      await this.refresh();
    } catch (error) {
      this.disconnect(
        child,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private async refresh(): Promise<void> {
    if (this.refreshing || !this.child) return;
    this.refreshing = true;
    try {
      const threads: CodexThread[] = [];
      let cursor: string | null = null;
      for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
        const result = await this.request("thread/list", {
          cursor,
          limit: 100,
          sortKey: "recency_at",
          sortDirection: "desc",
          sourceKinds,
          archived: false,
          // Installed 0.144.6 returned zero rows from the state database
          // alone. The documented default also scans persisted rollouts and
          // may refresh Codex's metadata index; it never resumes a thread.
          useStateDbOnly: false,
        });
        const page: ThreadListPage = parseThreadListPage(result);
        threads.push(...page.data);
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      this.observeThreads(threads);
      this.threads = threads;
      this.options.onSnapshot({
        threads: [...threads],
        completedUnread: new Set(this.completedUnread),
        syncedAtMillis: Date.now(),
        executable: this.options.executable,
        version: this.version,
      });
      this.options.onHealth({
        connection: "online",
        detail: cursor
          ? "Showing the 500 most recent Codex tasks."
          : `${threads.filter((thread) => !thread.parentThreadId).length} persisted Codex tasks discovered. Activity remains unknown for tasks owned by another process.`,
        executable: this.options.executable,
        version: this.version,
      });
      this.restartAttempt = 0;
    } catch (error) {
      this.options.onHealth({
        connection: "degraded",
        detail:
          error instanceof Error
            ? error.message
            : "Codex task refresh failed.",
        executable: this.options.executable,
        version: this.version,
      });
    } finally {
      this.refreshing = false;
      this.schedulePoll();
    }
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    if (!this.child || this.child.stdin.destroyed) {
      return Promise.reject(new Error("Codex app-server is not connected."));
    }
    if (this.pending.size >= maxPendingRequests) {
      return Promise.reject(
        new Error("Codex app-server request queue is full."),
      );
    }
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, this.options.requestTimeoutMs ?? 10_000);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.write({ id, method, params });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private notify(method: string, params?: unknown): void {
    this.write({ method, params });
  }

  private write(message: RpcMessage): void {
    const line = `${JSON.stringify(message)}\n`;
    const lineBytes = Buffer.byteLength(line);
    if (lineBytes > maxLineBytes) {
      throw new Error("Codex app-server request exceeded the line limit.");
    }
    const child = this.child;
    if (!child || child.stdin.destroyed) {
      throw new Error("Codex app-server is not connected.");
    }
    if (child.stdin.writableLength + lineBytes > maxLineBytes) {
      throw new Error("Codex app-server write buffer exceeded its limit.");
    }
    child.stdin.write(line);
  }

  private receive(
    chunk: Buffer,
    child: ChildProcessWithoutNullStreams,
  ): void {
    if (this.child !== child) return;
    try {
      this.accountInbound(chunk.length, 0);
      const lines = this.decoder.push(chunk);
      this.accountInbound(0, lines.length);
      for (const line of lines) {
        this.handleMessage(JSON.parse(line) as unknown);
      }
    } catch (error) {
      this.disconnect(
        child,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private accountInbound(bytes: number, messages: number): void {
    const now = Date.now();
    if (now - this.inboundWindowStartedAt >= 1_000) {
      this.inboundWindowStartedAt = now;
      this.inboundWindowBytes = 0;
      this.inboundWindowMessages = 0;
    }
    this.inboundWindowBytes += bytes;
    this.inboundWindowMessages += messages;
    if (
      this.inboundWindowBytes > maxInboundBytesPerSecond ||
      this.inboundWindowMessages > maxInboundMessagesPerSecond
    ) {
      throw new Error("Codex app-server exceeded its inbound rate limit.");
    }
  }

  private receiveStderr(
    chunk: Buffer,
    child: ChildProcessWithoutNullStreams,
  ): void {
    if (this.child !== child) return;
    try {
      this.accountInbound(chunk.length, 0);
      this.lastStderr = `${this.lastStderr}${chunk.toString("utf8")}`.slice(
        -4_096,
      );
    } catch (error) {
      this.disconnect(
        child,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private handleMessage(value: unknown): void {
    if (!isRecord(value)) {
      throw new Error("Codex app-server emitted a non-object message.");
    }
    const message = value as RpcMessage;
    if (
      (typeof message.id === "number" ||
        typeof message.id === "string") &&
      message.method
    ) {
      // This client never owns turns or approvals. Rejecting unexpected
      // server requests prevents an accidental indefinite wait.
      this.write({
        id: message.id,
        error: {
          code: -32_601,
          message: "This observer does not handle server requests.",
        },
      });
      return;
    }
    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(
            message.error.message ??
              `Codex request failed (${message.error.code ?? "unknown"}).`,
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (typeof message.method === "string") {
      this.handleNotification(message.method, message.params);
    }
  }

  private handleNotification(method: string, params: unknown): void {
    if (!isRecord(params) || typeof params.threadId !== "string") return;
    const threadId = params.threadId;
    const thread = this.threads.find((candidate) => candidate.id === threadId);
    if (method === "thread/status/changed" && thread) {
      thread.status = parseNotificationStatus(params.status);
      this.observeThread(thread);
      this.emitCurrentSnapshot();
      return;
    }
    if (method === "turn/started" && thread) {
      thread.status = { type: "active", activeFlags: [] };
      this.completedUnread.delete(threadId);
      this.observeThread(thread);
      this.emitCurrentSnapshot();
      return;
    }
    if (method === "turn/completed" && thread) {
      const turn = isRecord(params.turn) ? params.turn : undefined;
      thread.status =
        turn?.status === "failed"
          ? { type: "systemError" }
          : turn?.status === "completed"
            ? { type: "idle" }
            : { type: "notLoaded" };
      if (turn?.status === "completed") {
        this.completedUnread.add(threadId);
      }
      this.observeThread(thread);
      this.emitCurrentSnapshot();
    }
  }

  private observeThreads(threads: CodexThread[]): void {
    const current = new Map<
      string,
      { fingerprint: string; revision: number }
    >();
    for (const thread of threads) {
      const observation = this.observeThread(thread);
      current.set(thread.id, observation);
    }
    this.observations = current;
  }

  private observeThread(
    thread: CodexThread,
  ): { fingerprint: string; revision: number } {
    const fingerprint = JSON.stringify([
      thread.name,
      thread.preview,
      thread.cwd,
      thread.updatedAt,
      thread.status,
      this.completedUnread.has(thread.id),
    ]);
    const previous = this.observations.get(thread.id);
    const observation =
      previous?.fingerprint === fingerprint
        ? previous
        : {
            fingerprint,
            revision: this.nextObservedRevision++,
          };
    thread.observedRevision = observation.revision;
    this.observations.set(thread.id, observation);
    return observation;
  }

  private emitCurrentSnapshot(): void {
    this.options.onSnapshot({
      threads: [...this.threads],
      completedUnread: new Set(this.completedUnread),
      syncedAtMillis: Date.now(),
      executable: this.options.executable,
      version: this.version,
    });
  }

  private disconnect(
    child: ChildProcessWithoutNullStreams,
    error: Error,
  ): void {
    if (this.child !== child) return;
    this.child = undefined;
    child.kill();
    this.rejectPending(error);
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
    if (this.stopped) return;

    const delay = this.restartDelay();
    const stderr = this.lastStderr.trim();
    this.options.onHealth({
      connection: "offline",
      detail: `${error.message}${stderr ? ` ${stderr}` : ""} Retrying shortly.`,
      executable: this.options.executable,
      version: this.version,
    });
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      void this.connect();
    }, delay);
  }

  private schedulePoll(): void {
    if (this.stopped || !this.child) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => {
      this.pollTimer = undefined;
      void this.refresh();
    }, this.options.pollIntervalMs ?? 5_000);
  }

  private restartDelay(): number {
    const base = this.options.restartBaseMs ?? 500;
    const maximum = this.options.restartMaximumMs ?? 30_000;
    const delay = calculateRestartDelay(
      this.restartAttempt,
      base,
      maximum,
      this.options.random?.() ?? Math.random(),
    );
    this.restartAttempt += 1;
    return delay;
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private clearTimers(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.pollTimer = undefined;
    this.restartTimer = undefined;
  }
}

export function calculateRestartDelay(
  attempt: number,
  baseMillis: number,
  maximumMillis: number,
  randomUnit: number,
): number {
  const exponential = Math.min(
    maximumMillis,
    baseMillis * 2 ** Math.max(0, attempt),
  );
  const jitter = 0.8 + Math.min(1, Math.max(0, randomUnit)) * 0.4;
  return Math.min(maximumMillis, Math.round(exponential * jitter));
}

function waitForSpawn(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (child.pid !== undefined) return Promise.resolve();
  return new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
}

export class BoundedJsonlDecoder {
  private buffer = Buffer.alloc(0);

  constructor(private readonly maximumLineBytes: number) {}

  push(chunk: Buffer): string[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const lines: string[] = [];
    while (true) {
      const newline = this.buffer.indexOf(0x0a);
      if (newline < 0) break;
      if (newline > this.maximumLineBytes) {
        throw new Error("Codex app-server emitted an oversized JSONL line.");
      }
      const line = this.buffer.subarray(0, newline).toString("utf8").trim();
      this.buffer = this.buffer.subarray(newline + 1);
      if (line) lines.push(line);
    }
    if (this.buffer.length > this.maximumLineBytes) {
      throw new Error("Codex app-server emitted an oversized JSONL line.");
    }
    return lines;
  }
}

export async function discoverCodexExecutable(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const executableName =
    process.platform === "win32" ? "codex.exe" : "codex";
  const candidates = [
    environment.GLOVE80_CODEX_EXECUTABLE,
    path.join(os.homedir(), ".local", "bin", executableName),
    ...(process.platform === "darwin"
      ? [
          `/opt/homebrew/bin/${executableName}`,
          `/usr/local/bin/${executableName}`,
        ]
      : []),
    ...(environment.PATH ?? "")
      .split(path.delimiter)
      .filter(Boolean)
      .map((directory) => path.join(directory, executableName)),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of [...new Set(candidates)]) {
    try {
      await access(
        candidate,
        process.platform === "win32" ? constants.F_OK : constants.X_OK,
      );
      return await realpath(candidate);
    } catch {
      // Continue through the explicit, home-local, and PATH candidates.
    }
  }
  return undefined;
}

async function readCodexVersion(executable: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      executable,
      ["--version"],
      { timeout: 5_000, windowsHide: true },
      (error, stdout) => {
        resolve(error ? "unknown" : stdout.trim() || "unknown");
      },
    );
  });
}

function parseNotificationStatus(value: unknown): CodexThread["status"] {
  if (!isRecord(value) || typeof value.type !== "string") {
    return { type: "notLoaded" };
  }
  if (value.type === "active") {
    return {
      type: "active",
      activeFlags: Array.isArray(value.activeFlags)
        ? value.activeFlags.filter(
            (flag): flag is string => typeof flag === "string",
          )
        : [],
    };
  }
  if (value.type === "idle" || value.type === "systemError") {
    return { type: value.type };
  }
  return { type: "notLoaded" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
