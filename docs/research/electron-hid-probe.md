# Electron HID probe against the connected Glove80

Date: 2026-07-30  
Host: Apple-silicon Mac, macOS  
Mutation: none

This probe resolved one narrow architecture question: can the selected
Electron runtime load `node-hid`, enumerate the actual Glove80 vendor
collection, and read its existing capability feature report from a packaged
application?

It did not send an output report, alter a pairing, change keyboard
configuration, install firmware, or flash either half.

## Runtime under test

- Electron `41.5.0`
- Electron Node runtime `24.15`
- N-API `10`
- `node-hid` `3.3.0`
- electron-builder `26.8.1`
- architecture `arm64`

These versions are project-pinned. This result is evidence for this exact
combination, not a promise about every Electron or node-hid version.

## Observed device

The Glove80 was connected over Bluetooth. macOS and `node-hid` exposed these
top-level HID collections:

| Manufacturer | Product | VID | PID | Usage page | Usage | Serial |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| MoErgo | Glove80 | `0x16c0` | `0x27db` | `0x0001` | `0x0006` keyboard | empty |
| MoErgo | Glove80 | `0x16c0` | `0x27db` | `0x000c` | `0x0001` consumer | empty |
| MoErgo | Glove80 | `0x16c0` | `0x27db` | `0xff60` | `0x0001` vendor | empty |

The relevant I/O Registry report descriptor exposes:

- report ID `4`: vendor output report, 24 data bytes;
- report ID `5`: vendor feature report, 16 data bytes.

The empty serial is significant: discovery cannot depend on a serial number.

## Read-only result

`node-hid` opened the vendor collection non-exclusively and read feature report
ID `5`. The result was 17 bytes including the report ID:

```text
05 01 06 20 3c 01 00 00 00 00 00 00 00 00 00 00 00
```

The same read succeeded in two environments:

1. Electron launched from the development probe; and
2. an unpacked arm64 `.app` produced by electron-builder.

This proves that the native module loads and this feature report is readable
from the chosen packaged Electron stack on this Mac. It does not yet prove
output-report behavior, reconnect behavior, lease semantics, Windows/Linux
access, USB access, or Bluetooth stability.

## Architecture implication

The previous architecture treated Electron native HID packaging as an
unresolved reason to keep a separate Rust core. This direct packaged-hardware
probe removes that specific blocker. Electron main can own the future HID
adapter while the sandboxed renderer remains capability-free.

## Safest next hardware experiment

First add read-only discovery and capability parsing to the production HID
adapter with an exact VID/PID/usage/report-length match and a fake transport.
Then show the parsed capability and raw bytes in diagnostics.

Any output write remains a separate experiment:

- announce the exact report and expected bounded effect;
- ensure a lease or explicit clear makes it reversible;
- keep a known-good firmware artifact available; and
- obtain the user's approval immediately before sending it.
