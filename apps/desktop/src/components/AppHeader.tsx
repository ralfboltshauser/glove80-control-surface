import { Eye, EyeOff, Settings2 } from "lucide-react";

interface AppHeaderProps {
  paused: boolean;
  onPause: () => void;
}

export function AppHeader({ paused, onPause }: AppHeaderProps) {
  return (
    <header className="app-header">
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
        <div className="connection-summary">
          <span className="connection-summary__dot" aria-hidden="true" />
          Preview only
        </div>
        <button className="button button--quiet" type="button" onClick={onPause}>
          {paused ? <Eye size={17} /> : <EyeOff size={17} />}
          {paused ? "Show lights" : "Dim lights"}
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Settings unavailable in static preview"
          title="Settings arrive with the stateful simulator"
          disabled
        >
          <Settings2 size={18} />
        </button>
      </div>
    </header>
  );
}
