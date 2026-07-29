# Roadmap

This roadmap orders vertical risk reduction, not feature desirability. The
application starts against fakes immediately; it does not wait for 80-cell
firmware before testing the product UX.

## Phase 0 — contracts and feasibility

- Specify the firmware display/interaction state machine and byte-level
  session, scene, feature, and input reports.
- Specify the app domain types, `SurfaceDevice`, and `IntegrationAdapter`.
- Separate desired scene from device-applied scene.
- Add shared golden protocol vectors and malformed-message tests.
- Record the exact tested MoErgo commit, descriptor, board, and current
  six-cell protocol.
- Prove a normally code-signed, non-sandboxed Swift process can open the vendor HID
  collection and maintain background renewal through sleep/wake.
- Build deterministic fake surface-device, Codex, and Calendar adapters.
- Prove whether a standalone Codex client can observe live turns owned by the
  desktop app; otherwise scope Codex to app-server-owned threads before UI
  implementation.

Exit criterion: the protocol decoder passes reviewed vectors, every
expiry/press transition has an expected outcome, and the application can run
its lifecycle entirely against fakes.

## Phase 1 — visual editor with fakes

- Build the one-process native app and single logical state owner.
- Render both physical halves from the versioned device catalog.
- Add select, inspect, bind, preview, Undo, zoom/fit, status, and accessible
  non-spatial navigation.
- Add optional read-only MoErgo JSON import for accurate base-layer legends.
- Simulate desired/applied divergence, right-half lag, stale resources, pause,
  reconnect, and action results.

Exit criterion: select left `1`, bind a fake Codex task, watch working pulse
become completed green, and see both simulated halves acknowledge the
generation.

## Phase 2 — six-cell ambient vertical slice

- Connect `Glove80SurfaceDevice` to the existing six-cell USB reports.
- Fix compositor priority and current-state power computation.
- Validate exact cells, expiry, ordinary RGB coexistence, Magic diagnostics,
  battery behavior, and malformed reports.
- Implement the real built-in Codex adapter only for task sources whose live
  observation was proven; leave physical action dispatch disabled.
- Show desired, applied, stale, incompatible, and paused states honestly.

Exit criterion: bind left `1` to a real Codex task and observe
working → completed/stale on one of the six proven cells without changing its
typing behavior or reflashing.

## Phase 3 — momentary interaction vertical slice

- Resolve and document one exact physical trigger and keymap integration seam.
- Add the vendor input report and host deduplication.
- Add the reserved surface layer and generic surface-key behaviors.
- Freeze binding allocation by interaction epoch.
- Prototype the non-focus-stealing HUD and one safe Codex action.
- Test trigger release, crash, lease expiry, sleep/wake, USB unplug, reboot,
  duplicate/gapped events, and keys held across every transition.

Exit criterion: holding the trigger and pressing left `1` invokes the bound
action; release immediately restores ordinary typing, and no new normal press
is lost after failure.

## Phase 4 — complete left half

- Add fragmented, atomic complete-scene commits.
- Enforce and measure a complete-frame current budget.
- Map and validate every available left-half RGB cell.
- Implement solid, pulse, and blink locally.
- Reuse the existing app/editor interfaces without a cell-count special case.

Exit criterion: all 40 left cells render independently and safely under
worst-case static and animated scenes.

## Phase 5 — complete right half

- Add the versioned scene snapshot protocol over the split link.
- Coalesce updates and acknowledge applied generations.
- Test disconnect/reconnect, reboot, mixed versions, packet loss, and stale
  peripheral state.
- Enforce the right half's independent power and battery budget.
- Display central/right applied generations and failure independently.

Exit criterion: all 80 cells are addressable, reconnect to the latest scene,
and fail without affecting typing or the other half.

## Phase 6 — Calendar and product hardening

- Harden menu-bar lifecycle, pause/clear, notifications,
  configuration migration, and secret-free import/export.
- Implement Calendar `nextMeeting` with selected macOS calendars, temporal
  state, expiry, redaction, and one capability-gated Open meeting action.
- Inspect actual EventKit records and Calendar automation on configured
  providers; capability-gate Join and exact-event navigation.
- Freeze and revalidate the resolved event identity during interaction.
- Complete keyboard-only, VoiceOver, reduced-motion, no-flash, high-contrast,
  and increased-text testing.
- Review the common integration contract against Codex's fixed resource and
  Calendar's time-driven selector.

Exit criterion: both integrations fit without device special cases or a generic
UI schema. Only then decide which abstraction, if any, is justified next.

## Phase 7 — safe install and compatibility

- Define the narrow keymap integration seam.
- Build a compatibility matrix against exact MoErgo revisions and hardware
  variants.
- Produce canonical side-specific manifests, hashes, and known-good recovery
  artifacts. Add signatures only after defining a trust root and threat model.
- Guide bootloader detection, artifact-side validation, flash, verification,
  and recovery as an explicit workflow separate from the runtime app.

Exit criterion: a new supported user can reach the 80-cell product without
manual source editing and can return to a known-good build.

## Evidence-gated expansions

- Bluetooth after live bidirectional HID, caching, lease, and power validation.
- Public out-of-process plugin SDK after Codex and Calendar ship, a concrete
  third-party need exposes a missing contract, and a threat model exists.
- Separate daemon/UI processes only if lifecycle or isolation demands them.
- Multiple keyboards and active-host takeover policy.
- Pages only if one 80-cell surface cannot remain discoverable.
- Cross-platform UI after the native Glove80 product is useful.
