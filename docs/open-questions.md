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

## Interaction decisions resolved in the alpha5 candidate

- Interaction entry, exit, key transitions, Close, and expiry share one
  firmware mutex. Expiry cancels the consumed interaction gesture rather than
  synthesizing typing.
- Magic+1 arms one Control action only during a live lease. Releasing the
  action key exits; Magic+1 cancels; five-second inactivity auto-cancels. A
  five-second hold emits a synthetic Up before exit. The original Magic tap
  and hold bindings remain unchanged in the imported layers.
- The generated highest-priority Control layer covers all 80 positions. The
  gesture is compatibility-manifest data rather than an unrestricted runtime
  choice.

These are source- and build-verified decisions, not hardware acceptance.
Physical Magic behavior, the local indicator mapping, expiry during a press,
and all 80 positions remain in the grouped alpha5 hardware gate.

## Before shipping the desktop stack

1. Can one Electron application reliably keep its HID lease while its window
   is closed and present a no-focus HUD on each target platform without a
   helper service? The packaged macOS HID probe is positive; lifecycle and
   Windows/Linux behavior remain to be proven.
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
