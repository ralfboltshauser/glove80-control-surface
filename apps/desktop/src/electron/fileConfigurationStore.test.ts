import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ConfigurationDocument } from "../domain/types";
import { SimulationRuntime } from "../runtime/simulationRuntime";
import { FileConfigurationStore } from "./fileConfigurationStore";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryConfigurationPath(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "glove80-config-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "configuration.json");
}

describe("Electron configuration store", () => {
  it("atomically saves and reloads a validated document", () => {
    const filePath = temporaryConfigurationPath();
    const store = new FileConfigurationStore(filePath);
    const configuration = {
      schemaVersion: 1,
      preferences: { brightness: 48, reduceMotion: false },
      taskBoard: {
        bindingId: "codex-task-board",
        cells: [0, 40],
        workspaceRoots: [],
      },
    } satisfies ConfigurationDocument;

    store.write(configuration);

    expect(store.read()).toEqual(configuration);
    expect(readdirSync(path.dirname(filePath))).toEqual([
      "configuration.json",
    ]);
  });

  it("quarantines invalid UTF-8 byte-for-byte", () => {
    const filePath = temporaryConfigurationPath();
    const invalid = Buffer.from([0xff, 0xfe, 0xfd, 0x00]);
    writeFileSync(filePath, invalid);
    const store = new FileConfigurationStore(filePath);

    expect(store.read()).toBeUndefined();
    const backup = readdirSync(path.dirname(filePath)).find((name) =>
      name.startsWith("configuration.json.corrupt-"),
    );
    expect(backup).toBeDefined();
    expect(readFileSync(path.join(path.dirname(filePath), backup!))).toEqual(
      invalid,
    );
    expect(store.recoveryMessage()).toContain("safe defaults");
  });

  it("cold-restarts with durable settings and fresh transient state", async () => {
    const filePath = temporaryConfigurationPath();
    const first = new SimulationRuntime(new FileConfigurationStore(filePath));
    await first.dispatch({ kind: "assignTaskBoard", cells: [0, 1, 40] });
    await first.dispatch({
      kind: "setPreferences",
      brightness: 28,
      reduceMotion: true,
    });
    await first.dispatch({
      kind: "beginInteraction",
      epoch: 12,
      bank: "primary",
    });
    await first.dispatch({ kind: "burst" });

    const persisted = readFileSync(filePath, "utf8");
    expect(persisted).not.toMatch(
      /task-[0-9]|resourceId|interaction|acknowledg/i,
    );

    const restarted = await new SimulationRuntime(
      new FileConfigurationStore(filePath),
    ).bootstrap();
    expect(restarted.configuration.taskBoard?.cells).toEqual([0, 1, 40]);
    expect(restarted.configuration.preferences).toEqual({
      brightness: 28,
      reduceMotion: true,
    });
    expect(restarted.board?.interactionEpoch).toBeUndefined();
    expect(restarted.sourceTaskCount).toBe(6);
    expect(restarted.board?.collectionAvailability).toBe("online");
  });
});
