import { Maximize2, Minus, Plus } from "lucide-react";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  allKeys,
  keyboardGeometry,
  layoutName,
  type KeyGeometry,
} from "../domain/keyboardGeometry";
import type { BoardView } from "../domain/types";
import { KeyCell } from "./KeyCell";

interface KeyboardCanvasProps {
  board?: BoardView;
  draftCells: number[];
  editing: boolean;
  paused: boolean;
  selectedCell: number;
  onSelectCell: (cellId: number, addToRegion: boolean) => void;
  onMoveSelection: (cellId: number) => void;
}

const canvasWidth = 624;
const canvasHeight = 400;
const maximumZoom = 1.25;

export function KeyboardCanvas({
  board,
  draftCells,
  editing,
  paused,
  selectedCell,
  onSelectCell,
  onMoveSelection,
}: KeyboardCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const [fitEnabled, setFitEnabled] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const slotsByCell = useMemo(
    () => new Map(board?.slots.map((slot) => [slot.cellId, slot]) ?? []),
    [board],
  );
  const boundOrder = useMemo(
    () => new Map(board?.cells.map((cell, index) => [cell, index]) ?? []),
    [board],
  );
  const draftOrder = useMemo(
    () => new Map(draftCells.map((cell, index) => [cell, index])),
    [draftCells],
  );
  const moveSelection = (cellId: number, key: string) => {
    const target = findDirectionalKey(cellId, key);
    onMoveSelection(target);
    document
      .querySelector<HTMLButtonElement>(`[data-cell-id="${target}"]`)
      ?.focus();
  };
  const fitToViewport = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    // clientWidth/clientHeight exclude occupied scrollbar tracks. Subtract
    // the real CSS padding rather than a duplicated constant so the stage
    // fits the content box after either scrollbar appears.
    const style = window.getComputedStyle(viewport);
    const inlinePadding =
      (Number.parseFloat(style.paddingInlineStart) || 0) +
      (Number.parseFloat(style.paddingInlineEnd) || 0);
    const blockPadding =
      (Number.parseFloat(style.paddingBlockStart) || 0) +
      (Number.parseFloat(style.paddingBlockEnd) || 0);
    const bounds = viewport.getBoundingClientRect();
    const availableWidth = Math.max(
      0,
      (viewport.clientWidth || bounds.width) - inlinePadding,
    );
    const availableHeight = Math.max(
      0,
      (viewport.clientHeight || bounds.height) - blockPadding,
    );
    const measuredZoom = Math.min(
      maximumZoom,
      Math.max(
        1,
        Math.min(
          availableWidth / canvasWidth,
          availableHeight / canvasHeight,
        ),
      ),
    );
    // Fit must never round upward into overflow.
    setZoom(Math.floor(measuredZoom * 100) / 100);
  }, []);

  useLayoutEffect(() => {
    if (!fitEnabled) {
      return;
    }
    fitToViewport();
    // The first fitted size can introduce or remove a scrollbar. Re-measure
    // after that layout has painted so "Fit" converges on the true content box.
    const settleFrame = window.requestAnimationFrame(fitToViewport);
    const viewport = viewportRef.current;
    if (!viewport) {
      window.cancelAnimationFrame(settleFrame);
      return;
    }
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", fitToViewport);
      return () => {
        window.cancelAnimationFrame(settleFrame);
        window.removeEventListener("resize", fitToViewport);
      };
    }
    const observer = new ResizeObserver(fitToViewport);
    observer.observe(viewport);
    return () => {
      window.cancelAnimationFrame(settleFrame);
      observer.disconnect();
    };
  }, [fitEnabled, fitToViewport]);

  const setManualZoom = (nextZoom: number) => {
    setFitEnabled(false);
    setZoom(nextZoom);
  };

  return (
    <section className="keyboard-workspace" aria-labelledby="surface-title">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">80-key surface</p>
          <h2 id="surface-title">Keyboard map</h2>
          <p className="workspace-heading__description">
            {layoutName} · all RGB positions across both halves.
          </p>
        </div>
        <div className="workspace-heading__meta">
          <span className="tag">
            {(editing ? draftCells : board?.cells ?? []).length}/80 assigned
          </span>
          <div className="legend" aria-label="Task state legend">
            <span><i className="state-dot state-dot--idle" />○ Idle</span>
            <span><i className="state-dot state-dot--working" />● Working</span>
            <span><i className="state-dot state-dot--needsInput" />! Input</span>
            <span><i className="state-dot state-dot--completedUnread" />✓ Done</span>
            <span><i className="state-dot state-dot--failed" />× Failed</span>
            <span><i className="state-dot state-dot--stale" />? Unknown</span>
          </div>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="keyboard-viewport"
        data-editing={editing}
        data-fit={fitEnabled}
        data-paused={paused}
      >
        <div
          className="keyboard-canvas-stage"
          style={{
            width: canvasWidth * zoom,
            height: canvasHeight * zoom,
          }}
        >
          <div
            className="keyboard-canvas"
            style={{ transform: `scale(${zoom})` }}
          >
            {(["left", "right"] as const).map((half) => (
              <div
                className={`keyboard-half keyboard-half--${half}`}
                key={half}
              >
                <span className="half-label">
                  {half === "left" ? "Left half · 40 keys" : "Right half · 40 keys"}
                </span>
                {keyboardGeometry[half].map((geometry) => {
                  const slot = slotsByCell.get(geometry.id);
                  return (
                    <KeyCell
                      key={geometry.id}
                      geometry={geometry}
                      boundOrder={boundOrder.get(geometry.id)}
                      draftOrder={draftOrder.get(geometry.id)}
                      editing={editing}
                      isSelected={selectedCell === geometry.id}
                      presentation={slot?.presentation}
                      tile={slot?.tile}
                      onSelect={(event, cellId) =>
                        onSelectCell(cellId, event.shiftKey)
                      }
                      onMove={moveSelection}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="canvas-toolbar" aria-label="Canvas zoom controls">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() =>
            setManualZoom(Math.max(1, zoom - 0.05))
          }
        >
          <Minus size={15} />
        </button>
        <output aria-live="off">{Math.round(zoom * 100)}%</output>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoom >= maximumZoom}
          onClick={() =>
            setManualZoom(Math.min(maximumZoom, zoom + 0.05))
          }
        >
          <Plus size={15} />
        </button>
        <span className="toolbar-divider" />
        <button
          type="button"
          aria-label="Fit keyboard to viewport"
          aria-pressed={fitEnabled}
          onClick={() => {
            setFitEnabled(true);
            fitToViewport();
          }}
        >
          <Maximize2 size={15} /> Fit
        </button>
      </div>
      <p className="canvas-help" id="canvas-help">
        {editing
          ? "Click keys in the order tasks should fill them. Click again to remove; Undo restores the previous region."
          : "Click a key to inspect it. Shift-click starts region editing; arrow keys move spatially across both halves."}
      </p>
    </section>
  );
}

function findDirectionalKey(cellId: number, command: string): number {
  const current = allKeys.find((key) => key.id === cellId) ?? allKeys[0];
  if (command === "Home") {
    return allKeys[0].id;
  }
  if (command === "End") {
    return allKeys.at(-1)?.id ?? current.id;
  }
  const candidates = allKeys.filter((candidate) =>
    isInDirection(current, candidate, command),
  );
  return (
    candidates
      .map((candidate) => ({
        candidate,
        score: directionalScore(current, candidate, command),
      }))
      .sort((left, right) => left.score - right.score)[0]?.candidate.id ??
    current.id
  );
}

function isInDirection(
  current: KeyGeometry,
  candidate: KeyGeometry,
  command: string,
): boolean {
  const currentX = globalX(current);
  const candidateX = globalX(candidate);
  if (command === "ArrowLeft") {
    return candidateX < currentX;
  }
  if (command === "ArrowRight") {
    return candidateX > currentX;
  }
  if (command === "ArrowUp") {
    return candidate.y < current.y;
  }
  return candidate.y > current.y;
}

function directionalScore(
  current: KeyGeometry,
  candidate: KeyGeometry,
  command: string,
): number {
  const horizontal = Math.abs(globalX(candidate) - globalX(current));
  const vertical = Math.abs(candidate.y - current.y);
  return command === "ArrowLeft" || command === "ArrowRight"
    ? horizontal + vertical * 2
    : vertical + horizontal * 2;
}

function globalX(key: KeyGeometry): number {
  return key.x + (key.half === "right" ? 328 : 0);
}
