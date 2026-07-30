# Milestone 4 desktop integration review

## Outcome

The signed Electron application now presents one coherent 80-key control
surface even while the Glove80 is disconnected. It discovers persisted Codex
tasks through a supervised local app-server, allocates them into a stable
physical region, opens an admitted task through its local `codex://` thread
link, and keeps keyboard capabilities honest.

This review changes no firmware and is not approval to flash.

## Directly observed in the packaged application

- The Codex source reached `Online` and discovered 26 persisted local tasks.
- A five-key task-board region displayed five occupied positions and 21
  overflow tasks.
- Invoking `Open task in Codex` dispatched the admitted thread link and then
  closed its temporary interaction epoch. The Glove80 application did not
  remain in `Control armed`.
- The keyboard was physically absent. The app displayed `USB disconnected`,
  disabled Preview and Pause, retained offline editing, and promised only to
  resume after a future left-half USB reconnect.
- The read-only packaged-device probe returned `[]`.
- One `All 80` action selected and numbered every physical position across
  both 40-key halves. Cancelling restored the saved five-key region.
- Each rendered position used the Base-layer legend derived from Ralf Custom
  Swiss v8 plus its stable physical coordinate. The layout included nested
  modified bindings such as `⇧2` and `⇧1`.

## Capability boundaries

The app-server instance can enumerate persisted tasks and open their admitted
local deep links. It cannot prove the exact live state of tasks owned by a
different Codex process. Those tasks therefore render as `Activity unknown`,
not as idle, working, completed, failed, or needs-input.

Exact live semantic states remain supported for tasks owned by this
application's supervised app-server session. Calendar remains visibly planned
and permission-gated; no calendar provider or public plugin SDK was added in
this milestone.

The production HID session, scene lease, 80-cell protocol, and Control-layer
events are implemented, but the current alpha5 firmware is still unflashed.
Physical LED order, split acknowledgement, Control interaction, and recovery
remain the grouped hardware acceptance gate in
[the pre-flash review](milestone-4-preflash-gate.md).

## Visual evidence

![Live Codex task board with the keyboard disconnected](../screenshots/milestone-4/live-codex-disconnected-dark.png)

![All 80 keys selected in deterministic fill order](../screenshots/milestone-4/all-80-editor-dark.png)

## Verification

- Surface protocol: 20 tests passed.
- Control core: 16 tests passed.
- Electron desktop: 101 tests passed and one hardware-only test skipped.
- The production renderer and Electron main process built successfully.
- The packaged native-module smoke test passed with HIDAPI 0.15.0.
- Strict deep code-signature verification passed under Developer ID team
  `76625SQ67N`.
- The packaged read-only hardware probe returned no Glove80 because the
  keyboard was disconnected.
- macOS notarization is not configured.
