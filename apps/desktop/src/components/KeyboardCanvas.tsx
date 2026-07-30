import { Maximize2, Minus, Plus } from "lucide-react";

import { keyboardGeometry } from "../domain/keyboardGeometry";
import { taskBoardCells } from "../domain/simulation";
import type { TaskTile } from "../domain/types";
import { KeyCell } from "./KeyCell";

interface KeyboardCanvasProps {
  paused: boolean;
  selectedCell: number;
  tasks: TaskTile[];
  onSelectCell: (cellId: number) => void;
}

export function KeyboardCanvas({
  paused,
  selectedCell,
  tasks,
  onSelectCell,
}: KeyboardCanvasProps) {
  const tasksByCell = new Map(tasks.map((task) => [task.cellId, task]));
  const moveSelection = (cellId: number, key: string) => {
    const halfStart = cellId < 40 ? 0 : 40;
    const halfEnd = halfStart + 39;
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -6,
      ArrowDown: 6,
    };
    const target =
      key === "Home"
        ? halfStart
        : key === "End"
          ? halfEnd
          : Math.min(halfEnd, Math.max(halfStart, cellId + offsets[key]));

    onSelectCell(target);
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-cell-id="${target}"]`)?.focus();
    });
  };

  return (
    <section className="keyboard-workspace" aria-labelledby="surface-title">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">Surface</p>
          <h2 id="surface-title">Approximate Glove80 preview</h2>
        </div>
        <div className="legend" aria-label="Task state legend">
          <span><i className="state-dot state-dot--idle" />○ Idle</span>
          <span><i className="state-dot state-dot--working" />● Working</span>
          <span><i className="state-dot state-dot--needsInput" />! Needs input</span>
          <span><i className="state-dot state-dot--completed" />✓ Completed</span>
          <span><i className="state-dot state-dot--error" />× Error</span>
          <span><i className="state-dot state-dot--stale" />? Stale</span>
        </div>
      </div>
      <div className="keyboard-canvas" data-paused={paused}>
        <div className="keyboard-half keyboard-half--left">
          <span className="half-label">Left</span>
          {keyboardGeometry.left.map((key) => (
            <KeyCell
              key={key.id}
              geometry={key}
              isBound={taskBoardCells.includes(key.id)}
              isSelected={selectedCell === key.id}
              task={tasksByCell.get(key.id)}
              onSelect={onSelectCell}
              onMove={moveSelection}
            />
          ))}
        </div>
        <div className="keyboard-half keyboard-half--right">
          <span className="half-label">Right</span>
          {keyboardGeometry.right.map((key) => (
            <KeyCell
              key={key.id}
              geometry={key}
              isBound={taskBoardCells.includes(key.id)}
              isSelected={selectedCell === key.id}
              task={tasksByCell.get(key.id)}
              onSelect={onSelectCell}
              onMove={moveSelection}
            />
          ))}
        </div>
      </div>
      <div className="canvas-toolbar" aria-label="Canvas zoom controls">
        <button type="button" aria-label="Zoom out unavailable in static preview" title="Zoom arrives with the stateful editor" disabled><Minus size={15} /></button>
        <span>100%</span>
        <button type="button" aria-label="Zoom in unavailable in static preview" title="Zoom arrives with the stateful editor" disabled><Plus size={15} /></button>
        <span className="toolbar-divider" />
        <button type="button" title="Fit arrives with the stateful editor" disabled><Maximize2 size={15} /> Fit</button>
      </div>
      <p className="canvas-help">
        Select a key to inspect this static example. Arrow keys move within a
        half; task and device connections arrive in later milestones.
      </p>
    </section>
  );
}
