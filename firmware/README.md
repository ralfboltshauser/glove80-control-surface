# Glove80 firmware extension

This directory is a reproducible patch/build boundary around MoErgo's official
ZMK fork. It is not a vendored fork.

Pinned upstream:

```text
repository  https://github.com/moergo-sc/zmk
commit      2f73a230e2fc7b2bd64a9736181e87bf54338131
toolchain   Zephyr SDK 0.16.3
```

Create the exact surface source from a clean checkout:

```sh
git checkout 2f73a230e2fc7b2bd64a9736181e87bf54338131
git am /path/to/glove80-control-surface/firmware/patches/0001-leased-glove80-control-surface.patch
git am /path/to/glove80-control-surface/firmware/patches/0002-split-ack-notification.patch
git am /path/to/glove80-control-surface/firmware/patches/0003-harden-leases-and-toggle-control.patch
git am /path/to/glove80-control-surface/firmware/patches/0004-harden-one-shot-interaction-and-split-deadlines.patch
git am /path/to/glove80-control-surface/firmware/patches/0005-add-two-bank-hold-interaction.patch
git am /path/to/glove80-control-surface/firmware/patches/0006-fix-split-scene-delivery-budget.patch
git am /path/to/glove80-control-surface/firmware/patches/0007-fix-split-clear-lease-arithmetic.patch
```

`build-pair.sh surface` then verifies that the checkout is clean and that its
complete diff from the pinned commit has SHA-256
`410853ac090ec6859d161d6917914dce50307df3d179c45375ef7b1fcc9881a2`.
It also verifies the pinned Zephyr revision and SDK version before compiling.

The checked-in MoErgo Layout Editor export is immutable input. The generator
refuses anything except the recorded Swiss v8 SHA-256, preserves the original
four layers except two deliberate Base-layer wrappers, and appends one
generated Control layer. The wrappers preserve `KP_DOT` and `KP_N0` whenever
no leased session exists. No script in this repository flashes a keyboard.

Artifacts are complete pairs:

- `glove80_surface_lh.uf2` — USB host protocol, left compositor, split coordinator;
- `glove80_surface_rh.uf2` — right compositor, split snapshot receiver, independent
  lease.

Both halves are built from the same patch and release identity. Ordinary typing
remains the four original Base, Lower, Magic, and Factory layers. Holding the
printed ↑ key selects the primary bank; holding printed ↓ selects the secondary
bank. Release exits Control, the first modifier wins, and a 30-second fail-safe
prevents a lost release from stranding the layer. Available action masks and
pressed feedback render locally on both halves without a host round trip.

The firmware wire identity is deliberately smaller than the UI model:

- scene cells are raw RGB channels `0..79`;
- interaction events are ZMK positions `0..79`; and
- `topology/glove80-rgb-80-v1.json` maps both to physical keys.

That split lets the desktop calibrate LED order without another flash.

No artifact in this directory is permission to flash. The release manifest,
tests, and recovery images must be reviewed first, followed by explicit user
approval.

## Build boundary

`scripts/build-pair.sh` builds but cannot flash. It requires an existing west
workspace with the MoErgo dependencies and Zephyr SDK 0.16.3:

```sh
ZMK_SOURCE=/path/to/patched/moergo-zmk \
ZEPHYR_BASE=/path/to/west-workspace/zephyr \
ZEPHYR_SDK_INSTALL_DIR=/path/to/zephyr-sdk-0.16.3 \
firmware/scripts/build-pair.sh surface .firmware-build/release
```

Build recovery from an untouched checkout at the pinned commit:

```sh
ZMK_SOURCE=/path/to/untouched/moergo-zmk \
ZEPHYR_BASE=/path/to/west-workspace/zephyr \
ZEPHYR_SDK_INSTALL_DIR=/path/to/zephyr-sdk-0.16.3 \
firmware/scripts/build-pair.sh recovery .firmware-build/recovery
```

The recovery mode refuses a dirty or differently pinned source tree. Verify
the source inputs, both compiled configurations, all 80 generated bindings,
build identity, and artifact hashes with:

```sh
node firmware/scripts/verify-release.mjs \
  .firmware-build/release .firmware-build/recovery
```

Verification also reconstructs each side-labelled UF2, compares it with that
side's compiled binary, checks the side-specific UF2 family, and refuses any
write outside the Glove80 application partition (`0x26000..<0xec000`). It
compares the compiled layouts while allowing exactly the two documented
fallback wrappers, verifies both hold bindings, and whitelists the small
Kconfig delta.
