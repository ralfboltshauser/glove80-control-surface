#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const EXPECTED_KEYMAP =
  "732b79ad73a3b93d74c5fc6d3002411a4dfd7e4338149b77922bad7105479410";
const EXPECTED_LAYOUT =
  "aa4de7a2e830fa70462cc3a6f1779b97c335de045edf5a7dbdb2ed9c156f91d3";
const EXPECTED_DERIVED =
  "a2b75bbdc59cb36636dc5cef4b8a4ab591e61381f30c4774e98851d99df44e45";
const EXPECTED_BUILD_ID = "g80m4a01";
const EXPECTED_UF2_FAMILY = {
  lh: 0x9807b007,
  rh: 0x9808b007,
};
const CODE_PARTITION_START = 0x26000;
const CODE_PARTITION_END = 0xec000;
const EXPECTED_LAYERS = ["Base", "Lower", "Magic", "Factory"];

const repositoryRoot = resolve(import.meta.dirname, "../..");
const [surfaceDirectoryArg, recoveryDirectoryArg] = process.argv.slice(2);
if (!surfaceDirectoryArg || !recoveryDirectoryArg) {
  throw new Error(
    "usage: verify-release.mjs <surface-build-directory> <recovery-build-directory>",
  );
}
const surfaceDirectory = resolve(surfaceDirectoryArg);
const recoveryDirectory = resolve(recoveryDirectoryArg);

const keymapPath = resolve(
  repositoryRoot,
  "firmware/input/ralf-custom-swiss-v8.keymap",
);
const layoutPath = resolve(
  repositoryRoot,
  "firmware/input/ralf-custom-swiss-v8.json",
);
const derivedPath = resolve(
  surfaceDirectory,
  "input/ralf-custom-swiss-v8-control.keymap",
);
const topology = JSON.parse(
  await readFile(
    resolve(repositoryRoot, "firmware/topology/glove80-rgb-80-v1.json"),
    "utf8",
  ),
);

assertEqual(await sha256(keymapPath), EXPECTED_KEYMAP, "keymap SHA-256");
assertEqual(await sha256(layoutPath), EXPECTED_LAYOUT, "layout SHA-256");
assertEqual(await sha256(derivedPath), EXPECTED_DERIVED, "derived keymap SHA-256");
assertPermutation(topology.zmkPositionToCell, "zmkPositionToCell");
assertPermutation(topology.cellToLedChannel, "cellToLedChannel");

const release = {
  buildId: EXPECTED_BUILD_ID,
  topologyId: topology.topologyId,
  sourceKeymapSha256: EXPECTED_KEYMAP,
  layoutJsonSha256: EXPECTED_LAYOUT,
  derivedKeymapSha256: EXPECTED_DERIVED,
  surface: {},
  recovery: {},
};

for (const side of ["lh", "rh"]) {
  const surfaceConfigPath = resolve(
    surfaceDirectory,
    side,
    "zephyr/.config",
  );
  const surfaceConfig = await readFile(surfaceConfigPath, "utf8");
  assertIncludes(
    surfaceConfig,
    "CONFIG_GLOVE80_CONTROL_SURFACE=y",
    `${side} feature config`,
  );
  assertIncludes(
    surfaceConfig,
    side === "lh"
      ? "CONFIG_ZMK_SPLIT_BLE_CENTRAL_SPLIT_RUN_STACK_SIZE=1024"
      : "CONFIG_ZMK_SPLIT_BLE_PERIPHERAL_STACK_SIZE=1024",
    `${side} split stack`,
  );
  assertBoardAndRole(surfaceConfig, side, `${side} surface`);

  const dts = await readFile(
    resolve(surfaceDirectory, side, "zephyr/zephyr.dts"),
    "utf8",
  );
  const controlBindings = [...dts.matchAll(/&surface_key\s+0x([0-9a-f]+)/g)]
    .map((match) => Number.parseInt(match[1], 16));
  assertEqual(controlBindings.length, 80, `${side} Control binding count`);
  controlBindings.forEach((value, index) =>
    assertEqual(value, index, `${side} Control binding ${index}`),
  );
  const surfaceLayers = extractLayers(dts);
  assertEqual(
    JSON.stringify(surfaceLayers.map((layer) => layer.name)),
    JSON.stringify([...EXPECTED_LAYERS, "Control"]),
    `${side} surface layer order`,
  );
  if (dts.includes("combos {")) {
    throw new Error(`${side} surface keymap unexpectedly contains combos`);
  }

  const surfaceUf2 = resolve(surfaceDirectory, side, "zephyr/zmk.uf2");
  if (side === "lh") {
    const surfaceBin = resolve(surfaceDirectory, side, "zephyr/zmk.bin");
    const binary = await readFile(surfaceBin);
    if (!binary.includes(Buffer.from(EXPECTED_BUILD_ID))) {
      throw new Error(
        `${side} host binary does not contain build ID ${EXPECTED_BUILD_ID}`,
      );
    }
  }
  await verifyUf2MatchesBin(
    surfaceUf2,
    resolve(surfaceDirectory, side, "zephyr/zmk.bin"),
    side,
  );
  const labelledSurfaceUf2 = resolve(
    surfaceDirectory,
    `glove80_surface_${side}.uf2`,
  );
  assertEqual(
    await sha256(labelledSurfaceUf2),
    await sha256(surfaceUf2),
    `${side} labelled surface artifact`,
  );
  release.surface[side] = await artifact(labelledSurfaceUf2);

  const recoveryConfig = await readFile(
    resolve(recoveryDirectory, side, "zephyr/.config"),
    "utf8",
  );
  if (recoveryConfig.includes("CONFIG_GLOVE80_CONTROL_SURFACE=y")) {
    throw new Error(`${side} recovery image unexpectedly enables the feature`);
  }
  assertBoardAndRole(recoveryConfig, side, `${side} recovery`);
  assertConfigDiff(recoveryConfig, surfaceConfig, side);

  const recoveryDts = await readFile(
    resolve(recoveryDirectory, side, "zephyr/zephyr.dts"),
    "utf8",
  );
  const recoveryLayers = extractLayers(recoveryDts);
  assertEqual(
    JSON.stringify(recoveryLayers.map((layer) => layer.name)),
    JSON.stringify(EXPECTED_LAYERS),
    `${side} recovery layer order`,
  );
  surfaceLayers.slice(0, 4).forEach((layer, index) => {
    const expectedBindings = recoveryLayers[index].bindings.replaceAll(
      "&magic ",
      "&surface_magic ",
    );
    assertEqual(
      layer.bindings,
      expectedBindings,
      `${side} preserved ${layer.name} bindings`,
    );
  });

  const expectedSurfaceKeymap = derivedPath;
  const expectedRecoveryKeymap = keymapPath;
  assertCacheInput(
    resolve(surfaceDirectory, side, "CMakeCache.txt"),
    expectedSurfaceKeymap,
    `${side} surface`,
  );
  assertCacheInput(
    resolve(recoveryDirectory, side, "CMakeCache.txt"),
    expectedRecoveryKeymap,
    `${side} recovery`,
  );

  const recoveryUf2 = resolve(
    recoveryDirectory,
    side,
    "zephyr/zmk.uf2",
  );
  await verifyUf2MatchesBin(
    recoveryUf2,
    resolve(recoveryDirectory, side, "zephyr/zmk.bin"),
    side,
  );
  const labelledRecoveryUf2 = resolve(
    recoveryDirectory,
    `glove80_recovery_${side}.uf2`,
  );
  assertEqual(
    await sha256(labelledRecoveryUf2),
    await sha256(recoveryUf2),
    `${side} labelled recovery artifact`,
  );
  release.recovery[side] = await artifact(labelledRecoveryUf2);
}

process.stdout.write(`${JSON.stringify(release, null, 2)}\n`);

async function artifact(path) {
  const bytes = await readFile(path);
  return {
    file: path,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function assertIncludes(text, expected, label) {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

function assertPermutation(candidate, label) {
  if (
    !Array.isArray(candidate) ||
    candidate.length !== 80 ||
    [...candidate]
      .sort((left, right) => left - right)
      .some((value, index) => value !== index)
  ) {
    throw new Error(`${label} must be a permutation of 0 through 79`);
  }
}

function assertBoardAndRole(config, side, label) {
  assertIncludes(
    config,
    `CONFIG_BOARD_GLOVE80_${side.toUpperCase()}=y`,
    `${label} board`,
  );
  const central = config.includes("CONFIG_ZMK_SPLIT_ROLE_CENTRAL=y");
  assertEqual(central, side === "lh", `${label} split role`);
  if (config.includes("CONFIG_ZMK_STUDIO=y")) {
    throw new Error(`${label} unexpectedly enables ZMK Studio`);
  }
}

function configAssignments(config) {
  return new Map(
    config
      .split("\n")
      .filter((line) => /^CONFIG_[A-Z0-9_]+=/.test(line))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function assertConfigDiff(recoveryConfig, surfaceConfig, side) {
  const recovery = configAssignments(recoveryConfig);
  const surface = configAssignments(surfaceConfig);
  const allowed = new Set([
    "CONFIG_GLOVE80_CONTROL_SURFACE",
    "CONFIG_DT_HAS_ZMK_BEHAVIOR_CONTROL_SURFACE_KEY_ENABLED",
    "CONFIG_DT_HAS_ZMK_BEHAVIOR_CONTROL_SURFACE_TRIGGER_ENABLED",
    side === "lh"
      ? "CONFIG_ZMK_SPLIT_BLE_CENTRAL_SPLIT_RUN_STACK_SIZE"
      : "CONFIG_ZMK_SPLIT_BLE_PERIPHERAL_STACK_SIZE",
  ]);
  const keys = new Set([...recovery.keys(), ...surface.keys()]);
  for (const key of keys) {
    if (recovery.get(key) !== surface.get(key) && !allowed.has(key)) {
      throw new Error(
        `${side} surface has unexpected config change ${key}: ` +
          `${recovery.get(key)} -> ${surface.get(key)}`,
      );
    }
  }
}

function extractLayers(dts) {
  const layers = [];
  const expression =
    /layer_([A-Za-z0-9_]+)\s*\{[\s\S]*?bindings\s*=\s*<([\s\S]*?)>;/g;
  for (const match of dts.matchAll(expression)) {
    layers.push({
      name: match[1],
      bindings: match[2].replace(/\s+/g, " ").trim(),
    });
  }
  return layers;
}

async function assertCacheInput(cachePath, expectedPath, label) {
  const cache = await readFile(cachePath, "utf8");
  assertIncludes(
    cache,
    `KEYMAP_FILE:UNINITIALIZED=${expectedPath}`,
    `${label} CMake keymap input`,
  );
}

async function verifyUf2MatchesBin(uf2Path, binPath, side) {
  const uf2 = await readFile(uf2Path);
  const binary = await readFile(binPath);
  if (uf2.length === 0 || uf2.length % 512 !== 0) {
    throw new Error(`${uf2Path} is not a sequence of 512-byte UF2 blocks`);
  }
  const blockCount = uf2.length / 512;
  const blocks = new Array(blockCount);
  let family;
  for (let offset = 0; offset < uf2.length; offset += 512) {
    const block = uf2.subarray(offset, offset + 512);
    assertEqual(block.readUInt32LE(0), 0x0a324655, "UF2 magic 0");
    assertEqual(block.readUInt32LE(4), 0x9e5d5157, "UF2 magic 1");
    assertEqual(block.readUInt32LE(508), 0x0ab16f30, "UF2 end magic");
    const flags = block.readUInt32LE(8);
    if ((flags & 0x2000) === 0) {
      throw new Error(`${uf2Path} lacks the UF2 family-ID flag`);
    }
    const target = block.readUInt32LE(12);
    const payloadBytes = block.readUInt32LE(16);
    const blockNumber = block.readUInt32LE(20);
    const declaredBlocks = block.readUInt32LE(24);
    const blockFamily = block.readUInt32LE(28);
    assertEqual(declaredBlocks, blockCount, "UF2 declared block count");
    assertEqual(blockFamily, EXPECTED_UF2_FAMILY[side], "UF2 family");
    if (
      payloadBytes === 0 ||
      payloadBytes > 476 ||
      target < CODE_PARTITION_START ||
      target + payloadBytes > CODE_PARTITION_END ||
      blockNumber >= blockCount ||
      blocks[blockNumber]
    ) {
      throw new Error(`${uf2Path} has an invalid UF2 block`);
    }
    family ??= blockFamily;
    blocks[blockNumber] = {
      target,
      payload: Buffer.from(block.subarray(32, 32 + payloadBytes)),
    };
  }
  assertEqual(family, EXPECTED_UF2_FAMILY[side], "UF2 family identity");
  let expectedAddress = CODE_PARTITION_START;
  const payloads = [];
  for (const block of blocks) {
    if (!block) throw new Error(`${uf2Path} has a missing UF2 block`);
    assertEqual(block.target, expectedAddress, "UF2 contiguous target");
    expectedAddress += block.payload.length;
    payloads.push(block.payload);
  }
  const reconstructed = Buffer.concat(payloads);
  if (!reconstructed.subarray(0, binary.length).equals(binary)) {
    throw new Error(`${uf2Path} payload does not match ${binPath}`);
  }
  if (reconstructed.subarray(binary.length).some((byte) => byte !== 0)) {
    throw new Error(`${uf2Path} has nonzero bytes beyond ${binPath}`);
  }
}
