import {
  Eye,
  EyeOff,
  Grid3X3,
  Settings2,
} from "lucide-react";
import type { RefObject } from "react";

import type { DeviceView } from "../domain/types";

interface AppHeaderProps {
  boardConfigured: boolean;
  controlLayerActive: boolean;
  controlLayerButtonRef: RefObject<HTMLButtonElement | null>;
  device: DeviceView;
  editing: boolean;
  pending: boolean;
  settingsActive: boolean;
  onPause: () => void;
  onSettings: () => void;
  onToggleControlLayer: () => void;
}

const syncLabels = {
  idle: "Ready to configure",
  applied: "Both halves synchronized",
  partial: "Partially synchronized",
  paused: "Surface paused",
  disconnected: "Keyboard disconnected",
} as const;

export function AppHeader({
  boardConfigured,
  controlLayerActive,
  controlLayerButtonRef,
  device,
  editing,
  pending,
  settingsActive,
  onPause,
  onSettings,
  onToggleControlLayer,
}: AppHeaderProps) {
  return (
    <header className="app-header" aria-busy={pending}>
      <div className="brand">
        <div className="brand__mark" aria-hidden="true">
          G80
        </div>
        <div>
          <h1>Glove80 Control Surface</h1>
          <p>Dynamic controls, ordinary typing</p>
        </div>
      </div>
      <div className="header-actions">
        <div
          className="connection-summary"
          data-status={device.syncStatus}
        >
          <span className="connection-summary__dot" aria-hidden="true" />
          <span>{pending ? "Updating…" : syncLabels[device.syncStatus]}</span>
        </div>
        <button
          ref={controlLayerButtonRef}
          className="button button--primary"
          type="button"
          aria-pressed={controlLayerActive}
          disabled={!boardConfigured || !device.snapshot.connected}
          title={
            editing
              ? "Save or cancel region changes before previewing the saved board"
              : undefined
          }
          onClick={onToggleControlLayer}
        >
          <Grid3X3 size={17} />
          {controlLayerActive ? "Exit preview" : "Preview controls"}
        </button>
        <button
          className="button button--quiet"
          type="button"
          aria-pressed={device.snapshot.paused}
          disabled={!device.snapshot.connected}
          onClick={onPause}
        >
          {device.snapshot.paused ? (
            <Eye size={17} />
          ) : (
            <EyeOff size={17} />
          )}
          {device.snapshot.paused ? "Resume" : "Pause"}
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Appearance settings"
          aria-pressed={settingsActive}
          title="Appearance settings"
          onClick={onSettings}
        >
          <Settings2 size={18} />
        </button>
      </div>
    </header>
  );
}
