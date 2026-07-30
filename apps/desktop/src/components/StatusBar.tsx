import {
  Cable,
  CirclePause,
  CloudOff,
  Layers3,
} from "lucide-react";

import type { AppViewState } from "../domain/types";

interface StatusBarProps {
  state: AppViewState;
}

const simulationStatusCopy = {
  idle: "Simulation · no scene configured",
  applied: "Simulation · complete scene applied",
  partial: "Simulation · desired and applied differ",
  paused: "Simulation · surface output paused",
  disconnected: "Simulation · keyboard unavailable",
} as const;

const hardwareStatusCopy = {
  idle: "Keyboard connected · no scene configured",
  applied: "Keyboard · both halves synchronized",
  partial: "Keyboard · waiting for complete synchronization",
  paused: "Keyboard · surface output paused",
  disconnected: "Keyboard · USB control unavailable",
} as const;

export function StatusBar({ state }: StatusBarProps) {
  const { device, board } = state;
  const statusCopy =
    state.mode === "hardware"
      ? hardwareStatusCopy
      : simulationStatusCopy;
  const StatusIcon =
    device.syncStatus === "paused"
      ? CirclePause
      : device.syncStatus === "disconnected"
        ? CloudOff
        : device.syncStatus === "idle"
          ? Layers3
          : Cable;

  return (
    <footer className="status-bar">
      <span data-status={device.syncStatus}>
        <StatusIcon size={15} />
        {statusCopy[device.syncStatus]}
      </span>
      <span className="generation-readout">
        Desired <strong>{formatGeneration(device.desiredGeneration)}</strong>
        <i aria-hidden="true">·</i>
        Left{" "}
        <strong>
          {formatGeneration(device.snapshot.leftGeneration)}
        </strong>
        <i aria-hidden="true">·</i>
        Right{" "}
        <strong>
          {formatGeneration(device.snapshot.rightGeneration)}
        </strong>
      </span>
      <span>
        {state.taskSource.kind === "codex" ? "Codex" : "Generated source"}{" "}
        <strong>
          {state.taskSource.connection}
          {board &&
          board.collectionAvailability !== state.taskSource.connection
            ? ` · board ${board.collectionAvailability}`
            : ""}
        </strong>
      </span>
    </footer>
  );
}

function formatGeneration(generation?: number): string {
  return generation === undefined ? "—" : String(generation);
}
