import { describe, expect, it } from "vitest";

import {
  allKeys,
  keyLegend,
  layoutName,
} from "./keyboardGeometry";

describe("keyboard Base-layer legends", () => {
  it("maps all 80 ZMK positions into the physical cell catalog", () => {
    expect(allKeys).toHaveLength(80);
    expect(allKeys.every((key) => key.legend.length > 0)).toBe(true);
    expect(new Set(allKeys.map((key) => key.id)).size).toBe(80);
  });

  it("uses the exact firmware layout and topology mapping", () => {
    expect(layoutName).toBe("Ralf Custom Swiss v8");
    expect(keyLegend(0)).toBe("F1");
    expect(keyLegend(6)).toBe("1");
    expect(keyLegend(29)).toBe("Magic");
    expect(keyLegend(30)).toBe("⇧2");
    expect(keyLegend(40)).toBe("F6");
  });
});
