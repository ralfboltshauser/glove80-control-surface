# Safety model

## Failure principle

The system fails open to normal keyboard behavior.

If the broker disappears, the USB cable is removed, a packet is malformed, or
a lease expires:

- control-surface ownership ends;
- intercepted control keys stop being intercepted;
- temporary pixels are cleared;
- the prior physical LED power state is restored; and
- no persistent keymap, Bluetooth, or RGB setting is changed.

## Firmware controls

- Fixed allowlist of addressable cells.
- Maximum channel brightness.
- Maximum lease and animation duration.
- Strict message length, version, flag, and sequence validation.
- Atomic scene commit.
- Battery-level suppression and existing Glove80 electrical limits.
- No host command for reset, bootloader, bonds, settings, or arbitrary behavior
  invocation.

## Build and flash controls

- Pin MoErgo/ZMK and toolchain revisions.
- Record source and configuration hashes.
- Build left and right artifacts separately.
- Encode and validate target side.
- Retain rollback artifacts.
- Require an explicit user action before every flash.
- Verify device capabilities after reboot.

## Desktop controls

- One broker owns the device.
- Local RPC is authenticated and access-controlled.
- Plugins run without device or flashing authority.
- State expires when its source disconnects.
- Logs redact credentials and user content by default.

## Irreversible operations

No known development step requires an irreversible hardware operation.
Firmware flashing and Bluetooth re-pairing are recoverable but disruptive and
must remain explicit. Electrical limits must not be overridden.
