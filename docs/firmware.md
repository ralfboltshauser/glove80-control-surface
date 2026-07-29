# Firmware boundary

## Required capabilities

The firmware should report:

- protocol and firmware version;
- device family and side;
- physical cell identifiers and LED mapping;
- supported effects and limits;
- maximum scene size and lease duration; and
- split/right-side capability.

## Proposed command families

Host to keyboard:

```text
GET_CAPABILITIES
CLAIM
RENEW
RELEASE
SET_CELLS
BEGIN_SCENE
COMMIT_SCENE
START_EFFECT
STOP_EFFECT
CLEAR
GET_STATE
```

Keyboard to host:

```text
KEY_DOWN
KEY_UP
MODE_ENTERED
MODE_EXITED
LEASE_EXPIRED
ERROR
```

The wire format is not yet frozen. Commands must be versioned, bounded, and
idempotent where practical.

## Rendering

The renderer composes visual owners in a fixed order:

1. battery and electrical safety;
2. MoErgo diagnostic indicators;
3. active control-surface scene;
4. ordinary user underglow;
5. off.

The initial effect vocabulary should remain small:

- solid;
- pulse;
- blink and double blink;
- chase;
- progress; and
- transition.

## ZMK integration

Most functionality belongs in an out-of-tree ZMK module:

- devicetree cell maps;
- control-mode behavior;
- surface-key behavior;
- renderer and animation engine;
- protocol state and leases; and
- tests.

Current ZMK does not expose a module hook for extending its shared HID report
descriptor and matching USB/BLE handlers. A small, auditable patch is therefore
expected at the HID transport boundary.

## Explicitly excluded

The host protocol must not expose:

- arbitrary behavior invocation;
- bootloader or reset commands;
- Bluetooth bond/profile deletion;
- flash/settings writes;
- unbounded LED brightness; or
- an unrestricted raw memory or device API.
