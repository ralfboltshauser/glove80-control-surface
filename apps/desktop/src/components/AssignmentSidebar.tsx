import { CalendarDays, LayoutGrid, Plus } from "lucide-react";

export function AssignmentSidebar() {
  return (
    <nav className="assignment-sidebar" aria-label="Assignments">
      <div className="panel-heading">
        <span>Assignments</span>
        <button
          className="icon-button icon-button--small"
          type="button"
          aria-label="Add assignment unavailable in static preview"
          title="Assignment editing arrives with the stateful simulator"
          disabled
        >
          <Plus size={16} />
        </button>
      </div>
      <button className="assignment assignment--selected" type="button">
        <span className="assignment__icon assignment__icon--codex">
          <LayoutGrid size={17} />
        </span>
        <span>
          <strong>Codex task board</strong>
          <small>12 sample keys · 6 occupied</small>
        </span>
      </button>
      <button className="assignment" type="button" disabled>
        <span className="assignment__icon">
          <CalendarDays size={17} />
        </span>
        <span>
          <strong>Next meeting</strong>
          <small>Not configured</small>
        </span>
      </button>
      <div className="sidebar-note">
        <strong>No chat maintenance</strong>
        <p>Current Codex tasks fill the board and keep stable slots.</p>
      </div>
    </nav>
  );
}
