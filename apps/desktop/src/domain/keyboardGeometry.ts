export interface KeyGeometry {
  id: number;
  half: "left" | "right";
  x: number;
  y: number;
  label: string;
}

const legends = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "Q",
  "W",
  "E",
  "R",
  "T",
  "Y",
  "A",
  "S",
  "D",
  "F",
  "G",
  "H",
  "Z",
  "X",
  "C",
  "V",
  "B",
  "N",
  "⌘",
  "⌥",
  "⌃",
  "⇧",
  "Space",
  "Return",
  "F1",
  "F2",
  "F3",
  "F4",
  "⌫",
  "Tab",
  "Esc",
  "Magic",
  "Layer",
  "Fn",
];

const stagger = [8, 4, 0, 2, 5, 9];

function createHalf(half: "left" | "right", idOffset: number): KeyGeometry[] {
  const keys: KeyGeometry[] = [];

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const localId = row * 6 + column;
      const x = 26 + column * 47;
      keys.push({
        id: idOffset + localId,
        half,
        x: half === "left" ? x : 328 - x,
        y: 50 + row * 41 + stagger[column],
        label: legends[localId],
      });
    }
  }

  for (let index = 0; index < 4; index += 1) {
    const localId = 30 + index;
    const x = 73 + index * 47;
    keys.push({
      id: idOffset + localId,
      half,
      x: half === "left" ? x : 328 - x,
      y: 7 + stagger[index + 1],
      label: legends[localId],
    });
  }

  const thumbPositions = [
    [50, 270],
    [98, 280],
    [146, 287],
    [194, 287],
    [242, 280],
    [290, 270],
  ];

  thumbPositions.forEach(([leftX, y], index) => {
    const localId = 34 + index;
    keys.push({
      id: idOffset + localId,
      half,
      x: half === "left" ? leftX : 328 - leftX,
      y,
      label: legends[localId],
    });
  });

  return keys;
}

export const keyboardGeometry = {
  left: createHalf("left", 0),
  right: createHalf("right", 40),
};
