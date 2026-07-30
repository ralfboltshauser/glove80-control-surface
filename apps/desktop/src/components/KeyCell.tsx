import type { CSSProperties, MouseEvent } from "react";

import type { KeyGeometry } from "../domain/keyboardGeometry";
import type {
  CellPresentation,
  ResolvedTile,
  SemanticState,
} from "../domain/types";

interface KeyCellProps {
  geometry: KeyGeometry;
  boundOrder?: number;
  draftOrder?: number;
  editing: boolean;
  isSelected: boolean;
  presentation?: CellPresentation;
  tile?: ResolvedTile;
  onSelect: (event: MouseEvent<HTMLButtonElement>, cellId: number) => void;
  onMove: (cellId: number, key: string) => void;
}

const stateNames: Record<SemanticState, string> = {
  idle: "idle",
  working: "working",
  completedUnread: "completed and unread",
  needsInput: "needs input",
  failed: "failed",
  stale: "stale",
};

const stateSymbols: Record<SemanticState, string> = {
  idle: "○",
  working: "●",
  completedUnread: "✓",
  needsInput: "!",
  failed: "×",
  stale: "?",
};

export function KeyCell({
  geometry,
  boundOrder,
  draftOrder,
  editing,
  isSelected,
  presentation,
  tile,
  onSelect,
  onMove,
}: KeyCellProps) {
  const state = tile?.state;
  const order = editing ? draftOrder : boundOrder;
  const isBound = boundOrder !== undefined;
  const isDrafted = draftOrder !== undefined;
  const accessibleName = [
    geometry.position,
    editing
      ? isDrafted
        ? `draft slot ${draftOrder + 1}`
        : "not in draft region"
      : isBound
        ? `task board slot ${boundOrder + 1}`
        : "unassigned",
    tile?.label,
    state ? stateNames[state] : undefined,
    `Base key ${geometry.legend}`,
  ]
    .filter(Boolean)
    .join(", ");
  const style = {
    left: geometry.x,
    top: geometry.y,
    transform: geometry.rotation
      ? `rotate(${geometry.rotation}deg)`
      : undefined,
    "--key-light": presentation
      ? `rgb(${presentation.color.red} ${presentation.color.green} ${presentation.color.blue})`
      : undefined,
  } as CSSProperties;

  return (
    <button
      type="button"
      className="key-cell"
      data-bound={isBound}
      data-cell-id={geometry.id}
      data-drafted={editing && isDrafted}
      data-effect={presentation?.effect}
      data-selected={isSelected}
      data-state={state}
      aria-label={accessibleName}
      aria-pressed={editing ? isDrafted : isSelected}
      tabIndex={isSelected ? 0 : -1}
      title={accessibleName}
      style={style}
      onClick={(event) => onSelect(event, geometry.id)}
      onKeyDown={(event) => {
        if (
          [
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Home",
            "End",
          ].includes(event.key)
        ) {
          event.preventDefault();
          onMove(geometry.id, event.key);
        }
      }}
    >
      <span className="key-cell__position">{geometry.shortPosition}</span>
      {order !== undefined && (
        <span className="key-cell__order" aria-hidden="true">
          {order + 1}
        </span>
      )}
      {presentation && (
        <span className="key-cell__light" aria-hidden="true" />
      )}
      <span
        className="key-cell__legend"
        data-compact={geometry.legend.length > 4}
        aria-hidden="true"
      >
        {geometry.legend}
      </span>
      {state && (
        <span className="key-cell__state-symbol" aria-hidden="true">
          {stateSymbols[state]}
        </span>
      )}
    </button>
  );
}
