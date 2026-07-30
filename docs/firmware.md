# Firmware boundary

## Required capabilities

The firmware should report:

- protocol, build, and topology identity;
- supported effects and limits;
- available cell bitmap;
- maximum scene lease; and
- current session/generation and last result.

Human-readable geometry remains in a versioned desktop device catalog. Scene
messages use stable raw LED channels and key events use stable ZMK positions.
The desktop catalog maps both identities to physical keys. This keeps
calibration and hardware-revision corrections on the host, where they do not
require another firmware flash.

## Minimal protocol

Host to keyboard:

```text
OPEN(session_id, lease)
SCENE_CHUNK(session_id, generation, flags, cell_styles)
CLOSE(session_id)
```

Keyboard to host:

```text
SURFACE_EVENT(session_id, event_sequence, mode_epoch, type, cell)
```

`type` initially covers mode enter/exit and key down/up. The feature report
contains capabilities, status, and the last accepted sequence/result.

`SCENE_CHUNK` carries part of a complete scene. `FIRST` starts a staging
generation and `COMMIT` atomically installs it only after every declared chunk
has arrived and validated. An empty committed scene clears the overlay. A
newer `FIRST` may discard an incomplete older staging generation. Effects are
cell style properties, not imperative start/stop commands.

The wire format is not yet frozen. Unknown or malformed messages do not renew a
session.

In `NO_SESSION`, a valid `OPEN` establishes a session with an empty scene. An
`OPEN` with the same live session ID is idempotent and renews it. A different
session ID receives `BUSY` until the short existing lease expires or closes;
it does not silently take over. The ID distinguishes sessions but is not an
authentication secret. Bluetooth and multiple connected hosts require an
explicit endpoint-authorization and takeover policy before support is
promised.

Malformed chunks are rejected, recorded in status, and do not renew the lease.
They do not immediately destroy an otherwise valid scene/session. A vanished
host or removed cable is therefore guaranteed to recover no later than lease
expiry unless an earlier disconnect callback has been separately proven.
Animations may continue only while their committed scene's session is live.

## Display and interaction state

Display ownership and key interception are separate:

```text
NO_SESSION
  └─ OPEN → DISPLAY

DISPLAY
  ├─ committed scene → DISPLAY
  ├─ trigger down → INTERACTIVE
  └─ CLOSE or expiry → NO_SESSION

INTERACTIVE
  ├─ surface keys → vendor down/up events
  ├─ trigger up → DISPLAY
  └─ CLOSE or expiry → cancel surface gestures, then NO_SESSION
```

Rules:

- The generated control layer activates only while a valid session exists.
- It is momentary; latching is not supported initially.
- Trigger release always exits and is idempotent.
- Expiry prevents all new surface presses and cancels already-started surface
  gestures; it never synthesizes ordinary typing for a consumed press.
- Reboot and disconnect start in `NO_SESSION`.
- Press/release behavior across expiry must be verified against ZMK keymap
  routing with automated and hardware tests.

## Rendering

The intended compositor priority is:

1. battery and electrical safety;
2. MoErgo diagnostic indicators;
3. leased control-surface cells;
4. ordinary user underglow;
5. off.

Unassigned surface cells are transparent by default; they do not erase ordinary
underglow. The exact priority and restoration behavior require compositor
tests.

The required effect vocabulary is solid and pulse. Blink remains optional and
is added only if later accessibility and power testing justify it.

LED power is never restored from a historical snapshot. It is continuously
derived from current state:

```text
effective power =
    current user RGB state
    OR active diagnostic
    OR permitted surface scene
```

This prevents scene expiry from undoing a newer user RGB choice.

## ZMK integration

The sustainable target is:

- devicetree cell maps;
- control-mode behavior;
- surface-key behavior;
- renderer and animation engine;
- protocol state and leases; and
- tests.

However, the current MoErgo fork exposes neither a final-pixel compositor hook
nor a module hook for extending the shared HID descriptor and handlers. The
current experiment modifies `rgb_underglow.c`, `hid.h`, `usb_hid.c`, and
`hog.c`.

The smallest maintainable patch series should add:

1. one compositor/power-request hook to MoErgo RGB; and
2. the vendor HID descriptor and USB report handlers.

Surface state and animation can then live in a module. Until those hooks exist,
this is honestly a maintained MoErgo patch series—not a standalone module.

The control keys should use one reserved, highest-priority generated ZMK layer.
Raw position-event interception is avoided because it interacts poorly with
combos, hold-taps, tap dance, and listener ordering.

## Electrical scope

Addressability does not prove that 40 or 80 cells are safe at arbitrary output.
Firmware clamps host brightness to 96/255 and the first hardware calibration
uses one low-brightness channel at a time. Any later increase must be based on
a frame-wide current budget per half, animation duty cycle, transport power,
and that half's battery.

## Split synchronization

The central holds the latest authoritative committed scene and divides it using
the reported topology. It renders the left subset locally and sends a
versioned, generation-tagged snapshot of the right subset to the peripheral.

- Updates coalesce to the newest complete generation; they are not appended to
  the existing small behavior queue.
- The peripheral acknowledges the last applied generation and reports protocol
  and rendering status.
- Reconnect triggers a full snapshot, not a replay of deltas.
- Mixed protocol versions or a missing peripheral fail closed for right-side
  lighting while leaving typing and left-side rendering intact.
- Pulse runs locally from shared effect parameters, avoiding continuous frame
  streaming over the split link. Any later blink capability follows the same
  rule.
- Each half clamps brightness/current from its own power and battery state.
- Leases are relative on each MCU; the right lease begins after its snapshot
  arrives. The central subtracts a one-second transfer reserve, but this is
  not clock synchronization. Under an unusually stalled-yet-connected split
  link, right-side expiry may trail left-side expiry; it remains bounded by
  the firmware's 60-second maximum and the same brightness/current clamps.

Right-side input positions already travel to the central through the existing
split keyboard path. The control layer reuses those logical positions and does
not add a second input transport.

## Explicitly excluded

The host protocol must not expose:

- arbitrary behavior invocation;
- bootloader or reset commands;
- Bluetooth bond/profile deletion;
- flash/settings writes;
- unbounded LED brightness; or
- an unrestricted raw memory or device API.

## Compatibility and tests

Every release records:

```text
Control Surface version
× exact MoErgo ZMK commit
× Glove80 RGB/hardware variant
× protocol version
× target side
```

CI eventually needs both-half builds, golden descriptor bytes, shared protocol
vectors, malformed-report tests, compositor priority tests, session/mode state
tests, keymap integration fixtures, and flash/RAM regression limits.
