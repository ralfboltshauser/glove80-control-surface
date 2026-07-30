# Milestone 4 alpha7 pre-flash gate

## Direct alpha6 hardware evidence

On 2026-07-30 both side-labelled alpha6 UF2s were flashed after their mounted
bootloaders identified themselves as `Glove80-RH-revH` and
`Glove80-LH-revH`. Their hashes matched the alpha6 manifest before each copy.

- Normal Swiss v8 typing continued across both halves.
- USB feature report 8 returned protocol 3, build `g80m4a06`, all 80 cells,
  solid and pulse, input events, right acknowledgement support, maximum
  brightness 96, and maximum lease 60 seconds.
- Two bounded live tests applied and renewed the left scene, then explicitly
  closed it.
- In both tests the right half stayed dark and never acknowledged the
  generation.
- Power-cycling only the right half and confirming ordinary right-side typing
  did not change the result.

This distinguishes the ordinary ZMK split-key path from the new scene channel:
typing works, while complete scene delivery does not.

## Root cause

One right snapshot is 190 bytes and requires twelve serialized 20-byte GATT
writes. The configured split interval is 7.5 ms, but the peripheral is allowed
latency 30, so a healthy serialized transfer can exceed alpha6's 500 ms
submission and 1000 ms delivery deadlines. Alpha6 then aborts before the final
fragment, so the peripheral cannot assemble, apply, or acknowledge the scene.
The observed dark/stale right half is the expected result of that path.

The secondary bank is not the cause. Removing its five-byte mask would reduce
the snapshot from 190 to 185 bytes; both sizes still require twelve fragments.

## Alpha7 correction

Alpha7 makes five narrow changes:

1. Bound submission and delivery to 3500 ms.
2. Reserve 4000 ms from the right lease. A transfer accepted at its deadline
   therefore retains 500 ms before the central lease expires; a slower transfer
   is rejected.
3. Mark the acknowledgement value with encrypted-read permission so Zephyr
   enforces encryption when sending its notification.
4. Give transparent clear its own one-second lease after the reserve, avoiding
   unsigned underflow while keeping it short-lived.
5. Let the host wait four seconds for the bounded acknowledgement and use a
   16-second production lease. Half-lease renewal plus the 3.5-second transfer
   remains inside the right lease with 500 ms margin.

Primary and secondary banks, the Swiss v8 layout, topology, HID protocol,
brightness cap, electrical frame budget, and recovery images are unchanged.
Graceful close still clears immediately; host-crash expiry increases from 10
to at most 16 seconds.

## Offline evidence

- Seven patches apply cleanly from MoErgo ZMK
  `2f73a230e2fc7b2bd64a9736181e87bf54338131`.
- Complete patched-source diff SHA-256:
  `410853ac090ec6859d161d6917914dce50307df3d179c45375ef7b1fcc9881a2`.
- Two independent clean applications produced byte-identical pairs.
- Alpha7 LH: `8ce547109b385d3f3874306761c972a868f6856555096b2f4aec730624727467`
  (485376 bytes).
- Alpha7 RH: `b7526b040365d7646aa9296df2cb9a15f9171331a215de06338951dae9c4228a`
  (371200 bytes).
- The strict release verifier accepts both alpha7 images and the unchanged
  known-good recovery pair.

## Required grouped post-flash test

1. Flash RH alpha7, confirm split typing, then flash LH alpha7 and confirm
   typing again.
2. Read feature report 8 and require protocol 3/build `g80m4a07`.
3. Apply the left-white/right-green smoke scene and require a right
   acknowledgement.
4. Keep it healthy through at least two renewals, then close and require both
   halves to clear.
5. Hold printed Up and require immediate white primary feedback. Invoke one
   left and one right action in separate holds and require ordered down/up
   events.
6. Hold printed Down and repeat for amber secondary feedback.
7. Verify first-held-bank wins, release exits immediately, and the 30-second
   fail-safe cannot strand Control.
8. Kill one live host session and require both halves to clear by lease expiry.
9. Sweep all 80 cells at low brightness only after the two-cell and interaction
   gates pass.

Stop on any typing regression, persistent light, wrong-side artifact,
unacknowledged right scene, reset loop, or power anomaly. Recovery flashing
still requires separate explicit approval.
