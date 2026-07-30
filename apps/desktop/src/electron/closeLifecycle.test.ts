import { describe, expect, it } from "vitest";

import { CloseLifecycle } from "./closeLifecycle";

describe("CloseLifecycle", () => {
  it("requires confirmation again after an authorized window closes and reopens", () => {
    const lifecycle = new CloseLifecycle();
    lifecycle.setDraftDirty(true);
    expect(lifecycle.shouldPrompt("window")).toBe(true);

    lifecycle.beginPrompt();
    expect(lifecycle.resolvePrompt("window", "discard")).toBe("window");
    lifecycle.authorize("window");
    expect(lifecycle.shouldPrompt("window")).toBe(false);

    lifecycle.resetWindow();
    lifecycle.setDraftDirty(true);
    expect(lifecycle.shouldPrompt("window")).toBe(true);
  });

  it("does not complete an old Save-close after a later Cancel", () => {
    const lifecycle = new CloseLifecycle();
    lifecycle.setDraftDirty(true);
    lifecycle.beginPrompt();
    expect(lifecycle.resolvePrompt("window", "save")).toBeUndefined();

    lifecycle.beginPrompt();
    expect(lifecycle.resolvePrompt("window", "cancel")).toBeUndefined();
    expect(lifecycle.setDraftDirty(false)).toBeUndefined();
  });

  it("completes the current close intent only after Save makes the draft clean", () => {
    const lifecycle = new CloseLifecycle();
    lifecycle.setDraftDirty(true);
    lifecycle.beginPrompt();
    lifecycle.resolvePrompt("quit", "save");

    expect(lifecycle.setDraftDirty(false)).toBe("quit");
  });
});
