# Milestone 1 verification

Date: 2026-07-30

## Scope

Milestone 1 proves the complete simulated product loop in one Electron,
React, and TypeScript application. It does not connect to Codex, enumerate or
write to a keyboard during normal startup, or claim that 80-cell firmware is
installed.

## Outcome

Architecture, Electron reliability, and UX/accessibility adversarial reviews
all passed with no remaining blocking finding.

Review findings changed the implementation in four useful ways:

- browser and Electron execution now share one canonical `control-core`
  runtime instead of parallel domain implementations;
- configuration changes commit to durable storage before in-memory state
  changes, while corrupt files are quarantined and arbitrary I/O errors remain
  visible;
- native close authorization is scoped to one attempt, stale Save intents
  cannot survive Cancel, and macOS window reactivation is regression-tested;
- the packaged smoke test calls `getHidapiVersion()` so it proves that
  `HID.node` loads rather than merely importing the JavaScript wrapper.

The reviewers found the current boundaries proportionate: one Electron
application, two small pure TypeScript packages, a sandboxed renderer, a
narrow preload bridge, and no daemon, worker, dependency-injection framework,
generic plugin loader, or local RPC layer.

## Direct evidence

- The simulator exposes 80 cells across both halves and exercises complete,
  partial, disconnected, expired, and recovered device state.
- One durable ordered region receives a changing fake Codex task collection;
  runtime task identities are not serialized as binding configuration.
- Editing supports ordered cross-half selection, removal, reordering, Undo,
  Save, and Cancel.
- Interaction preview freezes the allocation epoch, distinguishes empty slots,
  and reports action feedback inside the HUD and in the persistent status
  strip.
- Color is redundant with text and state symbols. Spatial keyboard navigation,
  focus containment/restoration, contrast, and reduced motion are covered by
  tests.
- Renderer navigation, window creation, IPC senders, and IPC payloads are
  constrained. The renderer has no Node.js, HID, arbitrary shell, or
  unrestricted filesystem access.
- Startup configuration read failure shows a native error and exits without
  enabling writes.
- A packaged macOS build loaded HIDAPI `0.15.0` without enumerating or writing
  to hardware.
- A same-process native macOS test performed dirty draft → Discard → close →
  Dock-style reactivation → dirty draft → close and observed the native
  Save/Discard/Cancel prompt again.

## Commands passed locally

```text
pnpm check
pnpm build
pnpm --filter @glove80-control-surface/desktop package:dir
pnpm --filter @glove80-control-surface/desktop smoke:packaged
codesign --verify --deep --strict --verbose=2 \
  "apps/desktop/release/mac-arm64/Glove80 Control Surface.app"
git diff --check
```

The check suite contains 86 passing tests:

- `surface-protocol`: 9
- `control-core`: 15
- desktop renderer, runtime, persistence, Electron lifecycle, theme, and
  accessibility: 62

## Visual evidence

- `electron-native-dark.png`: packaged macOS application
- `compact-dark-960x640.jpg` and `compact-light-960x640.jpg`
- `large-dark-1440x900.jpg` and `large-light-1440x900.jpg`
- `region-editor-dark-1280x760.jpg`
- `hud-dark-1280x760.jpg`

All files are under `docs/screenshots/milestone-1`.

## Remaining boundary

Milestone 2 replaces only the fake task source with a supervised, capability-
detected Codex app-server adapter. Milestone 3 replaces only the simulated
surface adapter with the existing six-cell HID capability. No firmware flash
or live LED write is authorized by this milestone.
