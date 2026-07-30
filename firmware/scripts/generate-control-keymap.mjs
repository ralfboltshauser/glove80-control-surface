#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_INPUT_SHA256 =
  "732b79ad73a3b93d74c5fc6d3002411a4dfd7e4338149b77922bad7105479410";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const topologyPath = resolve(
  scriptDirectory,
  "../topology/glove80-rgb-80-v1.json",
);

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error(
    "usage: generate-control-keymap.mjs <Ralf-v8.keymap> <derived.keymap>",
  );
}

const input = await readFile(inputPath, "utf8");
const inputHash = createHash("sha256").update(input).digest("hex");
if (inputHash !== EXPECTED_INPUT_SHA256) {
  throw new Error(
    `refusing unexpected keymap ${inputHash}; expected ${EXPECTED_INPUT_SHA256}`,
  );
}

const topology = JSON.parse(await readFile(topologyPath, "utf8"));
const positionToCell = topology.zmkPositionToCell;
if (
  !Array.isArray(positionToCell) ||
  positionToCell.length !== 80 ||
  [...positionToCell].sort((a, b) => a - b).some((value, index) => value !== index)
) {
  throw new Error("zmkPositionToCell must be a permutation of 0..79");
}
if (
  !Array.isArray(topology.interactionToggleChordPositions) ||
  !Array.isArray(topology.interactionToggleChordCells) ||
  topology.interactionToggleChordPositions.length !== 2 ||
  topology.interactionToggleChordPositions.some(
    (position, index) =>
      positionToCell[position] !== topology.interactionToggleChordCells[index],
  )
) {
  throw new Error("interaction toggle chord positions/cells do not agree");
}

const originalMagicBinding = "&magic LAYER_Magic 0";
const originalMagicCount = input.split(originalMagicBinding).length - 1;
if (originalMagicCount !== 2) {
  throw new Error(`expected exactly two Magic bindings, found ${originalMagicCount}`);
}
let derived = input.replace(
  "#define LAYER_Factory 3",
  "#define LAYER_Factory 3\n#define LAYER_Control 4",
);
if (derived === input) {
  throw new Error("Factory layer definition not found");
}

const keymapStart = derived.indexOf("keymap {");
if (keymapStart < 0) throw new Error("keymap node not found");
const openBrace = derived.indexOf("{", keymapStart);
let depth = 0;
let keymapClose = -1;
for (let index = openBrace; index < derived.length; index += 1) {
  if (derived[index] === "{") depth += 1;
  if (derived[index] === "}") {
    depth -= 1;
    if (depth === 0) {
      keymapClose = index;
      break;
    }
  }
}
if (keymapClose < 0) throw new Error("keymap node is not balanced");

const bindings = positionToCell
  .map((_cell, index) => `${index % 10 === 0 ? "\n                " : " "}&surface_key ${index}`)
  .join("");
const controlLayer = `

        layer_Control {
            display-name = "Control";
            bindings = <${bindings}
            >;
        };
`;
derived = `${derived.slice(0, keymapClose)}${controlLayer}${derived.slice(keymapClose)}`;

const behaviors = `

/* Generated leased control-surface behaviors. */
/ {
    behaviors {
        surface_toggle: surface_toggle {
            compatible = "zmk,behavior-control-surface-toggle";
            #binding-cells = <0>;
        };

        surface_key: surface_key {
            compatible = "zmk,behavior-control-surface-key";
            #binding-cells = <1>;
        };
    };

    combos {
        compatible = "zmk,combos";
        surface_toggle_chord {
            timeout-ms = <75>;
            require-prior-idle-ms = <100>;
            key-positions = <${topology.interactionToggleChordPositions.join(" ")}>;
            bindings = <&surface_toggle>;
        };
    };
};
`;
derived += behaviors;

if (derived.split(originalMagicBinding).length - 1 !== 2) {
  throw new Error("derived keymap must preserve both Magic layer bindings");
}
if (derived.split("&surface_key ").length - 1 !== 80) {
  throw new Error("derived Control layer does not contain 80 keys");
}

await writeFile(outputPath, derived, "utf8");
const outputHash = createHash("sha256").update(derived).digest("hex");
process.stdout.write(
  JSON.stringify(
    {
      inputSha256: inputHash,
      outputSha256: outputHash,
      originalLayers: 4,
      generatedLayers: 1,
      controlBindings: 80,
      preservedMagicBindings: 2,
      toggleChordPositions: topology.interactionToggleChordPositions,
      toggleChordCells: topology.interactionToggleChordCells,
      eventIdentity: "zmk-position",
    },
    null,
    2,
  ) + "\n",
);
