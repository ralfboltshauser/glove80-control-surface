import { describe, expect, it } from "vitest";

import { keyboardGeometry } from "./keyboardGeometry";

const halfWidth = 296;
const halfHeight = 376;
const keySize = 44;

describe("Glove80 geometry catalog", () => {
  it("contains exactly 40 in-bounds keys on each physical half", () => {
    for (const half of ["left", "right"] as const) {
      expect(keyboardGeometry[half]).toHaveLength(40);
      for (const key of keyboardGeometry[half]) {
        expect(key.x, `${key.position} starts outside its half`).toBeGreaterThanOrEqual(0);
        expect(
          key.x + keySize,
          `${key.position} extends beyond its half`,
        ).toBeLessThanOrEqual(halfWidth);
        expect(key.y, `${key.position} starts above its half`).toBeGreaterThanOrEqual(0);
        expect(
          key.y + keySize,
          `${key.position} extends below its half`,
        ).toBeLessThanOrEqual(halfHeight);
      }
    }
  });

  it("mirrors corresponding physical columns to opposite edges", () => {
    const leftC1R2 = keyboardGeometry.left.find(
      (key) => key.shortPosition === "C1R2",
    );
    const rightC6R2 = keyboardGeometry.right.find(
      (key) => key.shortPosition === "C6R2",
    );
    expect(leftC1R2).toBeDefined();
    expect(rightC6R2).toBeDefined();
    expect(leftC1R2!.x + rightC6R2!.x + keySize).toBe(halfWidth);
  });
});
