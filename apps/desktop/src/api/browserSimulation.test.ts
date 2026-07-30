import { beforeEach, describe, expect, it } from "vitest";

import conformanceCases from "../../../../fixtures/runtime-conformance.json";
import type {
  AppViewState,
  RuntimeCommand,
  SemanticState,
} from "../domain/types";
import { BrowserSimulationBackend } from "./browserSimulation";

interface ConformanceExpectation {
  boardCells: number[];
  slotResources?: Array<string | null>;
  syncStatus: AppViewState["device"]["syncStatus"];
  rightHalfConnected: boolean;
  generationAcks: "both" | "leftOnly" | "none";
  sourceTaskCount: number;
  overflowCount: number;
  interactionActive: boolean;
  collectionAvailability?: "online" | "stale" | "unavailable";
  taskStates?: Record<string, SemanticState>;
}

interface ConformanceCase {
  name: string;
  commands: RuntimeCommand[];
  rejectCommand?: RuntimeCommand;
  errorContains?: string;
  expect: ConformanceExpectation;
}

describe("browser visual harness conformance", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  for (const scenario of conformanceCases as ConformanceCase[]) {
    it(scenario.name, async () => {
      const backend = new BrowserSimulationBackend();
      let view = await backend.bootstrap();
      for (const command of scenario.commands) {
        view = await backend.dispatch(command);
      }
      if (scenario.rejectCommand) {
        await expect(
          backend.dispatch(scenario.rejectCommand),
        ).rejects.toThrow(scenario.errorContains);
      }
      assertConformance(view, scenario.expect);
    });
  }

  it("rejects malformed persisted JSON instead of trusting a type cast", async () => {
    window.localStorage.setItem(
      "glove80-control-surface.simulation.configuration.v1",
      JSON.stringify({
        schemaVersion: 1,
        preferences: { brightness: "bright", reduceMotion: false },
        taskBoard: {
          bindingId: "",
          cells: [80, 80],
          workspaceRoots: "not-an-array",
        },
      }),
    );

    const view = await new BrowserSimulationBackend().bootstrap();
    expect(view.configuration).toEqual({
      schemaVersion: 1,
      preferences: { brightness: 48, reduceMotion: false },
    });
    expect(view.board).toBeUndefined();
  });
});

function assertConformance(
  view: AppViewState,
  expected: ConformanceExpectation,
) {
  const board = view.board;
  expect(board?.cells).toEqual(expected.boardCells);
  expect(view.device.syncStatus).toBe(expected.syncStatus);
  expect(view.device.rightHalfConnected).toBe(
    expected.rightHalfConnected,
  );
  expect(view.sourceTaskCount).toBe(expected.sourceTaskCount);
  expect(board?.overflow).toHaveLength(expected.overflowCount);
  expect(board?.interactionEpoch !== undefined).toBe(
    expected.interactionActive,
  );
  if (expected.collectionAvailability) {
    expect(board?.collectionAvailability).toBe(
      expected.collectionAvailability,
    );
  }
  if (expected.slotResources) {
    expect(
      board?.slots.map((slot) => slot.tile?.resourceId ?? null),
    ).toEqual(expected.slotResources);
  }
  for (const [resourceId, state] of Object.entries(
    expected.taskStates ?? {},
  )) {
    expect(
      board?.slots.find((slot) => slot.tile?.resourceId === resourceId)
        ?.tile?.state,
    ).toBe(state);
  }

  const desired = view.device.desiredGeneration;
  expect(desired).toBeDefined();
  if (expected.generationAcks === "both") {
    expect(view.device.snapshot.leftGeneration).toBe(desired);
    expect(view.device.snapshot.rightGeneration).toBe(desired);
  } else if (expected.generationAcks === "leftOnly") {
    expect(view.device.snapshot.leftGeneration).toBe(desired);
    expect(view.device.snapshot.rightGeneration).toBeUndefined();
  } else {
    expect(view.device.snapshot.leftGeneration).toBeUndefined();
    expect(view.device.snapshot.rightGeneration).toBeUndefined();
  }
}
