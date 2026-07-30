import { useState } from "react";

import { AppHeader } from "./components/AppHeader";
import { AssignmentSidebar } from "./components/AssignmentSidebar";
import { BoardInspector } from "./components/BoardInspector";
import { KeyboardCanvas } from "./components/KeyboardCanvas";
import { StatusBar } from "./components/StatusBar";
import { sampleTasks } from "./domain/simulation";

export function App() {
  const [selectedCell, setSelectedCell] = useState(0);
  const [paused, setPaused] = useState(false);

  return (
    <main className="app-shell">
      <AppHeader paused={paused} onPause={() => setPaused((value) => !value)} />
      <div className="simulation-notice" role="status">
        <span className="simulation-notice__dot" aria-hidden="true" />
        Static preview — no Codex or keyboard connection
      </div>
      <div className="workspace">
        <AssignmentSidebar />
        <KeyboardCanvas
          paused={paused}
          selectedCell={selectedCell}
          tasks={sampleTasks}
          onSelectCell={setSelectedCell}
        />
        <BoardInspector
          selectedCell={selectedCell}
          tasks={sampleTasks}
        />
      </div>
      <StatusBar paused={paused} />
    </main>
  );
}
