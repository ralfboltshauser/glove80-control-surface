# Milestone 4 consolidated pre-flash gate

## Decision

Do not flash `m4-alpha2` or `m4-alpha3`. They compiled, but consolidated review
found interaction-state and split-deadline problems that would have required
another flash.

`m4-alpha5` is the only current candidate. It is not hardware-validated and
this document is not permission to flash. The keyboard is disconnected while
the final offline gate runs. Physical checks remain one explicit, grouped
post-flash session after fresh approval.

## Directly observed on alpha1 hardware

- Both halves accepted the side-correct alpha1 UF2s.
- Ralf Custom Swiss v8 typing continued on both halves and the existing BLE
  identity remained usable.
- The read-only feature report exposed protocol 2, build `g80m4a01`, topology
  `glove80-rgb-80-v1`, cells 0 through 79, solid and pulse, input events,
  right-half acknowledgement capability, 60-second maximum lease, and
  brightness limit 96.
- A leased 80-cell scene rendered on both halves: physical cell 0 pulsed white
  and physical cell 40 rendered static green on the right F6 key.
- Closing the host session cleared the leased scene.
- The host never observed the alpha1 right acknowledgement, so alpha1 reported
  a partial scene even though the right LED rendered.

This proves split delivery and rendering on alpha1. It does not prove alpha5
acknowledgement, timing, interaction behavior, or complete right-side LED
order.

## Alpha5 changes closed before another flash

- Right acknowledgement uses a 16-byte BLE notification, with the existing
  scene retry recovering a lost notification.
- Interaction entry, exit, timeout, and cell transitions share the session
  mutex with Close and lease expiry.
- Magic+1 arms exactly one Control action while a leased USB session exists.
  One low-brightness left indicator pulses while armed. Releasing the selected
  key exits Control; Magic+1 cancels; five seconds without an action
  auto-cancels. A key held for five seconds receives a matching synthetic Up
  before Control exits. Session close, expiry, and reboot also exit.
- All 80 physical positions remain individually actionable because Magic+1 is
  an arm chord, not a key that must remain held.
- The original Magic tap and hold bindings are unchanged in the generated
  keymap.
- Ordinary split scenes reject fragment submission at or after 500 ms and
  reject controller completion at or after the one-second right-relative
  lease reserve. These are pragmatic bounds, not a formal guarantee that the
  right work queue has applied the scene before the left lease expires.
- Transparent clears are not dropped merely because they waited in the host
  queue; their short lease begins when transmission starts.
- Electrical-limit rejection clears an older local overlay before restoring
  the user RGB compositor.
- The Electron device session resets after invalid interaction ordering or a
  reconnect whose firmware reports an interaction the host did not observe.
  The physical HUD cannot dismiss firmware Control by itself.
- The current HUD appears only while the app window is open. The local pulsing
  key is the firmware-owned feedback when the window is closed. Codex deep-link
  opening is bounded to two seconds so it cannot indefinitely block queued
  Up/Exit handling.

## Offline evidence completed

- Four patches apply cleanly to MoErgo ZMK
  `2f73a230e2fc7b2bd64a9736181e87bf54338131`.
- Complete patched-source diff SHA-256:
  `b766ac24afa52b580a88bd69e292678a965f2161bf9493a30c44af2ad44d9d75`.
- Two independent builds—one development tree and one fresh clean patch
  application—produced byte-identical pairs.
- Alpha5 LH:
  `b56ffa63c0a538e5106995eef88b3cd4b04ab17538fd478ba8b2dcf5ee40c88b`
  (486912 bytes).
- Alpha5 RH:
  `656a20fefaf23a5811c8d65ea11fb508de7a67746400cf38073cade830770172`
  (369664 bytes).
- The release verifier checks the pinned source diff, Zephyr commit, SDK,
  manifest and patch hashes, compiled DTS bindings, preserved layers,
  Magic+1 positions, absence of Studio/storage mutation, side/role config,
  UF2 contents, side-specific family, byte size, artifact hash, and the
  application-partition boundary `0x26000..<0xec000`.
- The compiled DTS contains the original Base, Lower, Magic, and Factory
  bindings byte-for-byte, one generated 80-key Control layer, and the
  Magic+1 one-shot chord.
- ZMK Studio and persistent keymap mutation are not enabled.
- Recovery remains the clean pinned MoErgo build with the exact Swiss v8
  keymap:
  - LH `0863da85b17f06f17ecfac4fdac3560c0f56becdfaecd85e953fbc9404b53ceb`
  - RH `cc95d8a91de3e3d9688b1f62fb77dd084ffa57ff0355a36fc0ea4143eb7f682c`
- Protocol: 20 tests passed.
- Control core: 16 tests passed.
- Desktop: 98 tests passed, with one platform-specific test skipped.
- Covered host cases include full and partial scenes, delayed right ACK,
  bounded ACK timeout, Disable during ACK polling, coalescing, lease renewal,
  pause/close, scene expiry/resync, duplicate macOS collections, idle
  disconnect/replug, invalid interaction recovery, interaction ordering, and
  physical-event-to-action-to-LED repaint through the production composition.
- Renderer and Electron main production builds passed.
- The packaged arm64 app rebuilt native HIDAPI 0.15.0, passed the packaged
  native-module smoke test, and passed strict deep code-signature verification
  under Developer ID team `76625SQ67N`.
- With the keyboard physically absent, the packaged read-only probe returned
  `[]`. The final signed UI rendered an honest disconnected state, all 80
  positions, disabled preview/pause controls, and no simulated keyboard.
- macOS notarization is not configured. That is a distribution limitation, not
  a firmware or local-alpha safety claim.

There is no ZMK-native runtime or fuzz harness for the new C parser,
work-queue, split-notification, or timeout paths. Compilation and host tests
cannot prove those firmware behaviors. The physical gate below is therefore
required.

## One grouped hardware acceptance session after approval

1. Flash RH alpha5, verify split typing, then flash LH alpha5. Both halves must
   run the pair because the split protocol changed. Verify Swiss v8 typing over
   USB and the existing BLE identity.
2. Read protocol 2 build `g80m4a05` and require one unambiguous vendor HID
   collection.
3. Apply cell 0 pulse plus cell 40 solid and require an all-applied
   acknowledgement within the bounded poll window.
4. Keep the scene alive across several lease renewals.
5. Press Magic+1. Require exactly one low-brightness pulsing left indicator.
   Invoke one left key and one right key in separate arms; each must emit one
   down/up/action sequence and auto-exit on release.
6. While armed, press two action keys before releasing either. Require only the
   first key to emit and invoke. Verify a key held for five seconds receives
   one synthetic Up and exits.
7. Verify Magic+1 cancels without invoking an action and an unused arm
   auto-cancels after five seconds.
8. Verify ordinary Magic tap, Magic hold, Magic+T, and normal typing are
   unchanged outside Control.
9. Gracefully close and visually confirm both halves restore the user RGB
   state and Control is inactive.
10. Kill the host while active and require both halves to clear by lease
   expiry, Control to exit, and typing to remain normal.
11. Unplug/replug left USB and power-cycle/reconnect the right half; require
    honest partial state followed by a complete resync.
12. Sweep all 80 channels at low brightness to record the physical LED
    permutation and confirm that intended physical indicator cell 29 maps to
    raw left LED channel 39 and the Magic key. Calibration is host metadata and
    requires no firmware change.

Stop immediately on any typing regression, retained Control layer, wrong-side
artifact, reset loop, persistent light beyond its lease, or power anomaly.
Recovery flashing still requires separate explicit approval.

## Deliberate residual uncertainty

The split submission and completion deadlines are empirical safety margins.
Zephyr's write-without-response path can block, and the right half applies a
scene on its own work queue. A reverse commit protocol—right apply/ack first,
left apply second—would provide a stronger ordering guarantee, but is a larger
protocol change. Alpha5 keeps the smaller bounded design because a timing miss
causes only temporary LED mismatch and lease expiry clears it. If hardware
timing disproves the bounds, stop rather than relaxing them.

Runtime control is USB-only in protocol 2. BLE typing remains the stock
keyboard path. BLE command ingress would be a separate security, ownership,
and transport change.
