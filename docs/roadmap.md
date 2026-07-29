# Roadmap

This roadmap orders risk reduction, not feature desirability.

## Phase 0 — specification and simulation

- Freeze terminology and capability model.
- Specify protocol framing, leases, and scene semantics.
- Build a simulated 80-cell device.
- Prototype broker/plugin lifecycle against the simulator.
- Design the layout editor without hardware writes.

## Phase 1 — six-cell USB proof

- Extract the existing six-cell renderer into a generic module.
- Preserve the proven vendor-HID USB output path.
- Add strict capability identity and atomic updates.
- Validate exact-cell rendering, restore, timeout, and power behavior.
- Add one reference plugin.

## Phase 2 — interactive control mode

- Add vendor key-down/key-up input reports.
- Add generated control layer and configurable trigger.
- Implement fail-open lease expiry.
- Complete the editor's page and binding workflow.

## Phase 3 — full left half

- Map all 40 left cells.
- Add chunked scenes and firmware-local effects.
- Measure USB traffic, animation cost, power, and latency.

## Phase 4 — right half

- Install the renderer on both halves.
- Add a dedicated semantic scene command to the split transport.
- Verify reconnection, queueing, generation, and independent battery behavior.

## Phase 5 — Bluetooth and portability

- Validate HID output and input reports over macOS Bluetooth.
- Document descriptor-cache and re-pairing behavior.
- Measure radio and animation power impact.
- Evaluate Windows and Linux broker backends.

## Later

- Signed plugin packages.
- Portable/exportable page profiles.
- Additional supported ZMK keyboards through topology descriptors.
- Optional interoperability adapters such as OpenRGB.
