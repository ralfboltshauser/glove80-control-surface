export type TaskState =
  | "idle"
  | "working"
  | "completed"
  | "needsInput"
  | "error"
  | "stale";

export interface TaskTile {
  cellId: number;
  title: string;
  workspace: string;
  state: TaskState;
  updatedLabel: string;
  protected: boolean;
}
