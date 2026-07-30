import type {
  HidConnection,
  HidDeviceDescriptor,
  HidTransport,
} from "./hidTransport";

type NodeHidModule = typeof import("node-hid");
type NodeHidAsync = Awaited<
  ReturnType<NodeHidModule["HIDAsync"]["open"]>
>;

export class NodeHidTransport implements HidTransport {
  private module?: Promise<NodeHidModule>;

  async enumerate(): Promise<readonly HidDeviceDescriptor[]> {
    const nodeHid = await this.load();
    const devices = await nodeHid.devicesAsync();
    return devices.flatMap((device) =>
      device.path
        ? [{
            path: device.path,
            vendorId: device.vendorId,
            productId: device.productId,
            product: device.product,
            manufacturer: device.manufacturer,
            serialNumber: device.serialNumber,
            usagePage: device.usagePage,
            usage: device.usage,
            release: device.release,
            interfaceNumber: device.interface,
          }]
        : [],
    );
  }

  async open(path: string): Promise<HidConnection> {
    if (path.trim() === "") throw new Error("HID path cannot be empty.");
    const nodeHid = await this.load();
    const device = await nodeHid.HIDAsync.open(path, {
      // macOS otherwise requests exclusive access to the keyboard collection.
      // The vendor collection does not need to interfere with normal typing.
      nonExclusive: true,
    });
    return new NodeHidConnection(device);
  }

  private load(): Promise<NodeHidModule> {
    return this.module ?? (this.module = import("node-hid"));
  }
}

class NodeHidConnection implements HidConnection {
  private closed = false;

  constructor(private readonly device: NodeHidAsync) {}

  async getFeatureReport(
    reportId: number,
    length: number,
  ): Promise<Uint8Array> {
    this.requireOpen();
    const report = await this.device.getFeatureReport(reportId, length);
    return Uint8Array.from(report);
  }

  async read(timeoutMillis: number): Promise<Uint8Array | undefined> {
    this.requireOpen();
    const report = await this.device.read(timeoutMillis);
    return report ? Uint8Array.from(report) : undefined;
  }

  async write(report: Uint8Array): Promise<void> {
    this.requireOpen();
    const written = await this.device.write(Buffer.from(report));
    if (written !== report.length) {
      throw new Error(
        `HID output report was only partially accepted (${written}/${report.length} bytes).`,
      );
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.device.close();
  }

  private requireOpen(): void {
    if (this.closed) throw new Error("HID connection is already closed.");
  }
}
