import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppViewState } from "../domain/types";
import { useRuntime } from "./useRuntime";

describe("useRuntime", () => {
  afterEach(() => {
    delete window.glove80ControlSurface;
  });

  it("never replaces a pushed revision with an older IPC response", async () => {
    const bootstrap = deferred<AppViewState>();
    const dispatch = deferred<AppViewState>();
    let push: ((state: AppViewState) => void) | undefined;
    window.glove80ControlSurface = {
      bootstrap: () => bootstrap.promise,
      dispatch: () => dispatch.promise,
      onStateChanged: vi.fn((listener) => {
        push = listener;
        return () => undefined;
      }),
    };

    const { result } = renderHook(() => useRuntime());
    act(() => push?.(view(2)));
    await waitFor(() => expect(result.current.state?.revision).toBe(2));

    await act(async () => bootstrap.resolve(view(1)));
    expect(result.current.state?.revision).toBe(2);

    let dispatchResult: Promise<AppViewState> | undefined;
    act(() => {
      dispatchResult = result.current.dispatch({
        kind: "setPaused",
        paused: true,
      });
    });
    act(() => push?.(view(4)));
    await waitFor(() => expect(result.current.state?.revision).toBe(4));
    await act(async () => dispatch.resolve(view(3)));
    await dispatchResult;
    expect(result.current.state?.revision).toBe(4);
  });
});

function view(revision: number): AppViewState {
  return {
    revision,
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
      snapshot: { connected: true, paused: false },
      syncStatus: "idle",
      rightHalfConnected: true,
    },
    taskSource: {
      kind: "codex",
      connection: "online",
      observation: "externalDiscovery",
      label: "Codex app-server",
      detail: "test",
    },
    sourceTaskCount: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
