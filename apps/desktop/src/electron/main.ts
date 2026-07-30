import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";

import { SimulationRuntime } from "../runtime/simulationRuntime";
import {
  bootstrapChannel,
  dispatchChannel,
  draftDirtyChannel,
  saveDraftChannel,
  stateChangedChannel,
} from "./channels";
import {
  CloseLifecycle,
  type CloseChoice,
  type CloseIntent,
} from "./closeLifecycle";
import { parseRuntimeCommand } from "./commandValidation";
import { isCodexThreadId } from "./codexProtocol";
import { CodexTaskSource } from "./codexTaskSource";
import { FileConfigurationStore } from "./fileConfigurationStore";
import { GenericSurfaceDevice } from "./genericSurfaceDevice";
import { discoverGlove80ReadOnly } from "./glove80Discovery";
import { HardwareRuntime } from "./hardwareRuntime";
import { NodeHidTransport } from "./nodeHidTransport";
import { cellId } from "@glove80-control-surface/surface-protocol";

let mainWindow: BrowserWindow | undefined;
let runtime: HardwareRuntime | undefined;
let codexTaskSource: CodexTaskSource | undefined;
let shutdownComplete = false;
let shutdownPromise: Promise<void> | undefined;
const closeLifecycle = new CloseLifecycle();

app.setName("Glove80 Control Surface");

if (process.argv.includes("--smoke-test")) {
  void runNativeModuleSmokeTest();
} else if (process.argv.includes("--probe-device-read-only")) {
  void runReadOnlyDeviceProbe();
} else if (process.argv.includes("--hardware-live-smoke")) {
  void runLiveDeviceSmokeTest();
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  void app.whenReady().then(initializeApplication).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox(
      "Glove80 Control Surface could not start",
      `The saved configuration could not be read safely.\n\n${detail}`,
    );
    app.exit(1);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    if (closeLifecycle.shouldPrompt("quit")) {
      void confirmClose("quit");
      return;
    }
    void beginShutdown();
  });

  app.on("will-quit", () => {
    ipcMain.removeHandler(bootstrapChannel);
    ipcMain.removeHandler(dispatchChannel);
    ipcMain.removeAllListeners(draftDirtyChannel);
  });
}

function beginShutdown(): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    codexTaskSource?.stop();
    await runtime?.stop();
  })()
    .catch((error: unknown) => {
      console.error("Failed to close the keyboard session cleanly.", error);
    })
    .then(() => {
      shutdownComplete = true;
      app.quit();
    });
  return shutdownPromise;
}

function initializeApplication(): void {
  app.setAppUserModelId("com.ralfboltshauser.glove80-control-surface");
  const configurationPath = path.join(
    app.getPath("userData"),
    "configuration.json",
  );
  const taskBoard = new SimulationRuntime(
    new FileConfigurationStore(configurationPath),
    {
      initialTasks: [],
      sourceAvailability: "unavailable",
      taskSource: {
        kind: "codex",
        connection: "connecting",
        observation: "externalDiscovery",
        label: "Codex app-server",
        detail: "Discovering a user-installed Codex CLI…",
      },
      invokeTask: openCodexTask,
    },
  );
  runtime = new HardwareRuntime(
    taskBoard,
    new GenericSurfaceDevice(new NodeHidTransport()),
    publishState,
  );

  ipcMain.handle(bootstrapChannel, (event) => {
    requireTrustedRenderer(event);
    return requireRuntime().bootstrap();
  });
  ipcMain.handle(dispatchChannel, (event, input: unknown) => {
    requireTrustedRenderer(event);
    return requireRuntime().dispatch(parseRuntimeCommand(input));
  });
  ipcMain.on(draftDirtyChannel, (event, input: unknown) => {
    if (!isTrustedRenderer(event) || typeof input !== "boolean") return;
    const pendingIntent = closeLifecycle.setDraftDirty(input);
    if (pendingIntent) completeClose(pendingIntent);
  });

  createMainWindow();
  codexTaskSource = new CodexTaskSource(requireRuntime(), publishState);
  void codexTaskSource.start();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}

function publishState(state: Awaited<ReturnType<HardwareRuntime["bootstrap"]>>): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(stateChangedChannel, state);
}

function createMainWindow(): void {
  closeLifecycle.resetWindow();
  const developmentUrl = allowedDevelopmentUrl();
  const packagedRendererUrl = pathToFileURL(
    path.join(__dirname, "../dist/index.html"),
  );

  mainWindow = new BrowserWindow({
    title: "Glove80 Control Surface",
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#111318",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", (event) => {
    if (!closeLifecycle.shouldPrompt("window")) return;
    event.preventDefault();
    void confirmClose("window");
  });
  mainWindow.on("closed", () => {
    closeLifecycle.resetWindow();
    mainWindow = undefined;
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedRendererNavigation(url, developmentUrl, packagedRendererUrl)) {
      event.preventDefault();
    }
  });

  if (developmentUrl) {
    void mainWindow.loadURL(developmentUrl);
  } else {
    void mainWindow.loadURL(packagedRendererUrl.toString());
  }
}

function requireRuntime(): HardwareRuntime {
  if (!runtime) throw new Error("Application runtime is not ready.");
  return runtime;
}

function requireTrustedRenderer(
  event: IpcMainEvent | IpcMainInvokeEvent,
): void {
  if (!isTrustedRenderer(event)) {
    throw new Error("Rejected IPC from an untrusted frame.");
  }
}

function isTrustedRenderer(
  event: IpcMainEvent | IpcMainInvokeEvent,
): boolean {
  return Boolean(
    mainWindow &&
      (event.sender === mainWindow.webContents &&
        event.senderFrame === mainWindow.webContents.mainFrame),
  );
}

function allowedDevelopmentUrl(): string | undefined {
  if (app.isPackaged) return undefined;
  const candidate = process.env.GLOVE80_DEV_SERVER_URL;
  if (!candidate) return undefined;
  const parsed = new URL(candidate);
  if (parsed.origin !== "http://127.0.0.1:1420") {
    throw new Error("Development renderer must use http://127.0.0.1:1420.");
  }
  return parsed.toString();
}

function isAllowedRendererNavigation(
  candidate: string,
  developmentUrl: string | undefined,
  packagedRendererUrl: URL,
): boolean {
  const parsed = new URL(candidate);
  if (developmentUrl) {
    return parsed.origin === new URL(developmentUrl).origin;
  }
  return (
    parsed.protocol === "file:" &&
    parsed.pathname === packagedRendererUrl.pathname
  );
}

async function confirmClose(intent: CloseIntent): Promise<void> {
  if (!mainWindow || !closeLifecycle.beginPrompt()) return;
  try {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["Save", "Discard", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      title: "Unsaved task-board keys",
      message: "Save the task-board region before closing?",
      detail:
        "Save keeps the selected physical keys. Discard closes without changing the saved board.",
      noLink: true,
    });
    const choice: CloseChoice =
      response === 0 ? "save" : response === 1 ? "discard" : "cancel";
    const closeIntent = closeLifecycle.resolvePrompt(intent, choice);
    if (choice === "save") {
      mainWindow.webContents.send(saveDraftChannel);
    } else if (closeIntent) {
      completeClose(closeIntent);
    }
  } catch (error) {
    closeLifecycle.cancelPrompt();
    console.error("Close confirmation failed.", error);
  }
}

function completeClose(intent: CloseIntent): void {
  closeLifecycle.authorize(intent);
  if (intent === "quit") {
    app.quit();
  } else {
    mainWindow?.close();
  }
}

async function runNativeModuleSmokeTest(): Promise<void> {
  try {
    await app.whenReady();
    const nodeHid = await import("node-hid");
    const getHidapiVersion =
      nodeHid.getHidapiVersion ?? nodeHid.default?.getHidapiVersion;
    if (typeof getHidapiVersion !== "function") {
      throw new Error("node-hid loaded without its native version API.");
    }
    const hidapiVersion = getHidapiVersion();
    console.log(
      `Packaged native-module smoke test passed (hidapi ${hidapiVersion}).`,
    );
    app.exit(0);
  } catch (error) {
    console.error("Packaged native-module smoke test failed.", error);
    app.exit(1);
  }
}

async function runReadOnlyDeviceProbe(): Promise<void> {
  try {
    await app.whenReady();
    const observations = await discoverGlove80ReadOnly(
      new NodeHidTransport(),
    );
    console.log(JSON.stringify(observations, null, 2));
    app.exit(0);
  } catch (error) {
    console.error("Read-only Glove80 probe failed.", error);
    app.exit(1);
  }
}

async function runLiveDeviceSmokeTest(): Promise<void> {
  const surface = new GenericSurfaceDevice(
    new NodeHidTransport(),
  );
  try {
    await app.whenReady();
    await surface.setDesired({
      generation: Math.floor(Date.now() % 0xffff_ffff) || 1,
      brightness: 48,
      primaryActionCells: Array.from({ length: 80 }, (_, index) => index),
      secondaryActionCells: [],
      cells: Array.from({ length: 80 }, (_, index) => ({
        cellId: cellId(index),
        color:
          index === 0
            ? { red: 255, green: 255, blue: 255 }
            : index === 40
              ? { red: 0, green: 255, blue: 64 }
              : { red: 0, green: 0, blue: 0 },
        effect: index === 0 ? "pulse" as const : "solid" as const,
      })),
    });
    await surface.enable();
    const initialSnapshot = surface.snapshot();
    if (!initialSnapshot.applied) {
      throw new Error(
        `The left half did not apply the scene: ${JSON.stringify(initialSnapshot)}`,
      );
    }
    console.log(JSON.stringify(initialSnapshot, null, 2));
    await new Promise((resolve) => setTimeout(resolve, 7_000));
    const finalSnapshot = surface.snapshot();
    console.log(JSON.stringify(finalSnapshot, null, 2));
    await surface.disable();
    console.log(
      "Live hardware smoke test closed: the left half acknowledged CloseSession; the right-side clear remains lease-backed.",
    );
    app.exit(
      finalSnapshot.connection === "connected" &&
        finalSnapshot.applied?.disposition === "applied"
        ? 0
        : 2,
    );
  } catch (error) {
    await surface.disable().catch(() => undefined);
    console.error("Live hardware smoke test failed.", error);
    app.exit(1);
  }
}

async function openCodexTask(task: { resourceId: string }): Promise<void> {
  if (!isCodexThreadId(task.resourceId)) {
    throw new Error("Codex refused an invalid local task identity.");
  }
  if (process.platform !== "darwin" && process.platform !== "win32") {
    throw new Error(
      "Opening Codex Desktop tasks is unavailable on this platform.",
    );
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Opening Codex timed out.")),
      2_000,
    );
    void shell.openExternal(
      `codex://threads/${encodeURIComponent(task.resourceId)}`,
      { activate: true },
    ).then(
      () => {
        clearTimeout(timeout);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
