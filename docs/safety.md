# Safety model

## Failure principle

The system fails open to normal keyboard behavior.

If the desktop application disappears, the USB cable is removed, or a lease
expires:

- the scene/session expires;
- the one-shot Control layer exits;
- no new surface presses are intercepted;
- already-started surface gestures are cancelled, not converted into typing;
- temporary pixels are cleared;
- effective LED power is recomputed from the current user RGB and diagnostic
  state rather than restored from a stale snapshot; and
- no persistent keymap, Bluetooth, or RGB setting is changed.

The press/release transition across expiry is covered by source inspection,
successful compilation, and host state-machine tests. There is not yet a
firmware runtime harness for the ZMK work-queue path, so the grouped alpha5
hardware gate must still validate it on the physical keyboard.

A malformed packet is rejected and does not renew the lease. It records an
error but does not immediately tear down an otherwise valid session; recovery
still occurs no later than expiry.

## Firmware controls

- Fixed allowlist of addressable cells.
- Maximum channel brightness.
- Maximum lease; an effect cannot outlive its leased scene.
- Strict message length, version, flag, and checksum validation, plus
  idempotent replay of the immediately previous request. Protocol 2 relies on
  the single host owner to serialize requests; it does not enforce monotonic
  request sequences or generation freshness in firmware.
- Atomic scene commit.
- Independent frame-wide current budgets on both 40-cell halves.
- Battery-level suppression and existing Glove80 electrical limits.
- No host command for reset, bootloader, bonds, settings, or arbitrary behavior
  invocation.

## Build and flash controls

- Pin MoErgo/ZMK and toolchain revisions.
- Record source and configuration hashes.
- Build left and right artifacts separately.
- Encode and validate target side in an external manifest.
- Retain known-good artifacts when they exist, or retain enough pinned source
  and configuration to reproduce them.
- Require an explicit user action before every flash.
- Verify device capabilities after reboot.

A running keyboard generally cannot provide a backup of its current application
firmware. “Rollback” must never imply that such a backup was captured.

## Desktop controls

- One application process is the intended session owner. `OPEN`/`BUSY` prevents
  accidental concurrent sessions but is not an OS security boundary.
- Built-in integrations receive no device or flashing authority.
- Credentials use the system credential store and are omitted from exports.
- State expires when its source disconnects.
- Logs redact credentials and user content by default.
- A same-user local process that can open the vendor HID endpoint remains
  inside the initial trust boundary; a session ID is identity, not
  authentication.

## Hardware risk

Ordinary UF2 flashing and Bluetooth re-pairing are normally recoverable but
disruptive. Firmware can still create hardware risk through invalid pin, power,
or brightness configuration. Electrical constraints and board definitions are
therefore safety-critical and must not be overridden.
