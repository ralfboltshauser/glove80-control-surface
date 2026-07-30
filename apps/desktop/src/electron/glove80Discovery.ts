import {
  GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID,
  GENERIC_HID_HOST_REPORT_BYTES,
  LEGACY_FEATURE_BODY_BYTES,
  LEGACY_FEATURE_REPORT_ID,
  LEGACY_GLOVE80_LEFT_PRODUCT_ID,
  LEGACY_GLOVE80_VENDOR_ID,
  decodeLegacyFeatureReport,
  decodeGenericCapabilityFeature,
  type DeviceCapabilities,
  type LegacyFeatureStatus,
} from "@glove80-control-surface/surface-protocol";

import type {
  HidConnection,
  HidDeviceDescriptor,
  HidTransport,
} from "./hidTransport";

const GLOVE80_RIGHT_PRODUCT_ID = 0x27d9;

export type Glove80CapabilityKind =
  | "generic80"
  | "legacySix"
  | "standardHid"
  | "rightPeripheral"
  | "unknown";

export interface Glove80HardwareObservation {
  readonly descriptor: HidDeviceDescriptor;
  readonly capability: Glove80CapabilityKind;
  readonly detail: string;
  readonly legacyFeature?: LegacyFeatureStatus;
  readonly genericCapabilities?: DeviceCapabilities;
}

/**
 * Enumerates device metadata and, only for the known legacy vendor
 * collection, reads feature report 5. It never sends an output report.
 */
export async function discoverGlove80ReadOnly(
  transport: HidTransport,
): Promise<readonly Glove80HardwareObservation[]> {
  const descriptors = await transport.enumerate();
  const observations: Glove80HardwareObservation[] = [];
  const seen = new Set<string>();

  for (const descriptor of descriptors) {
    if (!isGlove80(descriptor) || seen.has(descriptor.path)) continue;
    seen.add(descriptor.path);

    if (isUsbLeft(descriptor)) {
      observations.push(await readLeftFeatures(transport, descriptor));
      continue;
    }
    if (descriptor.productId === GLOVE80_RIGHT_PRODUCT_ID) {
      observations.push({
        descriptor,
        capability: "rightPeripheral",
        detail:
          "The physical right half is present but is not the host-facing control endpoint.",
      });
      continue;
    }
    observations.push({
      descriptor,
      capability:
        descriptor.usagePage === 1 ? "standardHid" : "unknown",
      detail:
        descriptor.usagePage === 1
          ? "Standard keyboard/consumer HID collection; no per-key host lighting contract is inferred."
          : "Glove80 collection without a recognized control-surface contract.",
    });
  }

  return observations;
}

async function readLeftFeatures(
  transport: HidTransport,
  descriptor: HidDeviceDescriptor,
): Promise<Glove80HardwareObservation> {
  let connection: HidConnection | undefined;
  try {
    connection = await transport.open(descriptor.path);
    try {
      const genericCapabilities = decodeGenericCapabilityFeature(
        await connection.getFeatureReport(
          GENERIC_HID_CAPABILITY_FEATURE_REPORT_ID,
          GENERIC_HID_HOST_REPORT_BYTES,
        ),
      );
      return {
        descriptor,
        capability: "generic80",
        genericCapabilities,
        detail:
          "Read-only feature report 8 confirms the complete 80-cell firmware.",
      };
    } catch {
      // The currently flashed legacy experiment has no report 8. Report 5 is
      // attempted next on the same already-open, read-only connection.
    }
    const legacyFeature = decodeLegacyFeatureReport(
      await connection.getFeatureReport(
        LEGACY_FEATURE_REPORT_ID,
        LEGACY_FEATURE_BODY_BYTES + 1,
      ),
    );
    return {
      descriptor,
      capability: "legacySix",
      legacyFeature,
      detail:
        "Feature report 5 confirms the temporary six-cell firmware; it is incompatible with complete 80-cell scenes.",
    };
  } catch (error) {
    return {
      descriptor,
      capability: "unknown",
      detail: `No recognized read-only capability feature was available: ${errorMessage(error)}`,
    };
  } finally {
    await connection?.close().catch(() => undefined);
  }
}

function isUsbLeft(descriptor: HidDeviceDescriptor): boolean {
  return (
    descriptor.vendorId === LEGACY_GLOVE80_VENDOR_ID &&
    descriptor.productId === LEGACY_GLOVE80_LEFT_PRODUCT_ID &&
    descriptor.product?.trim().toLocaleLowerCase() === "glove80 left"
  );
}

function isGlove80(descriptor: HidDeviceDescriptor): boolean {
  return (
    (descriptor.vendorId === LEGACY_GLOVE80_VENDOR_ID &&
      (descriptor.productId === LEGACY_GLOVE80_LEFT_PRODUCT_ID ||
        descriptor.productId === GLOVE80_RIGHT_PRODUCT_ID)) ||
    descriptor.product?.toLocaleLowerCase().includes("glove80") === true
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
