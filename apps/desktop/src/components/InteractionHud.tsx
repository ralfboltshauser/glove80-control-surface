import { Play, X } from "lucide-react";
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
} from "react";

import { keyName } from "../domain/keyboardGeometry";
import type { BoardView, FeedbackView } from "../domain/types";

interface InteractionHudProps {
  board: BoardView;
  error?: string;
  feedback?: FeedbackView;
  simulatedSource: boolean;
  onBurst?: () => void;
  onClose?: () => void;
  onInvoke?: (cellId: number) => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

export function InteractionHud({
  board,
  error,
  feedback,
  simulatedSource,
  onBurst,
  onClose,
  onInvoke,
  returnFocusRef,
}: InteractionHudProps) {
  const controlLabel = simulatedSource
    ? "Control layer preview"
    : `${board.interactionBank === "secondary" ? "Secondary" : "Primary"} actions held`;
  const adaptive = board.slots.length > 12;
  const occupied = board.slots.filter((slot) => slot.tile).length;
  const visibleSlots = adaptive
    ? board.slots.filter((slot) => slot.tile)
    : board.slots;
  const waitingSlots = adaptive
    ? board.slots.filter((slot) => !slot.tile)
    : [];
  const capacitySummary = `${occupied}/${board.slots.length} occupied${
    board.overflow.length > 0
      ? ` · ${board.overflow.length} more tasks`
      : ""
  } · allocation frozen`;
  const dialogRef = useRef<HTMLElement>(null);
  const exitButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const firstAction = dialogRef.current?.querySelector<HTMLButtonElement>(
      ".interaction-hud__slots button:not(:disabled)",
    );
    (firstAction ?? exitButtonRef.current)?.focus();
    return () => {
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, [returnFocusRef]);

  const containFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") {
      return;
    }
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), summary, [tabindex]:not([tabindex='-1'])",
      ) ?? []),
    ];
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1) ?? first;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <section
      ref={dialogRef}
      className="interaction-hud"
      data-density={adaptive ? "adaptive" : "comfortable"}
      role="dialog"
      aria-modal="true"
      aria-label={controlLabel}
      aria-describedby="hud-action-copy"
      onKeyDown={containFocus}
    >
      <div className="interaction-hud__header">
        <div>
          <span className="hud-live-dot" aria-hidden="true" />
          <strong>{controlLabel}</strong>
          <small>{capacitySummary}</small>
        </div>
        <div>
          {onBurst && (
            <button
              className="button button--quiet"
              type="button"
              onClick={onBurst}
            >
              Inject task burst
            </button>
          )}
          {onClose && (
            <button
              ref={exitButtonRef}
              className="icon-button"
              type="button"
              aria-label={`Exit ${controlLabel.toLowerCase()}`}
              onClick={onClose}
            >
              <X size={17} />
            </button>
          )}
        </div>
      </div>
      <p className="interaction-hud__action-copy" id="hud-action-copy">
        {simulatedSource
          ? "Select an occupied slot to simulate its open command. This preview does not launch Codex or write to a keyboard."
          : board.interactionBank === "secondary"
            ? "Keep ↓ held and press a lit task key to acknowledge its completed or failed result. Release ↓ to resume normal typing."
            : "Keep ↑ held and press a lit task key to open that task in Codex. Release ↑ to resume normal typing."}
      </p>
      <div
        className="interaction-hud__feedback"
        data-tone={error ? "error" : feedback?.tone ?? "info"}
        role={error || feedback?.tone === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {error ??
          feedback?.message ??
          "No preview action selected yet."}
      </div>
      <div
        className="interaction-hud__slots"
      >
        {visibleSlots.map((slot) => (
          <button
            key={slot.cellId}
            type="button"
            disabled={!slot.tile?.action.enabled || !onInvoke}
            aria-label={slotActionLabel(slot, simulatedSource)}
            title={slotActionLabel(slot, simulatedSource)}
            onClick={() => onInvoke?.(slot.cellId)}
          >
            <span>{slot.slot + 1}</span>
            <div>
              <small>{keyName(slot.cellId)}</small>
              <strong>{slot.tile?.label ?? "Empty slot"}</strong>
              <em data-state={slot.tile?.state}>
                {slot.tile
                  ? stateLabel(slot.tile.state)
                  : "No action"}
              </em>
            </div>
            {slot.tile && <Play size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
      {waitingSlots.length > 0 && (
        <details className="interaction-hud__waiting">
          <summary>
            {waitingSlots.length} waiting positions
            <small>Show every configured key</small>
          </summary>
          <div className="interaction-hud__waiting-grid">
            {waitingSlots.map((slot) => (
              <button
                key={slot.cellId}
                type="button"
                disabled
                aria-label={slotActionLabel(slot, simulatedSource)}
                title={slotActionLabel(slot, simulatedSource)}
              >
                <span>{slot.slot + 1}</span>
                <small>{keyName(slot.cellId)}</small>
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function stateLabel(state: NonNullable<BoardView["slots"][number]["tile"]>["state"]) {
  switch (state) {
    case "idle":
      return "Idle";
    case "working":
      return "Working";
    case "completedUnread":
      return "Done · unread";
    case "needsInput":
      return "Needs input";
    case "failed":
      return "Failed";
    case "stale":
      return "Activity unknown";
  }
}

function slotActionLabel(
  slot: BoardView["slots"][number],
  simulatedSource: boolean,
): string {
  const prefix = `Slot ${slot.slot + 1}, ${keyName(slot.cellId)}`;
  if (!slot.tile) {
    return `${prefix}, empty, no action`;
  }
  const availability = slot.tile.action.enabled
    ? simulatedSource
      ? "simulate open action"
      : "open task in Codex"
    : slot.tile.action.explanation ?? "action unavailable";
  return `${prefix}, ${slot.tile.label}, ${stateLabel(slot.tile.state)}, ${availability}`;
}
