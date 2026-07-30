import { describe, expect, it } from "vitest";

import {
  CommandKind,
  CommandResultCode,
  MAX_FRAGMENT_CELLS,
  MAX_PACKET_BYTES,
  PacketKind,
  RightHalfStatus,
  SessionStatus,
  WireError,
  cellId,
  decodePacket,
  encodePacket,
  packetDirection,
  packetSessionId,
  sceneChecksum,
  sceneGeneration,
  sessionId,
  simulatedGlove80Capabilities,
  validateCapabilities,
  validateDesiredScene,
  type CellPresentation,
  type Packet,
} from "./index";

const TEST_SESSION = sessionId(0x0102_0304);
const generation = (value: number) => sceneGeneration(value);
const presentation = (cell: number): CellPresentation => ({
  cellId: cellId(cell),
  color: { red: 0x11, green: 0x22, blue: 0x33 },
  effect: "pulse",
});

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe("validated protocol types", () => {
  it("enforces the 80-cell catalog and nonzero sentinels", () => {
    expect(cellId(79)).toBe(79);
    expect(() => cellId(80)).toThrow(/outside the supported Glove80 topology/);
    expect(() => sessionId(0)).toThrow(/non-zero/);
    expect(() => sceneGeneration(0)).toThrow(/non-zero/);
    expect(() => sessionId(0x1_0000_0000)).toThrow(TypeError);
  });

  it("validates complete capabilities and desired scenes", () => {
    const capabilities = simulatedGlove80Capabilities();
    expect(capabilities.availableCells).toHaveLength(80);
    expect(() => validateCapabilities(capabilities)).not.toThrow();
    expect(() =>
      validateDesiredScene(
        {
          sessionId: TEST_SESSION,
          generation: generation(1),
          leaseMillis: 5_000,
          brightness: 40,
          cells: [presentation(0), presentation(0)],
          primaryActionCells: [],
          secondaryActionCells: [],
        },
        capabilities,
      ),
    ).toThrow(/more than once/);
  });
});

describe("frozen wire format", () => {
  it("matches capability request and response golden vectors", () => {
    const request: Packet = {
      kind: PacketKind.CapabilityQuery,
      sessionId: TEST_SESSION,
    };
    const requestGolden = bytes(
      0x47, 0x38, 0x03, 0x01, 0x06, 0x05, 0x04, 0x00, 0x04, 0x03, 0x02, 0x01,
      0x25, 0x82, 0x18, 0x96,
    );
    expect(encodePacket(0x0506, request)).toEqual(requestGolden);
    expect(decodePacket(requestGolden)).toEqual([0x0506, request]);

    const response: Packet = {
      kind: PacketKind.CapabilityResponse,
      sessionId: TEST_SESSION,
      capabilities: simulatedGlove80Capabilities(),
    };
    const responseGolden = bytes(
      0x47, 0x38, 0x03, 0x08, 0x06, 0x05, 0x33, 0x00, 0x04, 0x03, 0x02, 0x01,
      0x03, 0x00, 0x11, 0x67, 0x6c, 0x6f, 0x76, 0x65, 0x38, 0x30, 0x2d, 0x72,
      0x67, 0x62, 0x2d, 0x38, 0x30, 0x2d, 0x76, 0x31, 0x08, 0x67, 0x38, 0x30,
      0x6d, 0x34, 0x61, 0x30, 0x36, 0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x03, 0x03, 0x50, 0x60, 0xea, 0x00,
      0x00, 0x60, 0x70, 0x61, 0x59, 0x4f,
    );
    expect(encodePacket(0x0506, response)).toEqual(responseGolden);
    expect(decodePacket(responseGolden)).toEqual([0x0506, response]);
  });

  it("matches scene fragment, commit, acknowledgement, and status goldens", () => {
    const fragment: Packet = {
      kind: PacketKind.SceneFragment,
      fragment: {
        sessionId: TEST_SESSION,
        generation: generation(9),
        fragmentIndex: 0,
        fragmentCount: 1,
        totalCells: 1,
        cells: [presentation(79)],
      },
    };
    expect(encodePacket(0x0506, fragment)).toEqual(
      bytes(
        0x47, 0x38, 0x03, 0x04, 0x06, 0x05, 0x12, 0x00, 0x04, 0x03, 0x02,
        0x01, 0x09, 0x00, 0x00, 0x00, 0x00, 0x01, 0x01, 0x01, 0x4f, 0x11,
        0x22, 0x33, 0x01, 0x00, 0x13, 0xc9, 0x45, 0xd9,
      ),
    );

    const commit: Packet = {
      kind: PacketKind.SceneCommit,
      sessionId: TEST_SESSION,
      generation: generation(9),
      fragmentCount: 1,
      totalCells: 1,
      leaseMillis: 5_000,
      brightness: 64,
      sceneChecksum: 0x1020_3040,
      primaryActionCells: [cellId(1), cellId(79)],
      secondaryActionCells: [cellId(42)],
    };
    expect(encodePacket(0x0708, commit)).toEqual(
      bytes(
        0x47, 0x38, 0x03, 0x05, 0x08, 0x07, 0x27, 0x00, 0x04, 0x03, 0x02,
        0x01, 0x09, 0x00, 0x00, 0x00, 0x01, 0x01, 0x88, 0x13, 0x00, 0x00,
        0x40, 0x40, 0x30, 0x20, 0x10, 0x02, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x04, 0x00, 0x00, 0x00, 0x00, 0x47, 0x87, 0xf3, 0x66,
      ),
    );

    const acknowledgement: Packet = {
      kind: PacketKind.CommandResult,
      sessionId: TEST_SESSION,
      command: CommandKind.SceneCommit,
      result: CommandResultCode.Applied,
      centralGeneration: generation(9),
      rightGeneration: generation(9),
    };
    expect(encodePacket(0x0708, acknowledgement)).toEqual(
      bytes(
        0x47, 0x38, 0x03, 0x0b, 0x08, 0x07, 0x0e, 0x00, 0x04, 0x03, 0x02,
        0x01, 0x05, 0x01, 0x09, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00,
        0x03, 0x49, 0xb9, 0xf6,
      ),
    );

    const status: Packet = {
      kind: PacketKind.StatusResponse,
      sessionId: TEST_SESSION,
      status: SessionStatus.Active,
      leaseRemainingMillis: 4_000,
      centralGeneration: generation(9),
      rightGeneration: undefined,
      rightStatus: RightHalfStatus.Syncing,
      interactionEpoch: 3,
    };
    const encodedStatus = encodePacket(0x090a, status);
    expect(encodedStatus).toEqual(
      bytes(
        0x47, 0x38, 0x03, 0x0a, 0x0a, 0x09, 0x16, 0x00, 0x04, 0x03, 0x02,
        0x01, 0x00, 0xa0, 0x0f, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x02, 0x03, 0x00, 0x00, 0x00, 0x79, 0x15, 0x54,
        0x87,
      ),
    );
    expect(decodePacket(encodedStatus)).toEqual([0x090a, status]);
  });

  it("keeps interaction events session-scoped and rejects zero sequences", () => {
    const packets: Packet[] = [
      {
        kind: PacketKind.InteractionModeEntered,
        sessionId: TEST_SESSION,
        eventSequence: 16,
        interactionEpoch: 3,
        bank: "primary",
      },
      {
        kind: PacketKind.CellEvent,
        sessionId: TEST_SESSION,
        eventSequence: 17,
        interactionEpoch: 3,
        cellId: cellId(42),
        eventKind: "down",
        bank: "primary",
      },
      {
        kind: PacketKind.InteractionModeExited,
        sessionId: TEST_SESSION,
        eventSequence: 18,
        interactionEpoch: 3,
        bank: "primary",
      },
    ];
    const goldens = [
      bytes(
        0x47, 0x38, 0x03, 0x0d, 0x01, 0x00, 0x0d, 0x00, 0x04, 0x03, 0x02,
        0x01, 0x10, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x8b,
        0x81, 0x5f, 0x7b,
      ),
      bytes(
        0x47, 0x38, 0x03, 0x07, 0x02, 0x00, 0x0f, 0x00, 0x04, 0x03, 0x02,
        0x01, 0x11, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x2a, 0x00,
        0x00, 0x30, 0x31, 0x3a, 0xd7,
      ),
      bytes(
        0x47, 0x38, 0x03, 0x0e, 0x03, 0x00, 0x0d, 0x00, 0x04, 0x03, 0x02,
        0x01, 0x12, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0xa8,
        0xe4, 0x13, 0x6b,
      ),
    ];
    for (const [index, packet] of packets.entries()) {
      expect(packetDirection(packet.kind)).toBe("deviceToHost");
      expect(packetSessionId(packet)).toBe(TEST_SESSION);
      const encoded = encodePacket(index + 1, packet);
      expect(encoded).toEqual(goldens[index]);
      expect(encoded.length).toBeLessThanOrEqual(MAX_PACKET_BYTES);
      expect(decodePacket(encoded)).toEqual([index + 1, packet]);
    }
    expect(() =>
      encodePacket(1, {
        kind: PacketKind.InteractionModeEntered,
        sessionId: TEST_SESSION,
        eventSequence: 0,
        interactionEpoch: 1,
        bank: "primary",
      }),
    ).toThrowError(expect.objectContaining<Partial<WireError>>({ code: "zeroEventSequence" }));
  });

  it("supports the canonical zero-fragment clear and rejects contradictions", () => {
    const clear: Packet = {
      kind: PacketKind.SceneCommit,
      sessionId: TEST_SESSION,
      generation: generation(10),
      fragmentCount: 0,
      totalCells: 0,
      leaseMillis: 5_000,
      brightness: 48,
      sceneChecksum: sceneChecksum([]),
      primaryActionCells: [],
      secondaryActionCells: [],
    };
    expect(sceneChecksum([])).toBe(0);
    expect(decodePacket(encodePacket(7, clear))).toEqual([7, clear]);
    expect(() =>
      encodePacket(7, { ...clear, sceneChecksum: 1 }),
    ).toThrowError(expect.objectContaining<Partial<WireError>>({ code: "invalidCommit" }));
    expect(() =>
      encodePacket(7, { ...clear, fragmentCount: 1 }),
    ).toThrowError(expect.objectContaining<Partial<WireError>>({ code: "invalidCommit" }));
  });

  it("fits the fragment capacity and rejects impossible layouts", () => {
    const cells = Array.from({ length: MAX_FRAGMENT_CELLS }, (_, index) =>
      presentation(index),
    );
    const packet: Packet = {
      kind: PacketKind.SceneFragment,
      fragment: {
        sessionId: TEST_SESSION,
        generation: generation(9),
        fragmentIndex: 0,
        fragmentCount: 1,
        totalCells: MAX_FRAGMENT_CELLS,
        cells,
      },
    };
    expect(encodePacket(1, packet).length).toBeLessThanOrEqual(MAX_PACKET_BYTES);
    expect(() =>
      encodePacket(1, {
        ...packet,
        fragment: { ...packet.fragment, totalCells: MAX_FRAGMENT_CELLS + 1 },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<WireError>>({ code: "invalidFragmentLayout" }),
    );
  });

  it("rejects checksum corruption before interpreting payload fields", () => {
    const encoded = encodePacket(1, {
      kind: PacketKind.CapabilityQuery,
      sessionId: TEST_SESSION,
    });
    encoded[8] ^= 1;
    expect(() => decodePacket(encoded)).toThrowError(
      expect.objectContaining<Partial<WireError>>({ code: "checksumMismatch" }),
    );
  });

  it("round-trips every frozen packet kind within one report", () => {
    const packets: Packet[] = [
      { kind: PacketKind.CapabilityQuery, sessionId: TEST_SESSION },
      {
        kind: PacketKind.OpenSession,
        sessionId: TEST_SESSION,
        leaseMillis: 5_000,
      },
      {
        kind: PacketKind.RenewSession,
        sessionId: TEST_SESSION,
        leaseMillis: 5_000,
      },
      {
        kind: PacketKind.SceneFragment,
        fragment: {
          sessionId: TEST_SESSION,
          generation: generation(9),
          fragmentIndex: 0,
          fragmentCount: 1,
          totalCells: 1,
          cells: [presentation(1)],
        },
      },
      {
        kind: PacketKind.SceneCommit,
        sessionId: TEST_SESSION,
        generation: generation(9),
        fragmentCount: 1,
        totalCells: 1,
        leaseMillis: 5_000,
        brightness: 64,
        sceneChecksum: 1,
        primaryActionCells: [],
        secondaryActionCells: [],
      },
      { kind: PacketKind.CloseSession, sessionId: TEST_SESSION },
      {
        kind: PacketKind.CellEvent,
        sessionId: TEST_SESSION,
        eventSequence: 2,
        interactionEpoch: 1,
        cellId: cellId(1),
        eventKind: "down",
        bank: "primary",
      },
      {
        kind: PacketKind.CapabilityResponse,
        sessionId: TEST_SESSION,
        capabilities: simulatedGlove80Capabilities(),
      },
      { kind: PacketKind.StatusQuery, sessionId: TEST_SESSION },
      {
        kind: PacketKind.StatusResponse,
        sessionId: TEST_SESSION,
        status: SessionStatus.Active,
        leaseRemainingMillis: 4_000,
        centralGeneration: generation(9),
        rightGeneration: undefined,
        rightStatus: RightHalfStatus.Syncing,
        interactionEpoch: undefined,
      },
      {
        kind: PacketKind.CommandResult,
        sessionId: TEST_SESSION,
        command: CommandKind.SceneCommit,
        result: CommandResultCode.Partial,
        centralGeneration: generation(9),
        rightGeneration: generation(8),
      },
      {
        kind: PacketKind.DeviceError,
        sessionId: TEST_SESSION,
        requestKind: PacketKind.CapabilityQuery,
        code: "unsupportedVersion",
      },
      {
        kind: PacketKind.InteractionModeEntered,
        sessionId: TEST_SESSION,
        eventSequence: 1,
        interactionEpoch: 1,
        bank: "primary",
      },
      {
        kind: PacketKind.InteractionModeExited,
        sessionId: TEST_SESSION,
        eventSequence: 3,
        interactionEpoch: 1,
        bank: "primary",
      },
      {
        kind: PacketKind.SceneExpired,
        sessionId: TEST_SESSION,
        generation: generation(9),
      },
    ];
    expect(packets.map(({ kind }) => kind)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
    packets.forEach((packet, sequence) => {
      const encoded = encodePacket(sequence, packet);
      expect(encoded.length).toBeLessThanOrEqual(MAX_PACKET_BYTES);
      expect(decodePacket(encoded)).toEqual([sequence, packet]);
    });
  });
});
