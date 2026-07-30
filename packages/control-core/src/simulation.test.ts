import { describe, expect, it } from "vitest";

import conformanceCases from "../../../fixtures/runtime-conformance.json";
import {
  SimulationRuntime,
  type ConfigurationStore,
} from "./simulation";
import type {
  AppViewState,
  ConfigurationDocument,
  RuntimeCommand,
} from "./types";

class MemoryStore implements ConfigurationStore {
  value?: ConfigurationDocument;
  failWrites = false;

  read(): unknown | undefined {
    return this.value;
  }

  write(configuration: ConfigurationDocument): void {
    if (this.failWrites) throw new Error("simulated persistence failure");
    this.value = JSON.parse(JSON.stringify(configuration)) as ConfigurationDocument;
  }
}

describe("authoritative simulation runtime", () => {
  for (const scenario of conformanceCases) {
    it(scenario.name, async () => {
      const runtime = new SimulationRuntime(new MemoryStore());
      let view = await runtime.bootstrap();
      for (const command of scenario.commands as RuntimeCommand[]) {
        view = await runtime.dispatch(command);
      }
      if (scenario.rejectCommand) {
        await expect(
          runtime.dispatch(scenario.rejectCommand as RuntimeCommand),
        ).rejects.toThrow(scenario.errorContains);
      }
      assertExpectation(view, scenario.expect);
    });
  }

  it("does not commit rejected persistent mutations in memory", async () => {
    const store = new MemoryStore();
    const runtime = new SimulationRuntime(store);
    const before = await runtime.bootstrap();
    store.failWrites = true;

    await expect(
      runtime.dispatch({ kind: "assignTaskBoard", cells: [0, 40] }),
    ).rejects.toThrow("simulated persistence failure");
    await expect(
      runtime.dispatch({
        kind: "setPreferences",
        brightness: 12,
        reduceMotion: true,
      }),
    ).rejects.toThrow("simulated persistence failure");

    const after = await runtime.bootstrap();
    expect(after.configuration).toEqual(before.configuration);
    expect(after.board).toEqual(before.board);
  });

  it("surfaces configuration read failures instead of defaulting", () => {
    const store: ConfigurationStore = {
      read: () => {
        throw new Error("permission denied");
      },
      write: () => undefined,
    };
    expect(() => new SimulationRuntime(store)).toThrow("permission denied");
  });

  it("restores only durable configuration after a cold restart", async () => {
    const store = new MemoryStore();
    const first = new SimulationRuntime(store);
    await first.dispatch({ kind: "assignTaskBoard", cells: [0, 1, 40] });
    await first.dispatch({
      kind: "setPreferences",
      brightness: 32,
      reduceMotion: true,
    });
    await first.dispatch({ kind: "beginInteraction", epoch: 8 });
    await first.dispatch({ kind: "burst" });

    expect(JSON.stringify(store.value)).not.toMatch(
      /task-[0-9]|resourceId|interaction|acknowledg/i,
    );

    const restarted = await new SimulationRuntime(store).bootstrap();
    expect(restarted.configuration.taskBoard?.cells).toEqual([0, 1, 40]);
    expect(restarted.configuration.preferences).toEqual({
      brightness: 32,
      reduceMotion: true,
    });
    expect(restarted.board?.interactionEpoch).toBeUndefined();
    expect(restarted.sourceTaskCount).toBe(6);
    expect(restarted.board?.collectionAvailability).toBe("online");
  });
});

function assertExpectation(
  view: AppViewState,
  expected: (typeof conformanceCases)[number]["expect"],
): void {
  expect(view.board?.cells).toEqual(expected.boardCells);
  expect(view.device.syncStatus).toBe(expected.syncStatus);
  expect(view.device.rightHalfConnected).toBe(expected.rightHalfConnected);
  expect(view.sourceTaskCount).toBe(expected.sourceTaskCount);
  expect(view.board?.overflow).toHaveLength(expected.overflowCount);
  expect(view.board?.interactionEpoch !== undefined).toBe(
    expected.interactionActive,
  );
  if ("slotResources" in expected && expected.slotResources) {
    expect(
      view.board?.slots.map((slot) => slot.tile?.resourceId ?? null),
    ).toEqual(expected.slotResources);
  }
  if ("collectionAvailability" in expected && expected.collectionAvailability) {
    expect(view.board?.collectionAvailability).toBe(
      expected.collectionAvailability,
    );
  }
  if ("taskStates" in expected && expected.taskStates) {
    for (const [resourceId, state] of Object.entries(expected.taskStates)) {
      expect(
        view.board?.slots.find(
          (slot) => slot.tile?.resourceId === resourceId,
        )?.tile?.state,
      ).toBe(state);
    }
  }
}
