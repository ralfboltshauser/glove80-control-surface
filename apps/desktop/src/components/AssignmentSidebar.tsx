import {
  CalendarDays,
  LayoutGrid,
  Plus,
} from "lucide-react";

import type { BoardView, TaskSourceView } from "../domain/types";

interface AssignmentSidebarProps {
  board?: BoardView;
  sourceTaskCount: number;
  taskSource: TaskSourceView;
  onConfigure: () => void;
}

export function AssignmentSidebar({
  board,
  sourceTaskCount,
  taskSource,
  onConfigure,
}: AssignmentSidebarProps) {
  const occupied = board?.slots.filter((slot) => slot.tile).length ?? 0;

  return (
    <nav className="assignment-sidebar" aria-label="Assignments">
      <div className="panel-heading">
        <span>Assignments</span>
        <button
          className="icon-button icon-button--small"
          type="button"
          aria-label={board ? "Edit task board keys" : "Add task board"}
          title={board ? "Edit task board keys" : "Add task board"}
          onClick={onConfigure}
        >
          <Plus size={16} />
        </button>
      </div>
      <button
        className="assignment assignment--selected"
        type="button"
        aria-label={
          board
            ? `Codex task board, ${board.cells.length} keys, ${occupied} occupied`
            : "Codex task board, choose keys once"
        }
        onClick={onConfigure}
      >
        <span className="assignment__icon assignment__icon--codex">
          <LayoutGrid size={17} />
        </span>
        <span>
          <strong>Codex task board</strong>
          <small>
            {board
              ? `${board.cells.length} keys · ${occupied} occupied`
              : "Choose keys once"}
          </small>
        </span>
      </button>
      <button
        className="assignment"
        type="button"
        aria-label="Next meeting, not available in this milestone"
        disabled
        title="Calendar remains behind its evidence gate"
      >
        <span className="assignment__icon">
          <CalendarDays size={17} />
        </span>
        <span>
          <strong>Next meeting</strong>
          <small>Not in this milestone</small>
        </span>
      </button>
      <div className="sidebar-note">
        <strong>
          {taskSource.kind === "codex"
            ? taskSource.label
            : "No chat maintenance"}
        </strong>
        <p>
          {sourceTaskCount} changing{" "}
          {taskSource.kind === "codex" ? "Codex" : "simulated"} tasks feed one
          durable physical region.
        </p>
        <p className="source-detail" data-connection={taskSource.connection}>
          {taskSource.detail}
        </p>
      </div>
    </nav>
  );
}
