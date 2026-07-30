import { Eye } from "lucide-react";

interface StatusBarProps {
  paused: boolean;
}

export function StatusBar({ paused }: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span>
        <Eye size={15} />
        {paused ? "Preview lights dimmed — no device command sent" : "Static preview rendered — no scene sent"}
      </span>
      <button type="button" title="Diagnostics arrive with device and integration adapters" disabled>
        Diagnostics
      </button>
    </footer>
  );
}
