import { describe, expect, it } from "vitest";

import {
  GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID,
  LEGACY_FEATURE_REPORT_ID,
  encodeGenericCapabilityFeature,
  simulatedGlove80Capabilities,
} from "@glove80-control-surface/surface-protocol";

import type {
  HidConnection,
  HidDeviceDescriptor,
  HidTransport,
} from "./hidTransport";
import { discoverGlove80ReadOnly } from "./glove80Discovery";

describe("read-only Glove80 discovery", () => {
  it("distinguishes standard, legacy, generic, and right-half collections without writing", async () => {
    const transport = new DiscoveryTransport([
      descriptor("legacy", 0x27db, 1, 6, "Glove80 Left"),
      descriptor("generic", 0x27db, 1, 6, "Glove80 Left"),
      descriptor("ble", 0x27db, 1, 6, "Glove80"),
      descriptor("right", 0x27d9, undefined, undefined, "Glove80 Right"),
    ]);

    const observations = await discoverGlove80ReadOnly(transport);

    expect(
      observations.map((observation) => observation.capability),
    ).toEqual([
      "legacySix",
      "generic80",
      "standardHid",
      "rightPeripheral",
    ]);
    expect(observations[0]?.legacyFeature).toMatchObject({
      version: 1,
      controlledLedCount: 6,
      maxChannel: 32,
      maxTimeoutSeconds: 60,
    });
    expect(transport.writes).toBe(0);
    expect(transport.openConnections).toBe(0);
  });
});

class DiscoveryTransport implements HidTransport {
  writes = 0;
  openConnections = 0;

  constructor(private readonly descriptors: HidDeviceDescriptor[]) {}

  async enumerate(): Promise<readonly HidDeviceDescriptor[]> {
    return this.descriptors;
  }

  async open(path: string): Promise<HidConnection> {
    if (path !== "legacy" && path !== "generic") {
      throw new Error("unexpected open");
    }
    this.openConnections += 1;
    let closed = false;
    return {
      getFeatureReport: async (reportId) => {
        if (
          path === "generic" &&
          reportId === GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID
        ) {
          return encodeGenericCapabilityFeature(
            simulatedGlove80Capabilities(),
          );
        }
        if (
          path === "legacy" &&
          reportId === LEGACY_FEATURE_REPORT_ID
        ) {
          return Uint8Array.from([
            5, 1, 6, 32, 60, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0,
          ]);
        }
        throw new Error("feature report unavailable");
      },
      read: async () => undefined,
      write: async () => {
        this.writes += 1;
      },
      close: async () => {
        if (closed) return;
        closed = true;
        this.openConnections -= 1;
      },
    };
  }
}

function descriptor(
  path: string,
  productId: number,
  usagePage: number | undefined,
  usage: number | undefined,
  product: string,
): HidDeviceDescriptor {
  return {
    path,
    vendorId: 0x16c0,
    productId,
    product,
    usagePage,
    usage,
  };
}
