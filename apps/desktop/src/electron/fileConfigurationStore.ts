import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { ConfigurationDocument } from "../domain/types";
import {
  parseConfiguration,
  type ConfigurationStore,
} from "../runtime/simulationRuntime";

export class FileConfigurationStore implements ConfigurationStore {
  private recoveredMessage?: string;

  constructor(private readonly filePath: string) {}

  read(): unknown | undefined {
    if (!existsSync(this.filePath)) return undefined;

    const bytes = readFileSync(this.filePath);
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return parseConfiguration(JSON.parse(text));
    } catch (error) {
      const backupPath = `${this.filePath}.corrupt-${Date.now()}`;
      renameSync(this.filePath, backupPath);
      this.recoveredMessage =
        `Saved configuration was invalid, so safe defaults were loaded. ` +
        `The original bytes were preserved at ${backupPath}. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`;
      return undefined;
    }
  }

  write(configuration: ConfigurationDocument): void {
    const directory = path.dirname(this.filePath);
    mkdirSync(directory, { recursive: true });
    const temporaryPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    const document = `${JSON.stringify(configuration, null, 2)}\n`;
    let descriptor: number | undefined;

    try {
      descriptor = openSync(temporaryPath, "wx", 0o600);
      writeFileSync(descriptor, document, "utf8");
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporaryPath, this.filePath);
      syncDirectory(directory);
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
      throw error;
    }
  }

  recoveryMessage(): string | undefined {
    return this.recoveredMessage;
  }
}

function syncDirectory(directory: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch {
    // Windows and some filesystems do not allow opening directories.
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
