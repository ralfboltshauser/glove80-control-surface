import { useEffect, useRef, useState } from "react";

import { useRuntime } from "./api/useRuntime";
import { AppHeader } from "./components/AppHeader";
import { AppearanceInspector } from "./components/AppearanceInspector";
import { AssignmentSidebar } from "./components/AssignmentSidebar";
import { BoardInspector } from "./components/BoardInspector";
import { InteractionHud } from "./components/InteractionHud";
import { KeyboardCanvas } from "./components/KeyboardCanvas";
import { ReadinessBar } from "./components/ReadinessBar";
import { SimulationPanel } from "./components/SimulationPanel";
import { StatusBar } from "./components/StatusBar";
import type { AppPreferences, SemanticState } from "./domain/types";

export function App() {
  const { state, error, pending, dispatch, clearError } = useRuntime();
  const initialized = useRef(false);
  const [selectedCell, setSelectedCell] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftCells, setDraftCells] = useState<number[]>([]);
  const [draftHistory, setDraftHistory] = useState<number[][]>([]);
  const [inspectorMode, setInspectorMode] = useState<
    "board" | "appearance"
  >("board");
  const controlLayerButtonRef = useRef<HTMLButtonElement>(null);
  const hudReturnFocusRef = useRef<HTMLElement | null>(null);
  const interactionEpoch = state?.board?.interactionEpoch ?? undefined;
  const configuredCells = state?.board?.cells ?? [];
  const draftIsDirty =
    editing &&
    (draftCells.length !== configuredCells.length ||
      draftCells.some((cell, index) => cell !== configuredCells[index]));

  useEffect(() => {
    if (interactionEpoch === undefined || state?.mode === "hardware") {
      return;
    }
    const exitPreview = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      void dispatch({ kind: "endInteraction", epoch: interactionEpoch });
    };
    window.addEventListener("keydown", exitPreview);
    return () => window.removeEventListener("keydown", exitPreview);
  }, [dispatch, interactionEpoch, state?.mode]);

  useEffect(() => {
    if (!state || initialized.current) {
      return;
    }
    initialized.current = true;
    const configuredCells = state.board?.cells ?? [];
    setDraftCells(configuredCells);
    setEditing(!state.board);
    setSelectedCell(configuredCells[0] ?? 0);
  }, [state]);

  useEffect(() => {
    window.glove80DesktopLifecycle?.setDraftDirty(draftIsDirty);
  }, [draftIsDirty]);

  useEffect(() => {
    return window.glove80DesktopLifecycle?.onSaveDraftRequested(() => {
      if (!draftIsDirty) return;
      void dispatch({ kind: "assignTaskBoard", cells: draftCells })
        .then(() => {
          setEditing(false);
          setDraftHistory([]);
        })
        .catch(() => undefined);
    });
  }, [dispatch, draftCells, draftIsDirty]);

  if (!state) {
    return (
      <main className="app-loading" aria-busy="true">
        <div className="brand__mark" aria-hidden="true">G80</div>
        <div>
          <strong>Starting Glove80 Control Surface…</strong>
          <span>Loading local configuration and task discovery.</span>
        </div>
      </main>
    );
  }

  const isEditing = editing || !state.board;
  const beginEditing = () => {
    setInspectorMode("board");
    if (isEditing) {
      return;
    }
    setDraftCells(state.board?.cells ?? []);
    setDraftHistory([]);
    setEditing(true);
  };
  const updateDraft = (next: number[]) => {
    setDraftHistory((history) => [...history, draftCells]);
    setDraftCells(next);
  };
  const selectCell = (cellId: number, addToRegion: boolean) => {
    setSelectedCell(cellId);
    if (isEditing) {
      updateDraft(
        draftCells.includes(cellId)
          ? draftCells.filter((candidate) => candidate !== cellId)
          : [...draftCells, cellId],
      );
      return;
    }
    if (addToRegion) {
      const initial = state.board?.cells ?? [];
      setInspectorMode("board");
      setEditing(true);
      setDraftHistory([initial]);
      setDraftCells(
        initial.includes(cellId)
          ? initial.filter((candidate) => candidate !== cellId)
          : [...initial, cellId],
      );
    }
  };
  const moveDraft = (direction: -1 | 1) => {
    const currentIndex = draftCells.indexOf(selectedCell);
    const targetIndex = currentIndex + direction;
    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= draftCells.length
    ) {
      return;
    }
    const next = [...draftCells];
    [next[currentIndex], next[targetIndex]] = [
      next[targetIndex],
      next[currentIndex],
    ];
    updateDraft(next);
  };
  const undoDraft = () => {
    const previous = draftHistory.at(-1);
    if (!previous) {
      return;
    }
    setDraftCells(previous);
    setDraftHistory((history) => history.slice(0, -1));
  };
  const replaceDraft = (next: number[]) => {
    if (
      next.length === draftCells.length &&
      next.every((cell, index) => cell === draftCells[index])
    ) {
      return;
    }
    updateDraft(next);
    setSelectedCell(next[0] ?? selectedCell);
  };
  const saveBoard = () => {
    void dispatch({ kind: "assignTaskBoard", cells: draftCells }).then(() => {
      setEditing(false);
      setDraftHistory([]);
    });
  };
  const removeBoard = () => {
    if (
      !window.confirm(
        "Remove the Codex task board? This clears only the host-side assignment; it does not modify firmware or your typing layout.",
      )
    ) {
      return;
    }
    const endInteraction =
      interactionEpoch === undefined
        ? Promise.resolve(state)
        : dispatch({ kind: "endInteraction", epoch: interactionEpoch });
    void endInteraction
      .then(() => dispatch({ kind: "removeTaskBoard" }))
      .then(() => {
        setDraftCells([]);
        setDraftHistory([]);
        setEditing(true);
        setInspectorMode("board");
      });
  };
  const setTaskState = (cellId: number, taskState: SemanticState) => {
    void dispatch({ kind: "setTaskState", cellId, state: taskState });
  };
  const saveAppearance = (preferences: AppPreferences) => {
    void dispatch({
      kind: "setPreferences",
      brightness: preferences.brightness,
      reduceMotion: preferences.reduceMotion,
    });
  };
  const toggleControlLayer = () => {
    if (interactionEpoch !== undefined) {
      void dispatch({ kind: "endInteraction", epoch: interactionEpoch });
      return;
    }
    rememberHudOpener();
    const epoch = (Date.now() >>> 0) || 1;
    void dispatch({ kind: "beginInteraction", epoch, bank: "primary" });
  };
  const previewTaskAction = (cellId: number) => {
    if (interactionEpoch !== undefined) {
      void dispatch({
        kind: "invokeCell",
        epoch: interactionEpoch,
        cellId,
        bank: state.board?.interactionBank ?? "primary",
      });
      return;
    }
    rememberHudOpener();
    const epoch = (Date.now() >>> 0) || 1;
    void (async () => {
      let started = false;
      try {
        await dispatch({ kind: "beginInteraction", epoch, bank: "primary" });
        started = true;
        await dispatch({
          kind: "invokeCell",
          epoch,
          cellId,
          bank: "primary",
        });
      } finally {
        if (started && state.taskSource.kind === "codex") {
          await dispatch({ kind: "endInteraction", epoch }).catch(
            () => undefined,
          );
        }
      }
    })().catch(() => undefined);
  };
  const rememberHudOpener = () => {
    hudReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : controlLayerButtonRef.current;
  };

  return (
    <main className="app-shell">
      <div
        className="app-content"
        inert={interactionEpoch !== undefined}
      >
        <AppHeader
          boardConfigured={Boolean(state.board) && !isEditing}
          controlLayerActive={interactionEpoch !== undefined}
          controlLayerButtonRef={controlLayerButtonRef}
          device={state.device}
          editing={isEditing}
          pending={pending}
          settingsActive={inspectorMode === "appearance"}
          onPause={() =>
            void dispatch({
              kind: "setPaused",
              paused: !state.device.snapshot.paused,
            })
          }
          onSettings={() =>
            setInspectorMode((mode) =>
              mode === "appearance" ? "board" : "appearance",
            )
          }
          onToggleControlLayer={toggleControlLayer}
        />
        <ReadinessBar
          state={state}
          error={error}
          pending={pending}
          onDismissError={clearError}
        />
        <div className="workspace">
          <div className="left-rail">
            <AssignmentSidebar
              board={state.board}
              sourceTaskCount={state.sourceTaskCount}
              taskSource={state.taskSource}
              onConfigure={beginEditing}
            />
            {state.taskSource.kind === "simulated" && (
              <SimulationPanel
                state={state}
                pending={pending}
                dispatch={dispatch}
              />
            )}
          </div>
          <KeyboardCanvas
            board={state.board}
            draftCells={draftCells}
            editing={isEditing}
            paused={state.device.snapshot.paused}
            selectedCell={selectedCell}
            onSelectCell={selectCell}
            onMoveSelection={setSelectedCell}
          />
          {inspectorMode === "appearance" ? (
            <AppearanceInspector
              preferences={state.configuration.preferences}
              maximumBrightness={state.device.capabilities.maxBrightness}
              pending={pending}
              onSave={saveAppearance}
            />
          ) : (
            <BoardInspector
              board={state.board}
              taskSource={state.taskSource}
              selectedCell={selectedCell}
              editing={isEditing}
              draftCells={draftCells}
              canUndo={draftHistory.length > 0}
              pending={pending}
              onAcknowledge={(cellId) =>
                void dispatch({ kind: "acknowledge", cellId })
              }
              onCancelEditing={() => {
                setEditing(false);
                setDraftCells(state.board?.cells ?? []);
                setDraftHistory([]);
              }}
              onEdit={beginEditing}
              onMoveDraft={moveDraft}
              onRemoveBoard={removeBoard}
              onRemoveTask={(cellId) =>
                void dispatch({ kind: "removeTask", cellId })
              }
              onPreviewAction={previewTaskAction}
              onReplaceDraft={replaceDraft}
              onSave={saveBoard}
              onSelectDraftCell={setSelectedCell}
              onSetTaskState={setTaskState}
              onUndo={undoDraft}
            />
          )}
        </div>
        <StatusBar state={state} />
      </div>
      {interactionEpoch !== undefined && state.board && (
        <InteractionHud
          board={state.board}
          error={error}
          feedback={state.feedback}
          simulatedSource={state.taskSource.kind === "simulated"}
          onBurst={
            state.taskSource.kind === "simulated"
              ? () => void dispatch({ kind: "burst" })
              : undefined
          }
          onClose={state.mode === "simulation" ? toggleControlLayer : undefined}
          onInvoke={
            state.mode === "simulation"
              ? (cellId) =>
                  void dispatch({
                    kind: "invokeCell",
                    epoch: interactionEpoch,
                    cellId,
                    bank: state.board?.interactionBank ?? "primary",
                  })
              : undefined
          }
          returnFocusRef={hudReturnFocusRef}
        />
      )}
    </main>
  );
}
