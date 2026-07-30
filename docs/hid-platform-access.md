# HID platform access

The application talks only to the Glove80 left half with USB vendor/product
ID `16c0:27db`, then requires the read-only protocol capability feature before
enabling any write. Product names and serial strings are diagnostic metadata,
not identity requirements.

## macOS

The packaged Electron application uses HIDAPI in non-exclusive mode. This was
verified read-only against Ralf's connected `Glove80 Left`; ordinary keyboard
input remained available. A Developer ID build should not require Input
Monitoring merely to access the vendor report. If macOS refuses the device,
the app must remain in Simulator and show the underlying open error. It must
not ask the user to unpair Bluetooth or grant broad Accessibility access as a
workaround.

## Windows

HID-class devices normally use the inbox Windows HID driver; the application
must not replace it with WinUSB. The capability feature is authoritative
because collection usage and product strings can differ between HIDAPI
backends. Windows hardware access remains a release-candidate verification
gate even though the native module loads in packaged CI.

## Linux

Distribution packages may need a narrowly scoped udev rule:

```udev
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="16c0", ATTRS{idProduct}=="27db", TAG+="uaccess"
```

This grants the active local session access only to the known Glove80 left
VID/PID. Do not use a wildcard HID rule, world-writable mode, or a rule that
matches every MoErgo device. After installing a rule, reconnecting USB (or
reloading udev as an administrator) is an explicit user action. Without
permission, the product remains fully usable in Simulator.

## Failure behavior

- Enumeration and feature reads are read-only.
- Real output is disabled until the user explicitly enables it.
- Missing, ambiguous, legacy-six, or incompatible firmware never falls back
  to an unrestricted HID target.
- Link loss retains the logical leased session ID and reconnects with a full
  desired scene.
- Disable serializes behind an active exchange, requests session close, and
  relies on independent firmware expiry if the cable is already gone.
