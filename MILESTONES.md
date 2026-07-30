# Delivery milestones

This is the executable delivery plan. A milestone is complete only when its
acceptance checks pass and its adversarial review has no unresolved blocking
finding. A checklist is evidence, not a promise: update it whenever observed
hardware, Codex, or platform behavior changes an assumption.

## Product invariants

- Normal typing must survive application crashes, disconnects, lease expiry,
  sleep, and firmware incompatibility.
- A user configures one durable **Codex task board**, not individual short-lived
  chats. Codex thread IDs exist only in runtime allocation state.
- A task keeps its physical slot while it matters. Status changes must not
  continuously reorder keys.
- Firmware understands cells, scenes, effects, sessions, and input events. It
  never understands Codex, Calendar, URLs, credentials, or arbitrary commands.
- The application never flashes firmware, changes Bluetooth pairings, or
  modifies the user's typing layout during normal operation.
- USB is the first real transport. Both 40-key RGB halves are the supported
  product target; the existing six-cell implementation is a compatibility
  fixture, not the architecture.
- Codex ships before Calendar. Calendar is included only if a small,
  trustworthy implementation survives its evidence gate.

## Milestone 0 — evidence, architecture, and workspace

Status: **complete**

Deliver:

- [x] Audit the connected Glove80 and recover the exact existing six-cell HID
      experiment without writing to the device.
- [x] Audit the installed Codex app-server CLI and generated protocol types.
- [x] Replace the per-chat binding model with one dynamic, sticky task board.
- [x] Adversarially compare Tauri, Electron, Slint, Flutter, Avalonia, and
      Wails against HID, child-process, updater, accessibility, and packaging
      requirements.
- [x] Record the desktop-stack decision and correct macOS-only/one-process
      assumptions throughout the documentation.
- [x] Initialize the pnpm monorepo and boot the first desktop shell.
- [x] Add cross-platform CI for TypeScript checks and Electron directory
      packages.
- [x] Run the milestone review and close every blocking finding.

Acceptance:

```text
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm package:dir
```

The Electron shell must boot on this Mac. CI must cover macOS, Windows, and
Linux without claiming untested platform-specific HUD or HID behavior.

Historical evidence: public CI run
[`30518198882`](https://github.com/ralfboltshauser/glove80-control-surface/actions/runs/30518198882)
passed the frontend job and native no-bundle Tauri builds on macOS 14, Ubuntu
22.04, and Windows for commit `e8178c4`. ADR 0007 later replaced that shell
after a packaged Electron/node-hid probe against the connected Glove80 removed
the native-module uncertainty. Current Electron CI evidence supersedes this
historical stack check.

## Milestone 1 — simulated product vertical slice

Status: **complete**

Deliver:

- [x] A pure `surface-protocol` TypeScript package with versioned capabilities, scenes,
      effects, leases, cell events, strict decoders, and golden vectors.
- [x] A pure `control-core` TypeScript package with semantic state, sticky slot allocation,
      scene composition, acknowledgements, and a single state transition API.
- [x] A deterministic 80-cell two-half simulator implementing the same device
      port as real HID.
- [x] A polished editor showing a complete simulated 80-cell position catalog
      (explicitly not to scale), ordered region selection, one-click Codex
      task-board assignment, inspector, connection status, desired/applied
      divergence, Undo, and persistence. Exact firmware topology remains an
      M4 hardware gate.
- [x] A fake high-churn Codex source proving that new chats enter the board
      without configuration changes.
- [x] A non-activating interaction HUD prototype and reduced-motion behavior.
- [x] Component, domain, and accessibility tests plus reviewed compact and
      large screenshots in light and dark modes.

Acceptance:

- Select any ordered subset across both halves and assign it once.
- Simulate task creation, working, input-needed, completion, failure,
  acknowledgement, overflow, stale data, and reconnect.
- Existing visible tasks keep their cells; every interaction freezes the full
  allocation until its epoch ends.
- Restart restores configuration but never persists transient thread IDs as
  binding configuration.
- Screenshots pass a visual review at compact and large desktop sizes.

Local verification passed 86 tests, the production build, the Electron
directory package, a packaged native-module smoke test that loaded HIDAPI
`0.15.0`, strict macOS code-signature validation, and a same-process native
close/reopen lifecycle test. Architecture, reliability, and UX adversarial
reviews all passed with no remaining blocker. See
[Milestone 1 verification](docs/reviews/milestone-1-verification.md).

## Milestone 2 — real Codex task board

Status: **complete**

Deliver:

- [x] A supervised stdio JSONL client for the user-installed
      `codex app-server`, owned by Electron main and unavailable to the
      renderer.
- [x] Executable discovery/configuration, initialization, capability
      detection, bounded queues, restart/backoff, and honest health states.
- [x] Dynamic task discovery using only fields exposed by the installed
      protocol: identity, title/preview, recency, cwd, parent/subagent
      relationship, turn terminal state, and runtime status where observable.
- [x] The Priority allocator source: actionable, working, completed/unread,
      then recent idle, with sticky protected slots and overflow.
- [x] Safe local task opening through the documented Codex deep link.
- [x] A deterministic fake app-server and recorded redacted fixtures.

Hard evidence gate:

The app must prove what a separately spawned app-server can observe about tasks
owned by Codex desktop. If live `active`/waiting state is unavailable across
processes, the UI and LED states must say so; no polling heuristic may be
presented as authoritative runtime status. Capability detection must tolerate
schema differences such as pin support being absent from an installed build.

Acceptance:

- A user connects Codex once and never selects a chat in Settings.
- New and changing tasks populate stable slots automatically.
- Killing, corrupting output from, or upgrading the child process cannot block
  the UI or a future keyboard lease.
- Opening a slot always targets the identity frozen when interaction began.

Local implementation evidence is recorded in
[Milestone 2 verification](docs/reviews/milestone-2-verification.md). The
adversarial reviews passed with no remaining blocker. Public CI run
[`30545697391`](https://github.com/ralfboltshauser/glove80-control-surface/actions/runs/30545697391)
passed TypeScript checks plus packaged Electron and native HID smoke tests on
macOS, Windows, and Linux.

## Milestone 3 — existing six-cell hardware path

Status: **not started**

Deliver:

- [ ] Import the proven report-4/report-5 protocol as a legacy capability
      adapter and golden fixture.
- [ ] A cross-platform HID transport boundary with fake transports for all
      error paths.
- [ ] USB discovery and safe matching by vendor/product/report capabilities,
      without assuming a serial is present.
- [ ] Lease, expiry, sequence, reconnect, coalescing, readback, desired/applied,
      and pause/clear behavior.
- [ ] Platform guidance for macOS permissions, Windows device access, and a
      narrowly matched Linux udev rule.

Acceptance:

- Every transport transition passes against the fake.
- On this Mac, read-only capability discovery identifies the currently flashed
  experimental firmware.
- Any live LED write is separately announced, bounded, reversible by expiry,
  and performed only after its scene is visible in the simulator.
- No firmware flash occurs in this milestone.

## Milestone 4 — generic 80-cell firmware and interaction

Status: **not started**

Deliver:

- [ ] A pinned, reproducible MoErgo/ZMK firmware extension derived from the
      existing experiment, not an unreviewed full fork.
- [ ] Atomic fragmented complete scenes for all 40 left cells.
- [ ] Versioned, coalesced split snapshots and acknowledgements for all 40
      right cells.
- [ ] Solid and pulse rendering with a measured per-half current budget.
      Blink is included only if accessibility and power tests justify it.
- [ ] A leased momentary interaction layer that emits generic cell down/up
      events and cannot strand normal typing.
- [ ] Exact topology mapping, compatibility manifest, hashes, build artifacts,
      and known-good recovery instructions.

Acceptance:

- Host/firmware golden vectors agree byte for byte.
- Fuzz and state-machine tests reject malformed, duplicated, stale, partial,
  and out-of-order data safely.
- Simulator tests cover disconnects and version mismatch independently for
  each half.
- Reproducible firmware artifacts build successfully for both halves.
- **Stop and obtain the user's explicit approval before flashing either
  artifact.**
- After approval, verify all 80 cells, typing fail-safety, power, reboot,
  unplug, sleep/wake, and split reconnect on the actual keyboard.

## Milestone 5 — platform shell, accessibility, and Calendar gate

Status: **not started**

Deliver:

- [ ] Tray/menu lifecycle, pause/clear, launch behavior, and a non-activating
      HUD on macOS and capability-appropriate behavior on Windows/Linux.
- [ ] Keyboard and screen-reader access, high contrast, increased text,
      no-flash, and reduced motion in both UI and device presentation.
- [ ] Signed-updater configuration with secrets kept outside the repository.
- [ ] A measured Calendar spike behind the existing built-in adapter seam.

Calendar ships only if:

- it can read the next eligible event with explicit permission and selected
  calendars;
- time-state transitions and expiry are deterministic;
- opening/joining an event is identity-safe;
- macOS-only availability is communicated clearly; and
- it adds no provider abstraction or credential system to claim false
  cross-platform parity.

Otherwise Calendar remains a tested simulator and documented future feature.

Acceptance:

- Core Codex behavior works on macOS, Windows, and Linux builds.
- Wayland and other platform limitations degrade honestly.
- Accessibility checks and human screenshot review pass.
- Calendar's ship/defer decision includes direct evidence.

## Milestone 6 — distributable release candidate

Status: **not started**

Deliver:

- [ ] Native CI builds and signed artifacts for supported targets.
- [ ] macOS Developer ID signing/notarization, Windows code signing, Linux
      AppImage plus udev installation guidance.
- [ ] A signed staged updater feed with a tested rollback/recovery path.
- [ ] Clean-machine install, launch, Codex discovery, simulator, pause, update,
      uninstall, and configuration migration smoke tests.
- [ ] User documentation, compatibility matrix, privacy/safety disclosures,
      screenshots, and a concise firmware installation flow.

Acceptance:

- A new user can understand the task-board model, test it in simulation, install
  compatible firmware deliberately, and recover to a known-good build.
- No release copy claims capabilities that were only simulated.
- The repository, artifacts, and public documentation pass final adversarial,
  security, accessibility, and visual reviews.
