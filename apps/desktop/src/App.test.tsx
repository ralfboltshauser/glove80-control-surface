import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
    delete window.glove80DesktopLifecycle;
  });

  it("creates one durable ordered task board across both halves", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByRole("button", { name: "Create task board" }),
    ).toBeDisabled();
    expect(document.querySelectorAll("[data-cell-id]")).toHaveLength(80);

    await user.click(
      screen.getByRole("button", { name: /LH C6R1, not in draft region/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /RH C2R1, not in draft region/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Create task board" }),
    );

    expect(
      await screen.findByText(
        "Codex task board saved. New tasks now fill these keys automatically.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview controls" }),
    ).toBeEnabled();
    expect(screen.getByText("Both halves synchronized")).toBeInTheDocument();
    expect(screen.queryByText(/select a chat/i)).not.toBeInTheDocument();
  });

  it("supports keyboard-only ordered selection across both halves", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Create task board" });

    const leftKey = screen.getByRole("button", {
      name: /LH C6R1, not in draft region/i,
    });
    leftKey.focus();
    await user.keyboard("{Enter}{End}{Enter}");

    const editor = screen.getByLabelText("Task board region editor");
    expect(
      within(editor).getByRole("button", { name: /1\s*LH C6R1/i }),
    ).toBeInTheDocument();
    expect(
      within(editor).getByRole("button", { name: /2\s*RH T6/i }),
    ).toBeInTheDocument();

    await user.keyboard("{Home}");
    expect(leftKey).toHaveFocus();
  });

  it("moves spatial focus across the split between keyboard halves", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "Create task board" });
    const innerLeftKey = screen.getByRole("button", {
      name: /LH C1R2, not in draft region/i,
    });
    innerLeftKey.focus();

    await userEvent.setup().keyboard("{ArrowRight}");

    expect(
      screen.getByRole("button", {
        name: /RH C6R2, not in draft region/i,
      }),
    ).toHaveFocus();
  });

  it("preserves an unsaved region when its sidebar assignment is reselected", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Create task board" });
    await user.click(
      screen.getByRole("button", { name: /LH C6R1, not in draft region/i }),
    );

    await user.click(
      screen.getByRole("button", { name: /Codex task board/i }),
    );

    expect(
      screen.getByRole("button", { name: /LH C6R1, draft slot 1/i }),
    ).toBePressed();
    expect(screen.getByText("1/80")).toBeInTheDocument();
  });

  it("reports dirty drafts to Electron and saves when native close requests it", async () => {
    const setDraftDirty = vi.fn();
    let saveRequested: (() => void) | undefined;
    window.glove80DesktopLifecycle = {
      setDraftDirty,
      onSaveDraftRequested: (listener) => {
        saveRequested = listener;
        return () => undefined;
      },
    };
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Create task board" });
    await user.click(
      screen.getByRole("button", { name: /LH C6R1, not in draft region/i }),
    );
    await waitFor(() => expect(setDraftDirty).toHaveBeenLastCalledWith(true));

    await act(async () => saveRequested?.());

    expect(await screen.findByText(/Codex task board saved/i)).toBeInTheDocument();
    await waitFor(() => expect(setDraftDirty).toHaveBeenLastCalledWith(false));
  });

  it("restores configuration without persisting task identities", async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await screen.findByRole("button", { name: "Create task board" });
    await user.click(
      screen.getByRole("button", { name: /LH C6R1, not in draft region/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Create task board" }),
    );
    await screen.findByText(/Codex task board saved/i);

    const persisted = window.localStorage.getItem(
      "glove80-control-surface.simulation.configuration.v1",
    );
    expect(persisted).toContain('"cells":[0]');
    expect(persisted).not.toMatch(/task-[0-9]|resourceId|thread/i);

    first.unmount();
    render(<App />);
    expect(
      await screen.findByRole("button", { name: "Preview controls" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /LH C6R1, task board slot 1/i }),
    ).toBeInTheDocument();
  });

  it("keeps represented tasks stable through high churn", async () => {
    window.history.replaceState({}, "", "/?demo=1");
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Preview controls" });
    const firstCell = screen.getByRole("button", {
      name: /LH C6R1, task board slot 1/i,
    });
    const identityBefore = firstCell.getAttribute("aria-label");

    await user.click(screen.getByRole("button", { name: "Task burst" }));

    expect(
      await screen.findByText(/Five tasks arrived together/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /LH C6R1, task board slot 1/i,
      }),
    ).toHaveAttribute("aria-label", identityBefore);
    expect(screen.getByText(/11 changing simulated tasks/i)).toBeInTheDocument();
  });

  it("keeps simulator controls and labeled assignments reachable in compact mode", async () => {
    const previousMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: true,
        media: "(max-width: 67.5rem)",
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
      }),
    });
    window.history.replaceState({}, "", "/?demo=1");
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByRole("button", {
        name: /Codex task board, 12 keys, 6 occupied/i,
      }),
    ).toBeInTheDocument();
    const simulatorSummary = screen.getByLabelText(
      "Test simulator behavior",
    );
    await user.click(simulatorSummary);
    expect(
      screen.getByRole("button", { name: "Task burst" }),
    ).toBeVisible();

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: previousMatchMedia,
    });
  });

  it("freezes allocation while the control-layer preview is active", async () => {
    window.history.replaceState({}, "", "/?demo=1");
    const user = userEvent.setup();
    render(<App />);
    const launcher = await screen.findByRole("button", {
      name: "Preview controls",
    });
    const firstCell = screen
      .getByRole("button", {
        name: /LH C6R1, task board slot 1/i,
      });
    const identityBefore = firstCell.getAttribute("aria-label");
    await user.click(launcher);
    const preview = await screen.findByRole("dialog", {
      name: "Control layer preview",
    });
    expect(preview).toBeInTheDocument();
    expect(
      within(preview).getByRole("button", { name: /^Slot 1,/ }),
    ).toHaveFocus();

    await user.click(
      screen.getByRole("button", { name: "Inject task burst" }),
    );
    expect(firstCell).toHaveAttribute("aria-label", identityBefore);

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Control layer preview"),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(launcher).toHaveFocus());
  });

  it("closes the preview when the authoritative backend cancels interaction", async () => {
    window.history.replaceState({}, "", "/?demo=1");
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "Preview controls" }),
    );
    await screen.findByRole("dialog", {
      name: "Control layer preview",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Pause", hidden: true }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Control layer preview",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Preview controls" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("offers an explicit simulator-only task action instead of a dead Codex control", async () => {
    window.history.replaceState({}, "", "/?demo=1");
    const user = userEvent.setup();
    render(<App />);
    const opener = await screen.findByRole("button", {
      name: "Simulate open action",
    });
    await user.click(opener);

    const preview = await screen.findByLabelText("Control layer preview");
    expect(
      await within(preview).findByText(/Simulation would open/i),
    ).toBeInTheDocument();
    expect(
      within(preview).getByText(/does not launch Codex/i),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("keeps labeled occupied actions visible across an 80-slot preview", async () => {
    window.localStorage.setItem(
      "glove80-control-surface.simulation.configuration.v1",
      JSON.stringify({
        schemaVersion: 1,
        preferences: { brightness: 48, reduceMotion: false },
        taskBoard: {
          bindingId: "codex-task-board",
          cells: Array.from({ length: 80 }, (_, index) => index),
          workspaceRoots: [],
        },
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "Preview controls" }),
    );

    const preview = await screen.findByLabelText("Control layer preview");
    expect(preview).toHaveAttribute("data-density", "adaptive");
    expect(
      within(preview).getByText("6/80 occupied · allocation frozen"),
    ).toBeInTheDocument();
    expect(
      preview.querySelectorAll("button[aria-label^='Slot ']"),
    ).toHaveLength(80);
    expect(
      within(preview).getByText("Glove80 control surface"),
    ).toBeVisible();
    expect(within(preview).getByText("Needs input")).toBeVisible();
    expect(
      within(preview).getByText("74 waiting positions"),
    ).toBeVisible();
    expect(
      within(preview).getByText(/does not launch Codex or write/i),
    ).toBeInTheDocument();
    expect((await runAxe(preview)).violations).toEqual([]);
  });

  it("fits from measured viewport size without shrinking 44-pixel keys", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "Create task board" });
    const viewport = document.querySelector<HTMLElement>(".keyboard-viewport");
    expect(viewport).not.toBeNull();
    Object.defineProperty(viewport, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        width: 900,
        height: 520,
        x: 0,
        y: 0,
        top: 0,
        right: 900,
        bottom: 520,
        left: 0,
        toJSON: () => ({}),
      }),
    });

    await userEvent.setup().click(
      screen.getByRole("button", { name: "Fit keyboard to viewport" }),
    );
    expect(screen.getByText("125%")).toBeInTheDocument();

    Object.defineProperty(viewport, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        width: 400,
        height: 300,
        x: 0,
        y: 0,
        top: 0,
        right: 400,
        bottom: 300,
        left: 0,
        toJSON: () => ({}),
      }),
    });
    window.dispatchEvent(new Event("resize"));
    expect(await screen.findByText("100%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  });

  it("reports desired/applied divergence and supports spatial roving focus", async () => {
    window.history.replaceState({}, "", "/?demo=1");
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Both halves synchronized");

    const first = screen.getByRole("button", {
      name: /LH C6R1, task board slot 1/i,
    });
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("button", {
        name: /LH C5R1, task board slot 2/i,
      }),
    ).toHaveFocus();
    expect(document.querySelectorAll(".key-cell[tabindex='0']")).toHaveLength(1);

    await user.click(
      screen.getByRole("button", { name: "Lose right half" }),
    );
    expect(
      await screen.findByText("Partially synchronized"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Simulation · desired and applied differ"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Right half disconnected. Left-half state remains available."),
    ).toBeInTheDocument();
  });

  it("meets the automated accessibility floor in the configured editor", async () => {
    window.history.replaceState({}, "", "/?demo=1");
    render(<App />);
    await screen.findByText("Both halves synchronized");

    const results = await runAxe(document.body);
    expect(results.violations).toEqual([]);
  });

  it("meets the accessibility floor during creation and appearance editing", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Create task board" });
    expect((await runAxe(document.body)).violations).toEqual([]);

    await user.click(
      screen.getByRole("button", { name: "Appearance settings" }),
    );
    await screen.findByRole("complementary", {
      name: "Appearance settings",
    });
    expect((await runAxe(document.body)).violations).toEqual([]);
  });
});

function runAxe(root: Element) {
  return axe.run(root, {
    rules: {
      // JSDOM has no OKLCH parser. The separate theme-token suite checks
      // every foreground/surface pair in both themes with WCAG math.
      "color-contrast": { enabled: false },
    },
  });
}
