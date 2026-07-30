/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

const styleSource = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

const textPairs = [
  ["--text", "--bg"],
  ["--text", "--surface-1"],
  ["--text-muted", "--surface-1"],
  ["--text-muted", "--surface-2"],
  ["--text-faint", "--surface-1"],
  ["--accent-ink", "--accent"],
  ["--danger", "--surface-1"],
] as const;

describe.each(["light", "dark"] as const)("%s theme contrast", (theme) => {
  it.each(textPairs)("%s remains legible on %s", (foreground, background) => {
    const tokens = themeTokens(theme);
    const foregroundColor = tokens.get(foreground) ?? "";
    const backgroundColor = tokens.get(background) ?? "";

    expect(foregroundColor, `${foreground} must resolve`).not.toBe("");
    expect(backgroundColor, `${background} must resolve`).not.toBe("");
    expect(wcagContrast(foregroundColor, backgroundColor)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});

function themeTokens(theme: "light" | "dark"): Map<string, string> {
  const selector =
    theme === "light" ? String.raw`:root\s*` : String.raw`:root\[data-theme="dark"\]\s*`;
  const block = styleSource.match(
    new RegExp(`${selector}\\{([\\s\\S]*?)\\n\\}`),
  )?.[1];
  expect(block, `${theme} token block must exist`).toBeDefined();

  const tokens = new Map<string, string>();
  for (const match of block?.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g) ?? []) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}
