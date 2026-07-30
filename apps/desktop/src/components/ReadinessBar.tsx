import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  CircleEllipsis,
  Code2,
  Grid3X3,
  Info,
  X,
} from "lucide-react";

import type { AppViewState } from "../domain/types";

interface ReadinessBarProps {
  state: AppViewState;
  error?: string;
  pending: boolean;
  onDismissError: () => void;
}

export function ReadinessBar({
  state,
  error,
  pending,
  onDismissError,
}: ReadinessBarProps) {
  const boardCells = state.board?.cells.length ?? 0;
  const keyboard = keyboardStatus(state);
  const codex = codexStatus(state);
  const board = {
    tone: boardCells > 0 ? "ready" : "muted",
    value: boardCells > 0 ? `${boardCells}/80 keys` : "Choose keys",
  } as const;
  const message = contextualMessage(state, error);
  const messageTone = error
    ? "error"
    : state.feedback?.tone ?? (state.device.snapshot.connected ? "info" : "warning");
  const MessageIcon =
    messageTone === "success"
      ? CheckCircle2
      : messageTone === "warning" || messageTone === "error"
        ? AlertTriangle
        : Info;

  return (
    <section className="readiness-bar" aria-label="System readiness">
      <StatusNode
        icon={Cable}
        label="Keyboard"
        tone={keyboard.tone}
        value={keyboard.value}
      />
      <StatusNode
        icon={Code2}
        label="Codex"
        tone={codex.tone}
        value={codex.value}
      />
      <StatusNode
        icon={Grid3X3}
        label="Task board"
        tone={board.tone}
        value={board.value}
      />
      <div
        className="readiness-bar__message"
        data-tone={messageTone}
        role={error ? "alert" : "status"}
      >
        {pending ? (
          <CircleEllipsis size={15} aria-hidden="true" />
        ) : (
          <MessageIcon size={15} aria-hidden="true" />
        )}
        <span>{pending ? "Applying the latest state…" : message}</span>
        {error && (
          <button
            className="icon-button icon-button--small"
            type="button"
            aria-label="Dismiss error"
            onClick={onDismissError}
          >
            <X size={15} />
          </button>
        )}
      </div>
    </section>
  );
}

interface StatusNodeProps {
  icon: typeof Cable;
  label: string;
  tone: "ready" | "working" | "warning" | "error" | "muted";
  value: string;
}

function StatusNode({
  icon: Icon,
  label,
  tone,
  value,
}: StatusNodeProps) {
  return (
    <div className="readiness-node" data-tone={tone}>
      <span className="readiness-node__icon" aria-hidden="true">
        <Icon size={15} />
      </span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function keyboardStatus(state: AppViewState): {
  tone: StatusNodeProps["tone"];
  value: string;
} {
  switch (state.device.syncStatus) {
    case "applied":
      return { tone: "ready", value: "Both halves synchronized" };
    case "partial":
      return { tone: "warning", value: "Synchronizing" };
    case "paused":
      return { tone: "muted", value: "Paused" };
    case "idle":
      return { tone: "ready", value: "USB connected" };
    case "disconnected":
      return { tone: "error", value: "USB disconnected" };
  }
}

function codexStatus(state: AppViewState): {
  tone: StatusNodeProps["tone"];
  value: string;
} {
  switch (state.taskSource.connection) {
    case "online":
      return {
        tone: "ready",
        value: `${state.sourceTaskCount} ${state.sourceTaskCount === 1 ? "task" : "tasks"}`,
      };
    case "connecting":
      return { tone: "working", value: "Connecting" };
    case "degraded":
      return { tone: "warning", value: "Needs attention" };
    case "offline":
      return { tone: "error", value: "Unavailable" };
  }
}

function contextualMessage(state: AppViewState, error?: string): string {
  if (error) return error;
  if (state.feedback) return state.feedback.message;
  if (!state.board) {
    return "Choose any keys—or all 80—to create a board. No keyboard connection is required.";
  }
  if (!state.device.snapshot.connected) {
    return "Configure offline now; LEDs and Control resume automatically after left-half USB reconnect.";
  }
  if (
    state.taskSource.kind === "codex" &&
    state.taskSource.observation === "externalDiscovery"
  ) {
    return "Task discovery is live. Activity stays unknown for tasks owned by another Codex process.";
  }
  return state.taskSource.detail;
}
