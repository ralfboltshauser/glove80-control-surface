import { describe, expect, it } from "vitest";

import { parseRuntimeCommand } from "./commandValidation";

describe("runtime IPC command validation", () => {
  it("accepts the complete renderer command surface", () => {
    const commands = [
      { kind: "assignTaskBoard", cells: [0, 40] },
      { kind: "removeTaskBoard" },
      { kind: "setPaused", paused: true },
      { kind: "setRightHalfConnected", connected: false },
      { kind: "setDeviceConnected", connected: true },
      { kind: "setPreferences", brightness: 48, reduceMotion: true },
      { kind: "setTaskState", cellId: 0, state: "working" },
      { kind: "addTask" },
      { kind: "removeTask", cellId: 0 },
      { kind: "burst" },
      { kind: "setSourceAvailability", availability: "stale" },
      { kind: "expireSource" },
      { kind: "expireScene" },
      { kind: "resetSimulation" },
      { kind: "acknowledge", cellId: 40 },
      { kind: "beginInteraction", epoch: 1, bank: "primary" },
      { kind: "endInteraction", epoch: 1 },
      { kind: "invokeCell", epoch: 1, cellId: 40, bank: "secondary" },
    ];

    for (const command of commands) {
      expect(parseRuntimeCommand(command)).toEqual(command);
    }
  });

  it.each([
    undefined,
    {},
    { kind: "unknown" },
    { kind: "assignTaskBoard", cells: [80] },
    { kind: "setPreferences", brightness: 300, reduceMotion: false },
    { kind: "beginInteraction", epoch: 0 },
    { kind: "beginInteraction", epoch: 0x1_0000_0000 },
    { kind: "beginInteraction", epoch: Number.MAX_SAFE_INTEGER + 1 },
    { kind: "invokeCell", epoch: 1, cellId: -1 },
  ])("rejects malformed or out-of-range input %#", (command) => {
    expect(() => parseRuntimeCommand(command)).toThrow(/Invalid/);
  });
});
