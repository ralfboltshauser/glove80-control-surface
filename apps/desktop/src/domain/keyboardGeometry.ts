export interface KeyGeometry {
  id: number;
  half: "left" | "right";
  position: string;
  shortPosition: string;
  x: number;
  y: number;
  rotation?: number;
}

const columnX = [16, 61, 106, 151, 196, 241];
const columnLift = [15, 7, 0, -4, 2, 12];
const rowY = [20, 66, 112, 158, 204, 250];

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
