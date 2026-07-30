# Milestone 0 adversarial review

- Date: 2026-07-29
- Scope: product noun, desktop stack, Codex observation, user workflow
- Outcome: conditional pass; implementation may continue with the evidence
  gates below

## Findings that changed the plan

### A saved key-to-chat binding is the wrong product

Codex chats turn over much faster than physical configuration should. Requiring
the user to revisit Settings every few hours would make the keyboard a second
inbox to maintain.

Resolution:

- the durable noun is one **Codex task board** assigned to a physical region;
- thread identifiers never appear in its normal saved configuration;
- a provider-sorted collection fills sticky runtime slots;
- protected slots and overflow preserve spatial memory; and
- the inspector may show the current task, but never offers “change task.”

Rejected alternatives were fixed chat IDs, newest-chat-per-number
recalculation, status buckets with ambiguous identity, and fictional permanent
agents.

### App-server discovery and live observation are different capabilities

Read-only probes against the locally installed `0.144.6` CLI and ChatGPT's
bundled `0.146.0-alpha.3.1` binary discovered Desktop-owned tasks through a
separately spawned app-server. All were reported as `notLoaded`, including the
active root task and active subagents. `thread/loaded/list` was empty, and
reconstructed running turns did not preserve the owning process's live state.

Resolution:

- `ExternalDiscovery` dynamically discovers and opens changing Desktop/CLI
  tasks, but treats runtime status as unknown unless another authoritative
  signal exists;
- `OwnedLive` may provide exact runtime events only for tasks started through
  the companion's own app-server connection;
- the app does not resume an already-running Desktop task to manufacture live
  ownership;
- installed protocol capabilities are detected instead of assuming the latest
  manual; and
- a narrowly scoped, one-time official lifecycle-hook bridge remains a spike,
  not an invisible prerequisite.

Pins are absent from both installed generated schemas despite appearing in a
newer manual. v0 therefore has no Pinned source strategy.

### Native Swift does not satisfy the product requirement

The previous native-macOS recommendation directly contradicted the requirement
to ship Windows, Linux, and macOS.

Resolution:

- Tauri 2, Rust, React, TypeScript, and Vite replace Swift/SwiftUI;
- one state-owning Rust core keeps HID and process access out of the renderer;
- pure `control-core` and `surface-protocol` crates remain independent of
  Tauri;
- there is one desktop application and no daemon, but not literally one OS
  process;
- Linux permissions and Wayland degradation are explicit;
- Calendar is macOS-only or deferred rather than wrapped in a premature
  provider framework.

Electron was rejected because it adds a bundled Chromium/Node surface and
either WebHID permission complexity or a native-addon ABI/rebuild matrix.
Slint remains the strongest fallback, but is weaker for this spatial editor's
visual test and distribution loop.

## UX review decisions

- Daily navigation is **Assignments**, not Integrations.
- Connections, permissions, and raw diagnostics live in Settings.
- Onboarding has four steps: keyboard/simulator, Codex, physical region,
  verify.
- No task picker, policy questionnaire, or fixed-task option appears in normal
  setup.
- The default retention policy is product behavior, not a setting.
- Color is redundant with text and iconography.
- High-frequency key-triggered HUD changes have no entrance animation.
- Working uses a slow pulse; needs-input uses a somewhat quicker pulse;
  reduced-motion turns both into static presentations.
- Supporting 80 cells does not imply that 80 simultaneous unlabeled dynamic
  actions are understandable. The HUD changes representation at higher counts.

## Remaining hard gates

1. Determine whether an official lifecycle-hook bridge can provide
   cross-process working/input/completion signals without delaying Codex,
   consuming model context, or becoming brittle configuration.
2. Replace the approximate preview geometry with a validated Glove80
   topology catalog before hardware identify mode.
3. Prove cross-platform CI on the public branch.
4. Prove actual six-cell HID access from the Rust transport before expanding
   its protocol.
5. Measure power and split-link behavior before any 80-cell firmware flash.

None of these gates permits a false UI state. Unknown, stale, simulated,
desired, and device-applied remain visibly distinct.
