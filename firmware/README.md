# Glove80 firmware extension

This directory is a reproducible patch/build boundary around MoErgo's official
ZMK fork. It is not a vendored fork.

Pinned upstream:

```text
repository  https://github.com/moergo-sc/zmk
commit      2f73a230e2fc7b2bd64a9736181e87bf54338131
toolchain   Zephyr SDK 0.16.3
```

The build script accepts a MoErgo Layout Editor `.keymap` as immutable input.
For Ralf's hardware proof it refuses anything except the recorded Swiss v8
SHA-256. It never rewrites the export and does not contain any flash command.

Artifacts are complete pairs:

- `glove80_lh.uf2` — USB host protocol, left compositor, split coordinator;
- `glove80_rh.uf2` — right compositor, split snapshot receiver, independent
  lease.

Both halves must use the same build ID. Ordinary typing remains the four
original Base, Lower, Magic, and Factory layers unless the separately generated
momentary interaction layer is active.

No artifact in this directory is permission to flash. The release manifest,
tests, and recovery images must be reviewed first, followed by explicit user
approval.
