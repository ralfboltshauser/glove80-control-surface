import path from "node:path";

import type {
  ResolvedTile,
  SemanticState,
} from "../domain/types";

export type CodexThreadStatus =
  | { type: "notLoaded" }
  | { type: "idle" }
  | { type: "systemError" }
  | {
      type: "active";
      activeFlags: Array<
        "waitingOnApproval" | "waitingOnUserInput" | string
      >;
    };

export interface CodexThread {
  id: string;
  parentThreadId?: string | null;
  preview: string;
  name?: string | null;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  recencyAt?: number | null;
  status: CodexThreadStatus;
  source: unknown;
  observedRevision: number;
}

export interface ThreadListPage {
  data: CodexThread[];
  nextCursor: string | null;
}

export function parseThreadListPage(value: unknown): ThreadListPage {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new Error("Codex returned an invalid thread/list result.");
  }
  return {
    data: value.data.map(parseThread),
    nextCursor:
      typeof value.nextCursor === "string" ? value.nextCursor : null,
  };
}

export function mapCodexThreads(
  threads: CodexThread[],
  options: {
    actionEnabled: boolean;
    completedUnread?: ReadonlySet<string>;
  },
): ResolvedTile[] {
  const rootsOnly = threads.filter((thread) => !thread.parentThreadId);
  return rootsOnly.map((thread) => {
    const state =
      options.completedUnread?.has(thread.id) &&
      thread.status.type === "idle"
        ? "completedUnread"
        : semanticState(thread.status);
    return {
      resourceId: thread.id,
      label: threadLabel(thread),
      context: workspaceLabel(thread.cwd),
      state,
      action: options.actionEnabled
        ? { enabled: true }
        : {
            enabled: false,
            explanation:
              "Opening Codex Desktop tasks is unavailable on this platform.",
          },
      retention:
        state === "idle" || state === "stale" ? "normal" : "protected",
      revision: thread.observedRevision,
    };
  });
}

export function semanticState(status: CodexThreadStatus): SemanticState {
  switch (status.type) {
    case "active":
      return status.activeFlags.some(
        (flag) =>
          flag === "waitingOnApproval" ||
          flag === "waitingOnUserInput",
      )
        ? "needsInput"
        : "working";
    case "systemError":
      return "failed";
    case "idle":
      return "idle";
    case "notLoaded":
      // A separately spawned app-server cannot observe the runtime status of
      // tasks owned by Codex Desktop or another CLI process.
      return "stale";
  }
}

export function isCodexThreadId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parseThread(value: unknown): CodexThread {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.preview !== "string" ||
    typeof value.cwd !== "string" ||
    typeof value.createdAt !== "number" ||
    typeof value.updatedAt !== "number"
  ) {
    throw new Error("Codex returned an invalid thread record.");
  }
  return {
    id: value.id,
    parentThreadId:
      typeof value.parentThreadId === "string"
        ? value.parentThreadId
        : null,
    preview: value.preview,
    name: typeof value.name === "string" ? value.name : null,
    cwd: value.cwd,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    recencyAt:
      typeof value.recencyAt === "number" ? value.recencyAt : null,
    status: parseStatus(value.status),
    source: value.source,
    observedRevision: 1,
  };
}

function parseStatus(value: unknown): CodexThreadStatus {
  if (!isRecord(value) || typeof value.type !== "string") {
    return { type: "notLoaded" };
  }
  switch (value.type) {
    case "idle":
      return { type: "idle" };
    case "systemError":
      return { type: "systemError" };
    case "active":
      return {
        type: "active",
        activeFlags: Array.isArray(value.activeFlags)
          ? value.activeFlags.filter(
              (flag): flag is string => typeof flag === "string",
            )
          : [],
      };
    default:
      return { type: "notLoaded" };
  }
}

function threadLabel(thread: CodexThread): string {
  const candidate = thread.name?.trim() || thread.preview.trim();
  const line = candidate.split(/\r?\n/, 1)[0]?.trim();
  return line ? truncate(line, 72) : "Untitled Codex task";
}

function workspaceLabel(cwd: string): string {
  const normalized = cwd.replace(/[\\/]+$/, "");
  return path.basename(normalized) || normalized || "Codex";
}

function truncate(value: string, length: number): string {
  return value.length <= length
    ? value
    : `${value.slice(0, length - 1).trimEnd()}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
