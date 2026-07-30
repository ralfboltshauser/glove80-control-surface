export interface HidDeviceDescriptor {
  readonly path: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly product?: string;
  readonly manufacturer?: string;
  readonly serialNumber?: string;
  readonly usagePage?: number;
  readonly usage?: number;
  readonly release?: number;
  readonly interfaceNumber?: number;
}

export interface HidConnection {
  getFeatureReport(reportId: number, length: number): Promise<Uint8Array>;
  read(timeoutMillis: number): Promise<Uint8Array | undefined>;
  write(report: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/**
 * This is the entire native-HID seam. It mirrors only the operations the
 * existing firmware needs, so tests can cover transport failures without
 * loading a native module.
 */
export interface HidTransport {
  enumerate(): Promise<readonly HidDeviceDescriptor[]>;
  open(path: string): Promise<HidConnection>;
}
