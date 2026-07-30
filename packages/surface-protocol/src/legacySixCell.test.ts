import { describe, expect, it } from "vitest";

import {
  LEGACY_FEATURE_REPORT_ID,
  LEGACY_OUTPUT_REPORT_ID,
  LEGACY_SIX_CELL_IDS,
  LEGACY_SIX_LED_ADDRESSES,
  LegacyProtocolError,
  LegacyStatus,
  decodeLegacyFeatureReport,
  encodeLegacyClearReport,
  encodeLegacySetReport,
  legacySixCellCapabilities,
} from "./index";

describe("legacy six-cell report fixture", () => {
  it("freezes the exact report-4 SET vector proven by the Swift companion", () => {
    expect(
      encodeLegacySetReport(
        1,
        10,
        Array.from({ length: 6 }, () => ({ red: 0, green: 0, blue: 32 })),
      ),
    ).toEqual(
      Uint8Array.from([
        4, 1, 1, 1, 0, 10, 0,
        0, 0, 32, 0, 0, 32, 0, 0, 32,
        0, 0, 32, 0, 0, 32, 0, 0, 32,
      ]),
    );
  });

  it("encodes a full-size CLEAR report with a fresh sequence", () => {
    const clear = encodeLegacyClearReport(255);
    expect(clear).toHaveLength(25);
    expect([...clear.slice(0, 5)]).toEqual([
      LEGACY_OUTPUT_REPORT_ID,
      1,
      2,
      255,
      0,
    ]);
    expect([...clear.slice(5)]).toEqual(Array.from({ length: 20 }, () => 0));
  });

  it("accepts feature bodies with or without the report-ID prefix", () => {
    const body = Uint8Array.from([
      1, 6, 32, 60, 7, LegacyStatus.Ok, 1,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const expected = {
      version: 1,
      controlledLedCount: 6,
      maxChannel: 32,
      maxTimeoutSeconds: 60,
      lastSequence: 7,
      lastStatus: LegacyStatus.Ok,
      active: true,
    };
    expect(decodeLegacyFeatureReport(body)).toEqual(expected);
    expect(
      decodeLegacyFeatureReport(
        Uint8Array.from([LEGACY_FEATURE_REPORT_ID, ...body]),
      ),
    ).toEqual(expected);
  });

  it("maps the exact physical left-row cells and LED addresses", () => {
    expect(LEGACY_SIX_CELL_IDS).toEqual([5, 6, 7, 8, 9, 10]);
    expect(LEGACY_SIX_LED_ADDRESSES).toEqual([35, 29, 23, 17, 11, 6]);
    expect(
      legacySixCellCapabilities(
        decodeLegacyFeatureReport(
          Uint8Array.from([
            1, 6, 32, 60, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0,
          ]),
        ),
      ),
    ).toMatchObject({
      topologyId: "glove80-legacy-left-row-2-v1",
      availableCells: [5, 6, 7, 8, 9, 10],
      supportedEffects: ["solid"],
      supportsInputEvents: false,
      supportsRightHalfAcknowledgement: false,
    });
  });

  it("rejects malformed or incompatible reports before they can match a device", () => {
    expect(() => decodeLegacyFeatureReport(Uint8Array.of(1, 6))).toThrow(
      LegacyProtocolError,
    );
    expect(() =>
      decodeLegacyFeatureReport(
        Uint8Array.from([
          2, 6, 32, 60, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0,
        ]),
      ),
    ).toThrow(/expected legacy protocol 1/);
    expect(() =>
      encodeLegacySetReport(
        0,
        10,
        Array.from({ length: 6 }, () => ({ red: 0, green: 0, blue: 0 })),
      ),
    ).toThrow(/sequence/);
    expect(() =>
      encodeLegacySetReport(
        1,
        61,
        Array.from({ length: 6 }, () => ({ red: 0, green: 0, blue: 0 })),
      ),
    ).toThrow(/timeout/);
  });
});
