import layoutDocument from "../../../../firmware/input/ralf-custom-swiss-v8.json";
import topologyDocument from "../../../../firmware/topology/glove80-rgb-80-v1.json";

export interface KeyGeometry {
  id: number;
  half: "left" | "right";
  position: string;
  shortPosition: string;
  legend: string;
  x: number;
  y: number;
  rotation?: number;
}

interface LayoutBinding {
  value?: string;
  params?: LayoutParameter[];
}

interface LayoutParameter {
  value?: string;
  params?: LayoutParameter[];
}

const columnX = [16, 61, 106, 151, 196, 241];
const columnLift = [15, 7, 0, -4, 2, 12];
const rowY = [20, 66, 112, 158, 204, 250];
const cellLegends = readBaseLayerLegends();

export const layoutName =
  typeof layoutDocument.title === "string"
    ? layoutDocument.title
    : "Current Base layer";

function mirrorX(x: number): number {
  // Mirror the complete 44px key box inside the 296px half:
  // mirroredLeft = halfWidth - originalLeft - keyWidth.
  return 296 - x - 44;
}

function createWell(
  half: "left" | "right",
  idOffset: number,
): KeyGeometry[] {
  const keys: KeyGeometry[] = [];
  let localId = 0;
  for (let row = 1; row <= 6; row += 1) {
    const columns =
      row === 1 || row === 6
        ? half === "left"
          ? [6, 5, 4, 3, 2]
          : [2, 3, 4, 5, 6]
        : half === "left"
          ? [6, 5, 4, 3, 2, 1]
          : [1, 2, 3, 4, 5, 6];
    columns.forEach((column, visualIndex) => {
      const leftColumnIndex =
        half === "left" ? 6 - column : column - 1;
      const x = columnX[leftColumnIndex];
      keys.push({
        id: idOffset + localId,
        half,
        position: `${half === "left" ? "LH" : "RH"} C${column}R${row}`,
        shortPosition: `C${column}R${row}`,
        legend: cellLegends[idOffset + localId] ?? "?",
        x: half === "left" ? x : mirrorX(x),
        y: rowY[row - 1] + columnLift[leftColumnIndex],
      });
      localId += 1;
    });
  }
  return keys;
}

function createThumbs(
  half: "left" | "right",
  idOffset: number,
): KeyGeometry[] {
  const positions = [
    { x: 156, y: 267, rotation: -8 },
    { x: 199, y: 276, rotation: -5 },
    { x: 242, y: 282, rotation: -2 },
    { x: 150, y: 310, rotation: -9 },
    { x: 193, y: 319, rotation: -5 },
    { x: 236, y: 325, rotation: -2 },
  ];
  return positions.map((position, index) => {
    const thumb = index + 1;
    return {
      id: idOffset + 34 + index,
      half,
      position: `${half === "left" ? "LH" : "RH"} T${thumb}`,
      shortPosition: `T${thumb}`,
      legend: cellLegends[idOffset + 34 + index] ?? "?",
      x: half === "left" ? position.x : mirrorX(position.x),
      y: position.y,
      rotation:
        half === "left" ? position.rotation : -position.rotation,
    };
  });
}

function createHalf(
  half: "left" | "right",
  idOffset: number,
): KeyGeometry[] {
  return [
    ...createWell(half, idOffset),
    ...createThumbs(half, idOffset),
  ];
}

export const keyboardGeometry = {
  left: createHalf("left", 0),
  right: createHalf("right", 40),
};

export const allKeys = [
  ...keyboardGeometry.left,
  ...keyboardGeometry.right,
];

export const keyById = new Map(allKeys.map((key) => [key.id, key]));

export function keyName(cellId: number): string {
  return keyById.get(cellId)?.position ?? `Cell ${cellId}`;
}

export function keyLegend(cellId: number): string {
  return keyById.get(cellId)?.legend ?? "?";
}

function readBaseLayerLegends(): string[] {
  const layers = layoutDocument.layers as unknown;
  const positionToCell = topologyDocument.zmkPositionToCell as unknown;
  if (
    !Array.isArray(layers) ||
    !Array.isArray(layers[0]) ||
    !Array.isArray(positionToCell) ||
    positionToCell.length !== 80
  ) {
    return Array.from({ length: 80 }, (_, cell) => String(cell));
  }

  const legends = Array.from({ length: 80 }, (_, cell) => String(cell));
  (layers[0] as LayoutBinding[]).slice(0, 80).forEach((binding, position) => {
    const cell = positionToCell[position];
    if (Number.isInteger(cell) && cell >= 0 && cell < 80) {
      legends[cell] = bindingLegend(binding);
    }
  });
  return legends;
}

function bindingLegend(binding: LayoutBinding): string {
  const behavior = binding.value ?? "";
  const parameters = binding.params ?? [];
  if (behavior === "&none") return "—";
  if (behavior === "&magic") return "Magic";
  if (behavior === "&lower") return "Lower";
  if (behavior === "&mt") {
    const parameter = parameters.at(-1);
    return parameter ? parameterLegend(parameter) : "Mod";
  }
  if (behavior === "&kp") {
    return parameters[0] ? parameterLegend(parameters[0]) : "—";
  }
  return behavior.replace(/^&/, "") || "—";
}

function parameterLegend(parameter: LayoutParameter): string {
  const value = parameter.value ?? "";
  const nested = parameter.params?.[0];
  if (value === "LS" && nested) return `⇧${parameterLegend(nested)}`;
  if (value === "LG" && nested) return `⌘${parameterLegend(nested)}`;
  if (value === "LA" && nested) return `⌥${parameterLegend(nested)}`;
  return keycodeLegend(value);
}

function keycodeLegend(keycode: string): string {
  const shifted = /^LS\((.+)\)$/.exec(keycode);
  if (shifted) return `⇧${keycodeLegend(shifted[1])}`;
  if (/^N[0-9]$/.test(keycode)) return keycode.slice(1);
  const simple: Record<string, string> = {
    TAB: "Tab",
    ESC: "Esc",
    GRAVE: "`",
    EQUAL: "=",
    MINUS: "−",
    SEMI: ";",
    SQT: "'",
    COMMA: ",",
    DOT: ".",
    FSLH: "/",
    LSHFT: "Shift",
    RSHFT: "Shift",
    LGUI: "⌘",
    RGUI: "⌘",
    LCTRL: "Ctrl",
    RCTRL: "Ctrl",
    LALT: "⌥",
    RALT: "⌥",
    BSPC: "⌫",
    RET: "↵",
    SPACE: "Space",
    KP_DOT: ".",
    KP_N0: "0",
    LBKT: "[",
  };
  return simple[keycode] ?? keycode.replace(/^KP_/, "");
}
