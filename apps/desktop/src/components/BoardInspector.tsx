import {
  ArrowDown,
  ArrowUp,
  Check,
  Layers3,
  Play,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { keyName } from "../domain/keyboardGeometry";
import type {
  BoardView,
  SemanticState,
  TaskSourceView,
} from "../domain/types";

interface BoardInspectorProps {
  board?: BoardView;
  taskSource: TaskSourceView;
  selectedCell: number;
  editing: boolean;
  draftCells: number[];
  canUndo: boolean;
  pending: boolean;
  onAcknowledge: (cellId: number) => void;
  onCancelEditing: () => void;
  onEdit: () => void;
  onMoveDraft: (direction: -1 | 1) => void;
  onPreviewAction: (cellId: number) => void;
  onRemoveBoard: () => void;
  onRemoveTask: (cellId: number) => void;
  onSave: () => void;
  onSelectDraftCell: (cellId: number) => void;
  onSetTaskState: (cellId: number, state: SemanticState) => void;
  onUndo: () => void;
}

const stateLabels: Record<SemanticState, string> = {
  idle: "Idle",
  working: "Working",
  completedUnread: "Completed · unread",
  needsInput: "Needs input",
  failed: "Failed",
  stale: "Stale",
};

export function BoardInspector(props: BoardInspectorProps) {
  if (props.editing || !props.board) {
    return <RegionEditor {...props} />;
  }

  const {
    board,
    selectedCell,
    pending,
    onAcknowledge,
    onEdit,
    onRemoveBoard,
    onRemoveTask,
    onPreviewAction,
    onSetTaskState,
    taskSource,
  } = props;
  const slot = board.slots.find(
    (candidate) => candidate.cellId === selectedCell,
  );
  const tile = slot?.tile;
  const occupied = board.slots.filter((candidate) => candidate.tile).length;

  return (
    <aside className="inspector" aria-label="Codex task board inspector">
      <div className="panel-heading">
        <span>Codex task board</span>
        <span className="tag">Automatic</span>
      </div>
      <div className="inspector-summary">
        <span className="inspector-summary__icon">
          <Layers3 size={18} />
        </span>
        <div>
          <strong>{board.cells.length} physical keys</strong>
          <p>{`${occupied} occupied · ${board.overflow.length} more tasks`}</p>
        </div>
      </div>
      <section className="inspector-section">
        <p className="eyebrow">Selected key</p>
        <div className="selected-key-row">
          <kbd>{keyName(selectedCell)}</kbd>
          <span>
            {slot ? `Slot ${slot.slot + 1}` : "Outside task board"}
          </span>
        </div>
      </section>
      <section className="inspector-section">
        <p className="eyebrow">Current task</p>
        {tile ? (
          <div className="current-task">
            <div className="current-task__heading">
              <strong title={tile.label}>{tile.label}</strong>
              <span className={`status-label status-label--${tile.state}`}>
                {stateLabels[tile.state]}
              </span>
            </div>
            <p title={tile.context}>{tile.context}</p>
            <small>Observed revision {tile.revision}</small>
            {tile.retention === "protected" && (
              <div className="retention-note">
                <ShieldCheck size={15} />
                Keeps this key while it needs attention.
              </div>
            )}
            {taskSource.kind === "simulated" && (
              <>
                <label className="field-label" htmlFor="simulated-task-state">
                  Simulated task state
                </label>
                <select
                  id="simulated-task-state"
                  value={tile.state}
                  disabled={pending || tile.state === "stale"}
                  onChange={(event) =>
                    onSetTaskState(
                      selectedCell,
                      event.target.value as SemanticState,
                    )
                  }
                >
                  <option value="idle">Idle</option>
                  <option value="working">Working</option>
                  <option value="completedUnread">Completed · unread</option>
                  <option value="needsInput">Needs input</option>
                  <option value="failed">Failed</option>
                </select>
              </>
            )}
            <button
              className="button button--secondary button--full"
              type="button"
              disabled={pending || !tile.action.enabled}
              aria-describedby="task-open-explanation"
              onClick={() => onPreviewAction(selectedCell)}
            >
              <Play size={16} />{" "}
              {taskSource.kind === "codex"
                ? "Open task in Codex"
                : "Simulate open action"}
            </button>
            <p
              className="action-explanation"
              id="task-open-explanation"
            >
              {taskSource.kind === "codex"
                ? tile.action.enabled
                  ? "Uses the admitted local codex:// thread link. No command is executed."
                  : tile.action.explanation
                : "Checks this key’s action in the local preview. Codex will not open."}
            </p>
            {(tile.state === "completedUnread" ||
              tile.state === "failed") && (
              <button
                className="button button--secondary button--full"
                type="button"
                disabled={pending}
                onClick={() => onAcknowledge(selectedCell)}
              >
                <Check size={16} /> Acknowledge result
              </button>
            )}
            {taskSource.kind === "simulated" && (
              <button
                className="button button--text button--full"
                type="button"
                disabled={pending}
                onClick={() => onRemoveTask(selectedCell)}
              >
                Remove simulated task
              </button>
            )}
          </div>
        ) : (
          <div className="empty-task">
            <strong>{slot ? "Empty slot" : "Unassigned key"}</strong>
            <p>
              {slot
                ? "The next eligible task will use this key automatically."
                : "Edit physical keys to include this position."}
            </p>
          </div>
        )}
      </section>
      <section className="inspector-section board-health">
        <div>
          <span>{taskSource.kind === "codex" ? "Codex" : "Source"}</span>
          <strong>{taskSource.connection}</strong>
        </div>
        <div>
          <span>Protected</span>
          <strong>
            {
              board.slots.filter(
                (candidate) =>
                  candidate.tile?.retention === "protected",
              ).length
            }
          </strong>
        </div>
        <div>
          <span>Overflow</span>
          <strong>{board.overflow.length}</strong>
        </div>
      </section>
      {taskSource.kind === "codex" && (
        <>
          <p className="inspector-footnote">
            External discovery follows changing tasks, but another Codex
            process’s exact live state is unavailable. “Stale” means unknown,
            not idle.
          </p>
          <details className="source-diagnostics">
            <summary>Codex connection details</summary>
            <dl>
              <div>
                <dt>Observation</dt>
                <dd>External discovery</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{taskSource.version ?? "Detecting…"}</dd>
              </div>
              <div>
                <dt>Executable</dt>
                <dd title={taskSource.executable}>
                  {taskSource.executable ?? "Not found"}
                </dd>
              </div>
            </dl>
          </details>
        </>
      )}
      <button
        className="button button--secondary button--full"
        type="button"
        onClick={onEdit}
      >
        Edit physical keys
      </button>
      <div className="inspector-danger">
        <button
          className="button button--destructive-text button--full"
          type="button"
          onClick={onRemoveBoard}
        >
          <Trash2 size={15} /> Remove task board
        </button>
      </div>
      <p className="inspector-footnote">
        Runtime task identities are never saved in configuration.
      </p>
    </aside>
  );
}

function RegionEditor({
  board,
  selectedCell,
  draftCells,
  canUndo,
  pending,
  onCancelEditing,
  onMoveDraft,
  onSave,
  onSelectDraftCell,
  onUndo,
}: BoardInspectorProps) {
  const order = draftCells.indexOf(selectedCell);
  return (
    <aside className="inspector" aria-label="Task board region editor">
      <div className="panel-heading">
        <span>{board ? "Edit task board" : "Create task board"}</span>
        <span className="tag">{draftCells.length}/80</span>
      </div>
      <div className="inspector-summary inspector-summary--accent">
        <span className="inspector-summary__icon">
          <Layers3 size={18} />
        </span>
        <div>
          <strong>Choose keys in fill order</strong>
          <p>
            The first eligible task uses slot 1, then slot 2, and so on.
          </p>
        </div>
      </div>
      <section className="inspector-section">
        <p className="eyebrow">Selected position</p>
        <div className="selected-key-row">
          <kbd>{keyName(selectedCell)}</kbd>
          <span>{order >= 0 ? `Slot ${order + 1}` : "Not selected"}</span>
        </div>
        <div className="reorder-controls">
          <button
            type="button"
            disabled={order <= 0}
            onClick={() => onMoveDraft(-1)}
          >
            <ArrowUp size={15} /> Earlier
          </button>
          <button
            type="button"
            disabled={order < 0 || order === draftCells.length - 1}
            onClick={() => onMoveDraft(1)}
          >
            <ArrowDown size={15} /> Later
          </button>
          <button type="button" disabled={!canUndo} onClick={onUndo}>
            <RotateCcw size={15} /> Undo
          </button>
        </div>
      </section>
      <section className="inspector-section region-order">
        <p className="eyebrow">Fill order</p>
        {draftCells.length > 0 ? (
          <ol>
            {draftCells.map((cellId, index) => (
              <li key={cellId}>
                <button
                  type="button"
                  data-current={cellId === selectedCell}
                  onClick={() => onSelectDraftCell(cellId)}
                >
                  <span>{index + 1}</span>
                  <strong>{keyName(cellId)}</strong>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-task">
            <strong>No keys selected yet</strong>
            <p>Start by clicking any key on either half.</p>
          </div>
        )}
      </section>
      <div className="inspector-actions">
        <button
          className="button button--primary button--full"
          type="button"
          disabled={draftCells.length === 0 || pending}
          onClick={onSave}
        >
          {pending ? "Saving…" : board ? "Save task board" : "Create task board"}
        </button>
        {board && (
          <button
            className="button button--text button--full"
            type="button"
            disabled={pending}
            onClick={onCancelEditing}
          >
            Cancel changes
          </button>
        )}
      </div>
      <p className="inspector-footnote">
        This saves only stable cell IDs and preferences—never chat IDs.
      </p>
    </aside>
  );
}
