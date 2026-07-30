import {
  CalendarDays,
  LayoutGrid,
  Plus,
  Radar,
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
          <small>Planned · permission-gated</small>
        </span>
      </button>
      <div className="sidebar-note">
        <div className="sidebar-note__heading">
          <span className="sidebar-note__icon" aria-hidden="true">
            <Radar size={15} />
          </span>
          <strong>
            {taskSource.kind === "codex"
              ? "Codex discovery"
              : "Generated task source"}
          </strong>
          <span className="source-connection" data-connection={taskSource.connection}>
            {taskSource.connection}
          </span>
        </div>
        <p>
          {sourceTaskCount} changing{" "}
          {taskSource.kind === "codex" ? "Codex" : "simulated"}{" "}
          {sourceTaskCount === 1 ? "task feeds" : "tasks feed"} this durable
          physical region.
        </p>
        <p className="source-detail" data-connection={taskSource.connection}>
          {taskSource.detail}
        </p>
        {taskSource.lastSyncedAtMillis && (
          <small className="source-sync">
            Synced {formatClock(taskSource.lastSyncedAtMillis)}
          </small>
        )}
      </div>
    </nav>
  );
}

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}
