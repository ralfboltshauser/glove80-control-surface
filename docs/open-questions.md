# Open design questions

These are intentionally unresolved. They must not become accidental
implementation commitments.

## Before ambient firmware implementation

1. What exact chunk encoding and atomic commit rules carry an 80-cell scene
   through the proven HID report size?
2. What is the smallest compositor hook that keeps MoErgo diagnostic status,
   ordinary RGB, surface cells, and current-state power calculation under one
   owner?
3. Does a generated include/overlay provide a stable enough integration seam,
   or is a structural keymap transformer unavoidable?
4. Which Glove80 hardware/RGB variants and exact MoErgo revision constitute the
   first supported compatibility row?
5. What split-link message size, acknowledgement, and coalescing mechanism
   provides reliable right-half snapshots without starving key events?
6. What per-half current/brightness budget is safe for complete 40-cell frames?

## Before interaction firmware implementation

1. What exact ZMK press/release behavior occurs if the session expires while a
   surface key or trigger is held?
2. Which exact momentary trigger can be added without breaking the imported
   user keymap, combos, hold-taps, Studio layer ordering, or existing Magic
   behavior?
3. Is the generated highest-priority layer sufficient for all 80 positions,
   and what documented fallback exists for a user's already-occupied trigger?

## Before shipping the desktop stack

1. Can one Tauri application reliably own HID, run while its window is closed,
   and present a no-focus HUD on each target platform without a helper service?
2. What local configuration format supports resolved collections, sticky
   allocation, and accessible presentation overrides without pretending to be
   a public integration API?
3. Does a labeled runtime HUD actually make 80 physical bindings discoverable,
   or is another view needed?
4. Can a one-time official lifecycle-hook bridge safely supplement app-server
   discovery for Desktop-owned turns without delaying or perturbing Codex?
5. Which EventKit fields and Calendar automation mappings survive for each
   configured provider, and which support Join, Show event, or only Open
   Calendar?

## Before a generally useful release

1. How should ordinary underglow look beneath sparse ambient status cells?
2. What is the user-visible stale/offline convention?
3. What action feedback and acknowledgement state must persist across restarts?
4. How are firmware compatibility and recovery explained without claiming the
   running firmware can be backed up?
5. What Bluetooth session ownership and descriptor-cache workflow is acceptable
   to wireless-first users?
6. How are active-host ownership and conflicts communicated when the keyboard
   is attached to more than one computer?
7. Which local-process threats matter when same-user software can open the
   vendor HID endpoint directly?
8. Under real high-churn Codex use, which overflow and eviction thresholds keep
   the task board self-maintaining without making tasks feel hidden or random?
