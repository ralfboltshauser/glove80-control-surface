import {
  Activity,
  Cable,
  EyeOff,
  Plus,
  RefreshCcw,
  Sparkles,
  Unplug,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { AppViewState, RuntimeCommand } from "../domain/types";

interface SimulationPanelProps {
  state: AppViewState;
  pending: boolean;
  dispatch: (command: RuntimeCommand) => Promise<AppViewState>;
}

export function SimulationPanel({
  state,
  pending,
  dispatch,
}: SimulationPanelProps) {
  const compactQuery = "(max-width: 67.5rem)";
  const [compact, setCompact] = useState(
    () => window.matchMedia?.(compactQuery).matches ?? false,
  );
  const [open, setOpen] = useState(() => !compact);
  const sourceOnline =
    state.board?.collectionAvailability === "online";
  const connected = state.device.snapshot.connected;
  const rightConnected = state.device.rightHalfConnected;
  const hasBoard = Boolean(state.board);

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }
    const query = window.matchMedia(compactQuery);
    const update = (event: MediaQueryListEvent | MediaQueryList) => {
      setCompact((wasCompact) => {
        if (wasCompact !== event.matches) {
          setOpen(!event.matches);
        }
        return event.matches;
      });
    };
    update(query);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <details
      className="simulation-panel"
      data-compact={compact}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-label="Test simulator behavior">
        <span><Activity size={15} aria-hidden="true" /> Test behavior</span>
        <small>Deterministic simulator</small>
      </summary>
      <div className="simulation-panel__body">
        <p>
          Exercise churn and failure states before any keyboard write.
        </p>
        <div className="simulation-actions">
          <button
            type="button"
            disabled={!hasBoard || pending}
            onClick={() => void dispatch({ kind: "addTask" })}
          >
            <Plus size={15} /> New task
          </button>
          <button
            type="button"
            disabled={!hasBoard || pending}
            onClick={() => void dispatch({ kind: "burst" })}
          >
            <Sparkles size={15} /> Task burst
          </button>
          <button
            type="button"
            disabled={!hasBoard || pending}
            onClick={() =>
              void dispatch(
                sourceOnline
                  ? { kind: "expireSource" }
                  : {
                      kind: "setSourceAvailability",
                      availability: "online",
                    },
              )
            }
          >
            <RefreshCcw size={15} />
            {sourceOnline ? "Expire source" : "Restore source"}
          </button>
          <button
            type="button"
            disabled={!hasBoard || pending}
            onClick={() =>
              void dispatch({
                kind: "setRightHalfConnected",
                connected: !rightConnected,
              })
            }
          >
            {rightConnected ? <Unplug size={15} /> : <Cable size={15} />}
            {rightConnected ? "Lose right half" : "Reconnect right"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              void dispatch({
                kind: "setDeviceConnected",
                connected: !connected,
              })
            }
          >
            {connected ? <Unplug size={15} /> : <Cable size={15} />}
            {connected ? "Disconnect USB" : "Reconnect USB"}
          </button>
          <button
            type="button"
            disabled={!hasBoard || pending}
            onClick={() => void dispatch({ kind: "expireScene" })}
          >
            <EyeOff size={15} /> Expire scene
          </button>
        </div>
        <button
          className="button button--text button--full"
          type="button"
          disabled={!hasBoard || pending}
          onClick={() => void dispatch({ kind: "resetSimulation" })}
        >
          Reset simulated tasks
        </button>
      </div>
    </details>
  );
}
