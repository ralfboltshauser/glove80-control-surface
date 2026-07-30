import type { KeyGeometry } from "../domain/keyboardGeometry";
import type { TaskTile } from "../domain/types";

interface KeyCellProps {
  geometry: KeyGeometry;
  isBound: boolean;
  isSelected: boolean;
  task?: TaskTile;
  onSelect: (cellId: number) => void;
  onMove: (cellId: number, key: string) => void;
}

const stateNames = {
  idle: "idle",
  working: "working",
  completed: "completed",
  needsInput: "needs input",
  error: "error",
  stale: "stale",
} as const;

const stateSymbols = {
  idle: "○",
  working: "●",
  completed: "✓",
  needsInput: "!",
  error: "×",
  stale: "?",
} as const;

export function KeyCell({
  geometry,
  isBound,
  isSelected,
  task,
  onSelect,
  onMove,
}: KeyCellProps) {
  const state = task?.state;
  const accessibleName = [
    `${geometry.half} half ${geometry.label}`,
    isBound ? "Codex board sample slot" : "unassigned",
    task?.title,
    state ? stateNames[state] : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      className="key-cell"
      data-bound={isBound}
      data-cell-id={geometry.id}
      data-selected={isSelected}
      data-state={state}
      aria-label={accessibleName}
      aria-pressed={isSelected}
      tabIndex={isSelected ? 0 : -1}
      style={{ left: geometry.x, top: geometry.y }}
      onClick={() => onSelect(geometry.id)}
      onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          onMove(geometry.id, event.key);
        }
      }}
    >
      <span className="key-cell__legend">{geometry.label}</span>
      {isBound && <span className="key-cell__badge">C</span>}
      {state && <span className="key-cell__light" aria-hidden="true" />}
      {state && (
        <span className="key-cell__state-symbol" aria-hidden="true">
          {stateSymbols[state]}
        </span>
      )}
    </button>
  );
}
