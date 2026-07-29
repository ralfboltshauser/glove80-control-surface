# Roadmap

This roadmap orders risk reduction, not feature desirability.

## Phase 0 — make the behavior precise

- Specify the display/interaction state machine.
- Specify the minimal session, scene, feature, and input reports.
- Add shared protocol vectors and malformed-message tests.
- Record the exact tested MoErgo commit, descriptor, board, and current
  six-cell protocol.

Exit criterion: a reviewed byte-level specification, golden vectors, and a
decoder test agree; every expiry/press transition has an expected outcome.

## Phase 1 — six ambient cells over USB

- Drive the existing six left cells from a minimal command-line host.
- Implement one complete fixed-RGB scene with sequence and TTL.
- Fix compositor priority and current-state power computation.
- Validate exact cells, expiry, ordinary RGB coexistence, Magic status, battery
  behavior, and malformed reports.
- Connect one real built-in integration to ambient state.

Exit criterion: the six keys provide useful glanceable state for daily USB use
without changing typing behavior.

## Phase 2 — complete left half

- Add chunked, atomic scene commits.
- Enforce and measure a complete-frame current budget.
- Map and validate every available left-half RGB cell.
- Implement solid, pulse, and blink locally.

Exit criterion: all 40 left cells render independently and safely under
worst-case static and animated scenes.

## Phase 3 — complete right half

- Add the versioned scene snapshot protocol over the split link.
- Coalesce updates and acknowledge applied generations.
- Test disconnect/reconnect, reboot, mixed versions, packet loss, and stale
  peripheral state.
- Enforce the right half's independent power and battery budget.

Exit criterion: all 80 cells are addressable, reconnect to the latest scene,
and fail without affecting typing or the other half.

## Phase 4 — momentary interaction

- Resolve and document one exact trigger and keymap integration seam.
- Add the vendor input report and host deduplication.
- Add one reserved surface layer and surface-key behaviors for all positions.
- Test trigger release, application crash, TTL expiry, sleep/wake, USB unplug,
  reboot, and keys held across every transition.
- Prototype and user-test a labeled on-screen HUD and action feedback.

Exit criterion: no new normal key press is lost after session expiry, and one
real action completes end to end with understandable accepted/failed feedback.

## Phase 5 — smallest configurable application

- Keep HID, configuration, built-in integrations, HUD, and editing in one
  process.
- Store bindings and accessible presentation preferences locally.
- Add identify-key preview.
- Add connected/stale/paused/offline state, one-click clear, and secret-free
  export.
- Implement a second and third materially different built-in integration.
- Implement one stable dynamic region provider and freeze its mapping during
  interaction.

Exit criterion: fixed-resource, command-only, and aggregate/dynamic needs are
understood well enough to decide whether a public plugin SDK is justified.

## Phase 6 — safe install and compatibility

- Define the narrow keymap integration seam.
- Build a compatibility matrix against exact MoErgo revisions and hardware
  variants.
- Produce canonical side-specific manifests, hashes, and known-good recovery
  artifacts. Add signatures only after defining a trust root and threat model.
- Guide bootloader detection, artifact-side validation, flash, verification,
  and recovery.

Exit criterion: a new supported user can reach the 80-cell product without
manual source editing and can return to a known-good build.

## Evidence-gated expansions

- Bluetooth after live bidirectional HID, caching, and power validation.
- Public plugin SDK after three built-in integrations stabilize the contract.
- Separate daemon/UI processes only if lifecycle or isolation demands them.
- Pages only if one 80-cell surface cannot remain discoverable.
- Cross-platform and additional keyboards after the Glove80 product is useful.
