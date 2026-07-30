import type { RuntimeCommand } from "../domain/types";

const noPayloadKinds = new Set<RuntimeCommand["kind"]>([
  "removeTaskBoard",
  "addTask",
  "burst",
  "expireSource",
  "expireScene",
  "resetSimulation",
]);

export function parseRuntimeCommand(value: unknown): RuntimeCommand {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new Error("Invalid runtime command.");
  }

  if (noPayloadKinds.has(value.kind as RuntimeCommand["kind"])) {
    return { kind: value.kind } as RuntimeCommand;
  }

  switch (value.kind) {
    case "assignTaskBoard":
      if (
        !Array.isArray(value.cells) ||
        value.cells.some((cell) => !isCellId(cell))
      ) break;
      return { kind: value.kind, cells: [...value.cells] };
    case "setPaused":
    case "setRightHalfConnected":
    case "setDeviceConnected":
      if (typeof value.paused === "boolean" && value.kind === "setPaused") {
        return { kind: value.kind, paused: value.paused };
      }
      if (
        typeof value.connected === "boolean" &&
        value.kind !== "setPaused"
      ) {
        return { kind: value.kind, connected: value.connected };
      }
      break;
    case "setPreferences":
      if (
        Number.isInteger(value.brightness) &&
        (value.brightness as number) >= 0 &&
        (value.brightness as number) <= 255 &&
        typeof value.reduceMotion === "boolean"
      ) {
        return {
          kind: value.kind,
          brightness: value.brightness as number,
          reduceMotion: value.reduceMotion,
        };
      }
      break;
    case "setTaskState":
      if (isCellId(value.cellId) && isSemanticState(value.state)) {
        return {
          kind: value.kind,
          cellId: value.cellId,
          state: value.state,
        };
      }
      break;
    case "removeTask":
    case "acknowledge":
      if (isCellId(value.cellId)) {
        return { kind: value.kind, cellId: value.cellId };
      }
      break;
    case "setSourceAvailability":
      if (
        value.availability === "online" ||
        value.availability === "stale" ||
        value.availability === "unavailable"
      ) {
        return { kind: value.kind, availability: value.availability };
      }
      break;
    case "beginInteraction":
      if (
        isPositiveInteger(value.epoch) &&
        (value.bank === "primary" || value.bank === "secondary")
      ) {
        return { kind: value.kind, epoch: value.epoch, bank: value.bank };
      }
      break;
    case "endInteraction":
      if (isPositiveInteger(value.epoch)) {
        return { kind: value.kind, epoch: value.epoch };
      }
      break;
    case "invokeCell":
      if (
        isPositiveInteger(value.epoch) &&
        isCellId(value.cellId) &&
        (value.bank === "primary" || value.bank === "secondary")
      ) {
        return {
          kind: value.kind,
          epoch: value.epoch,
          cellId: value.cellId,
          bank: value.bank,
        };
      }
      break;
  }

  throw new Error(`Invalid ${value.kind} runtime command.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) > 0 &&
    (value as number) <= 0xffff_ffff
  );
}

function isCellId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < 80;
}

function isSemanticState(
  value: unknown,
): value is Extract<RuntimeCommand, { kind: "setTaskState" }>["state"] {
  return (
    value === "idle" ||
    value === "working" ||
    value === "completedUnread" ||
    value === "needsInput" ||
    value === "failed" ||
    value === "stale"
  );
}
