import type { TaskTile } from "./types";

export const sampleTasks: TaskTile[] = [
  {
    cellId: 0,
    title: "Glove80 control surface",
    workspace: "glove80-control-surface",
    state: "needsInput",
    updatedLabel: "just now",
    protected: true,
  },
  {
    cellId: 1,
    title: "Cross-platform desktop shell",
    workspace: "glove80-control-surface",
    state: "working",
    updatedLabel: "1 min ago",
    protected: true,
  },
  {
    cellId: 2,
    title: "Codex app-server research",
    workspace: "glove80-control-surface",
    state: "completed",
    updatedLabel: "3 min ago",
    protected: true,
  },
  {
    cellId: 3,
    title: "Firmware protocol notes",
    workspace: "glove80-control-surface",
    state: "idle",
    updatedLabel: "18 min ago",
    protected: false,
  },
  {
    cellId: 4,
    title: "Visual editor review",
    workspace: "glove80-control-surface",
    state: "error",
    updatedLabel: "21 min ago",
    protected: true,
  },
  {
    cellId: 5,
    title: "Hardware descriptor audit",
    workspace: "glove80-codex-status",
    state: "stale",
    updatedLabel: "2 hr ago",
    protected: false,
  },
];

export const taskBoardCells = Array.from({ length: 12 }, (_, index) => index);
