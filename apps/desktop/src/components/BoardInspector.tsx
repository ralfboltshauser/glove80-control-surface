import { ArrowUpRight, Layers3, ShieldCheck } from "lucide-react";

import type { TaskTile } from "../domain/types";
import { taskBoardCells } from "../domain/simulation";

interface BoardInspectorProps {
  selectedCell: number;
  tasks: TaskTile[];
}

const stateLabels = {
  idle: "Idle",
  working: "Working",
  completed: "Completed",
  needsInput: "Needs input",
  error: "Error",
  stale: "Stale",
} as const;

export function BoardInspector({ selectedCell, tasks }: BoardInspectorProps) {
  const task = tasks.find((candidate) => candidate.cellId === selectedCell);
  const slotIndex = taskBoardCells.indexOf(selectedCell);

  return (
    <aside className="inspector" aria-label="Codex task board inspector">
      <div className="panel-heading">
        <span>Codex task board</span>
        <span className="tag">Automatic</span>
      </div>
      <div className="inspector-summary">
        <span className="inspector-summary__icon"><Layers3 size={18} /></span>
        <div>
          <strong>12 sample keys</strong>
          <p>This preview illustrates how changing tasks can keep stable slots.</p>
        </div>
      </div>
      <section className="inspector-section">
        <p className="eyebrow">Selected key</p>
        <div className="selected-key-row">
          <kbd>{selectedCell < 40 ? `L${selectedCell + 1}` : `R${selectedCell - 39}`}</kbd>
          <span>{slotIndex >= 0 ? `Slot ${slotIndex + 1}` : "Unassigned"}</span>
        </div>
      </section>
      <section className="inspector-section">
        <p className="eyebrow">Sample task</p>
        {task ? (
          <div className="current-task">
            <div className="current-task__heading">
              <strong>{task.title}</strong>
              <span className={`status-label status-label--${task.state}`}>
                {stateLabels[task.state]}
              </span>
            </div>
            <p>{task.workspace}</p>
            <small>Updated {task.updatedLabel}</small>
            {task.protected && (
              <div className="retention-note">
                <ShieldCheck size={15} />
                This task keeps its key while it needs attention.
              </div>
            )}
            <button
              className="button button--primary"
              type="button"
              title="Live task opening arrives with the Codex adapter"
              disabled
            >
              Open in Codex <ArrowUpRight size={16} />
            </button>
          </div>
        ) : (
          <div className="empty-task">
            <strong>Empty slot</strong>
            <p>The next eligible task will use this key automatically.</p>
          </div>
        )}
      </section>
      <section className="inspector-section board-health">
        <div><span>Observation</span><strong>Static sample</strong></div>
        <div><span>Protected</span><strong>4 samples</strong></div>
        <div><span>Overflow example</span><strong>+2</strong></div>
      </section>
      <button
        className="button button--secondary button--full"
        type="button"
        title="Region editing arrives with the stateful simulator"
        disabled
      >
        Edit physical keys
      </button>
      <p className="inspector-footnote">
        Sample task identities are illustrative, never saved configuration.
      </p>
    </aside>
  );
}
