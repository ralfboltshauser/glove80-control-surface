import {
  contextBridge,
  ipcRenderer,
  type IpcRendererEvent,
} from "electron";

import type {
  AppViewState,
  RuntimeCommand,
} from "../domain/types";
import {
  bootstrapChannel,
  dispatchChannel,
  draftDirtyChannel,
  saveDraftChannel,
  stateChangedChannel,
} from "./channels";

contextBridge.exposeInMainWorld("glove80ControlSurface", {
  bootstrap: (): Promise<AppViewState> =>
    ipcRenderer.invoke(bootstrapChannel),
  dispatch: (command: RuntimeCommand): Promise<AppViewState> =>
    ipcRenderer.invoke(dispatchChannel, command),
  onStateChanged: (
    listener: (state: AppViewState) => void,
  ): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, state: AppViewState) =>
      listener(state);
    ipcRenderer.on(stateChangedChannel, wrapped);
    return () => ipcRenderer.removeListener(stateChangedChannel, wrapped);
  },
});

contextBridge.exposeInMainWorld("glove80DesktopLifecycle", {
  setDraftDirty: (dirty: boolean): void => {
    ipcRenderer.send(draftDirtyChannel, dirty);
  },
  onSaveDraftRequested: (listener: () => void): (() => void) => {
    const wrapped = (): void => listener();
    ipcRenderer.on(saveDraftChannel, wrapped);
    return () => ipcRenderer.removeListener(saveDraftChannel, wrapped);
  },
});
