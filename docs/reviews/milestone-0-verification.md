# Milestone 0 verification

Date: 2026-07-30

## Scope

This closes the blocking findings from the architecture, domain, platform, and
visual reviews. It does not claim a live simulator, Codex connection, HID
transport, or 80-cell firmware.

## Direct evidence

- `CellId` validates both construction and deserialization. JSON values `80`
  and `256` are rejected by tests.
- Allocation candidates use the documented `normal` or `protected` retention
  vocabulary. Runtime resource identities remain absent from serialized
  bindings.
- The React shell labels itself **Static preview** and says that no Codex or
  keyboard connection exists. Unimplemented settings, diagnostics, editing,
  zoom, and Codex-open controls are disabled with explanatory titles.
- The physical drawing is explicitly labeled **Approximate Glove80 preview**.
- All six semantic sample states have a text symbol in addition to color.
- The 80 key buttons use roving focus. Browser verification moved focus and
  selection from cell 0 to cell 1 with Arrow Right and found exactly one key
  with `tabindex="0"`.
- Autonomous working and attention pulses change opacity only. Reduced motion
  disables both loops, while state symbols and colors remain.
- Hover styling is gated to fine pointers.
- At 1280×800, the assignments, surface, and inspector are visible.
- At 960×700, the inspector is intentionally hidden, the full surface remains
  visible, `documentElement.scrollWidth` equals `960`, and the keyboard canvas
  remains within the workspace.
- Light, dark, and compact screenshots are stored in `docs/screenshots`.
- The native macOS Tauri build succeeds with `--debug --no-bundle`.

## Commands passed locally

```text
pnpm check
pnpm build
cargo fmt --all -- --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
pnpm --filter @glove80-control-surface/desktop tauri build --debug --no-bundle
git diff --check
```

## Remaining gate

Milestone 0 is complete only after the public CI matrix performs the native
Tauri build on macOS, Windows, and Linux successfully. Milestone 1 owns the
stateful simulator, validated topology, persistent editing, and desired/applied
state.
