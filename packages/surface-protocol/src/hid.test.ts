import { describe, expect, it } from "vitest";

import {
  CommandKind,
  CommandResultCode,
  GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID,
  GENERIC_HID_HOST_REPORT_BYTES,
  GENERIC_HID_INPUT_REPORT_ID,
  GENERIC_HID_OUTPUT_REPORT_ID,
  HidFramingError,
  PacketKind,
  cellId,
  decodeGenericHidInput,
  decodeGenericHidOutput,
  decodeGenericCapabilityFeature,
  encodeGenericCapabilityFeature,
  encodeGenericHidInput,
  encodeGenericHidOutput,
  encodePacket,
  packetsForCompleteScene,
  sceneGeneration,
  sessionId,
  simulatedGlove80Capabilities,
  type CellPresentation,
} from "./index";

describe("generic 80-cell HID framing", () => {
  it("pads one host packet into the fixed report-6 output envelope", () => {
    const report = encodeGenericHidOutput(9, {
      kind: PacketKind.CapabilityQuery,
      sessionId: sessionId(7),
    });
    expect(report).toHaveLength(GENERIC_HID_HOST_REPORT_BYTES);
    expect(report[0]).toBe(GENERIC_HID_OUTPUT_REPORT_ID);
    expect(report.slice(1, 17)).toEqual(
      encodePacket(9, {
        kind: PacketKind.CapabilityQuery,
        sessionId: sessionId(7),
      }),
    );
    expect([...report.slice(17)]).toEqual(
      Array.from({ length: 47 }, () => 0),
    );
    expect(decodeGenericHidOutput(report)).toEqual([
      9,
      {
        kind: PacketKind.CapabilityQuery,
        sessionId: sessionId(7),
      },
    ]);
  });

  it("accepts input with or without report ID and rejects hidden trailing data", () => {
    const packet = {
      kind: PacketKind.CommandResult,
      sessionId: sessionId(7),
      command: CommandKind.OpenSession,
      result: CommandResultCode.Accepted,
    } as const;
    const prefixed = encodeGenericHidInput(11, packet);
    const body = prefixed.slice(1);

    expect(decodeGenericHidInput(body)).toEqual([11, packet]);
    expect(decodeGenericHidInput(prefixed)).toEqual([11, packet]);

    prefixed[prefixed.length - 1] = 1;
    expect(() => decodeGenericHidInput(prefixed)).toThrowError(
      expect.objectContaining<Partial<HidFramingError>>({
        code: "nonZeroPadding",
      }),
    );
  });

  it("round-trips the static read-only 80-cell capability feature", () => {
    const report = encodeGenericCapabilityFeature(
      simulatedGlove80Capabilities(),
    );
    expect(report[0]).toBe(
      GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID,
    );
    expect(decodeGenericCapabilityFeature(report)).toEqual(
      simulatedGlove80Capabilities(),
    );
  });

  it("fragments all 80 cells and commits them as one generation", () => {
    const cells = Array.from({ length: 80 }, (_, index) =>
      presentation(index),
    );
    const packets = packetsForCompleteScene({
      sessionId: sessionId(0x1234),
      generation: sceneGeneration(42),
      leaseMillis: 10_000,
      brightness: 48,
      cells,
      primaryActionCells: [cellId(0), cellId(79)],
      secondaryActionCells: [cellId(40)],
    });

    expect(packets).toHaveLength(15);
    expect(
      packets.filter((packet) => packet.kind === PacketKind.SceneFragment),
    ).toHaveLength(14);
    expect(
      packets.slice(0, -1).flatMap((packet) =>
        packet.kind === PacketKind.SceneFragment
          ? packet.fragment.cells.map((cell) => cell.cellId)
          : [],
      ),
    ).toEqual(Array.from({ length: 80 }, (_, index) => index));
    expect(packets.at(-1)).toMatchObject({
      kind: PacketKind.SceneCommit,
      fragmentCount: 14,
      totalCells: 80,
      generation: 42,
    });
    for (const [index, packet] of packets.entries()) {
      expect(encodePacket(index + 1, packet).length).toBeLessThanOrEqual(64);
    }
  });

  it("canonicalizes caller order before fragmenting and checksumming", () => {
    const packets = packetsForCompleteScene({
      sessionId: sessionId(3),
      generation: sceneGeneration(4),
      leaseMillis: 10_000,
      brightness: 16,
      cells: [presentation(79), presentation(0), presentation(40)],
      primaryActionCells: [],
      secondaryActionCells: [],
    });
    expect(
      packets.slice(0, -1).flatMap((packet) =>
        packet.kind === PacketKind.SceneFragment
          ? packet.fragment.cells.map((cell) => cell.cellId)
          : [],
      ),
    ).toEqual([0, 40, 79]);
  });

  it("uses the canonical zero-fragment commit to clear all 80 cells", () => {
    expect(
      packetsForCompleteScene({
        sessionId: sessionId(1),
        generation: sceneGeneration(2),
        leaseMillis: 10_000,
        brightness: 48,
        cells: [],
        primaryActionCells: [],
        secondaryActionCells: [],
      }),
    ).toEqual([
      expect.objectContaining({
        kind: PacketKind.SceneCommit,
        fragmentCount: 0,
        totalCells: 0,
        sceneChecksum: 0,
      }),
    ]);
  });
});

function presentation(index: number): CellPresentation {
  return {
    cellId: cellId(index),
    color: {
      red: index,
      green: 79 - index,
      blue: (index * 3) & 0xff,
    },
    effect: index % 2 === 0 ? "solid" : "pulse",
  };
}
