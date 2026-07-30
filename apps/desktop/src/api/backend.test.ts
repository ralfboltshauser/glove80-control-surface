import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppViewState } from "../domain/types";
import { createBackend } from "./backend";

describe("Electron backend selection", () => {
  afterEach(() => {
    delete window.glove80ControlSurface;
  });

  it("uses only the narrow preload bridge when Electron provides it", async () => {
    const view = {
      revision: 1,
      mode: "simulation",
      configuration: {
        schemaVersion: 1,
        preferences: { brightness: 48, reduceMotion: false },
      },
      device: {
        capabilities: {
          protocolVersion: 2,
          topologyId: "glove80-rgb-80-v1",
          availableCells: [],
          supportsInputEvents: true,
          supportsRightHalfAcknowledgement: true,
          supportedEffects: ["solid"],
          maxSceneCells: 80,
          maxLeaseMillis: 60_000,
          maxBrightness: 96,
        },
        snapshot: {
          connected: true,
          paused: false,
        },
        syncStatus: "idle",
        rightHalfConnected: true,
      },
      sourceTaskCount: 0,
    } satisfies AppViewState;
    const bootstrap = vi.fn().mockResolvedValue(view);
    const dispatch = vi.fn().mockResolvedValue(view);
    window.glove80ControlSurface = { bootstrap, dispatch };

    const backend = createBackend();
    await expect(backend.bootstrap()).resolves.toBe(view);
    await expect(
      backend.dispatch({ kind: "setPaused", paused: true }),
    ).resolves.toBe(view);

    expect(bootstrap).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      kind: "setPaused",
      paused: true,
    });
  });
});
