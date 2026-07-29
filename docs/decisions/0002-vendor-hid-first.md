# ADR 0002: Vendor HID over USB first

- Status: Accepted for the first hardware proof
- Date: 2026-07-29

## Context

The protocol needs low-rate bidirectional commands, no custom kernel driver,
and a safe path from macOS to ZMK. A six-cell vendor HID output report has
already been observed and exercised on the target hardware.

ZMK Studio provides serial USB and custom BLE GATT transports, but no lighting
RPC. Extending it adds protobuf, locking, CDC, and a second macOS transport
backend.

## Decision

Use a vendor-defined HID collection over USB for the first implementation.
Treat Bluetooth HID as a separate later validation target.

## Consequences

- The host can use standard HID user-space APIs.
- A small ZMK core patch is required for the descriptor and report handlers.
- BLE descriptor caching must be handled before Bluetooth support is promised.
- The protocol stays deliberately smaller than a general RPC system.
