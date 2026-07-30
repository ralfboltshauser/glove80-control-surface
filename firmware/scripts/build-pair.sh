#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  printf '%s\n' "usage: build-pair.sh <surface|recovery> <output-directory>" >&2
  exit 2
fi

kind=$1
output_directory=$2
script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$script_directory/../.." && pwd)
case "$output_directory" in
  /*) ;;
  *) output_directory="$(pwd)/$output_directory" ;;
esac

: "${ZMK_SOURCE:?set ZMK_SOURCE to the pinned MoErgo ZMK checkout}"
: "${ZEPHYR_BASE:?set ZEPHYR_BASE to the west workspace zephyr directory}"
: "${ZEPHYR_SDK_INSTALL_DIR:?set ZEPHYR_SDK_INSTALL_DIR to Zephyr SDK 0.16.3}"

expected_zmk_commit=2f73a230e2fc7b2bd64a9736181e87bf54338131
expected_zephyr_commit=dacab4875df72109b96cc8977547a0dc04875bcd
expected_surface_diff=dbd06aa9c363fae57cb9dc706c15bd47154eb5dcba00589b3fa7212bef8bf3e3

cmake_bin=${CMAKE_BIN:-cmake}
ninja_bin=${NINJA_BIN:-ninja}
west_python=${WEST_PYTHON:-python3}
input_keymap="$repository_root/firmware/input/ralf-custom-swiss-v8.keymap"
derived_keymap="$output_directory/input/ralf-custom-swiss-v8-control.keymap"

test "$(git -C "$ZEPHYR_BASE" rev-parse HEAD)" = "$expected_zephyr_commit"
test "$(tr -d '\r\n' < "$ZEPHYR_SDK_INSTALL_DIR/sdk_version")" = "0.16.3"

if [ -e "$output_directory/lh" ] || [ -e "$output_directory/rh" ]; then
  printf '%s\n' "refusing non-empty build target: $output_directory" >&2
  exit 2
fi

case "$kind" in
  surface)
    git -C "$ZMK_SOURCE" merge-base --is-ancestor \
      "$expected_zmk_commit" HEAD
    test -z "$(git -C "$ZMK_SOURCE" status --porcelain)"
    actual_surface_diff=$(
      git -C "$ZMK_SOURCE" diff --binary "$expected_zmk_commit"..HEAD |
        shasum -a 256 | awk '{print $1}'
    )
    test "$actual_surface_diff" = "$expected_surface_diff"
    mkdir -p "$output_directory/input"
    node "$script_directory/generate-control-keymap.mjs" \
      "$input_keymap" "$derived_keymap"
    keymap=$derived_keymap
    ;;
  recovery)
    actual_commit=$(git -C "$ZMK_SOURCE" rev-parse HEAD)
    test "$actual_commit" = "$expected_zmk_commit"
    test -z "$(git -C "$ZMK_SOURCE" status --porcelain)"
    keymap=$input_keymap
    ;;
  *)
    printf '%s\n' "kind must be surface or recovery" >&2
    exit 2
    ;;
esac

build_half() {
  side=$1
  board="glove80_$side"
  build_directory="$output_directory/$side"
  set -- \
    -S "$ZMK_SOURCE/app" \
    -B "$build_directory" \
    -GNinja \
    "-DBOARD=$board" \
    "-DBOARD_ROOT=$ZMK_SOURCE/app" \
    "-DKEYMAP_FILE=$keymap" \
    "-DZEPHYR_BASE=$ZEPHYR_BASE" \
    "-DZEPHYR_SDK_INSTALL_DIR=$ZEPHYR_SDK_INSTALL_DIR" \
    -DZEPHYR_TOOLCHAIN_VARIANT=zephyr \
    "-DWEST_PYTHON=$west_python" \
    "-DCMAKE_MAKE_PROGRAM=$ninja_bin"

  if [ "$kind" = surface ]; then
    set -- "$@" \
      "-DEXTRA_CONF_FILE=$repository_root/firmware/config/control-surface.conf;$repository_root/firmware/config/control-surface-$side.conf"
  fi

  "$cmake_bin" "$@"
  "$cmake_bin" --build "$build_directory"
}

build_half lh
build_half rh

cp "$output_directory/lh/zephyr/zmk.uf2" \
  "$output_directory/glove80_${kind}_lh.uf2"
cp "$output_directory/rh/zephyr/zmk.uf2" \
  "$output_directory/glove80_${kind}_rh.uf2"

printf '%s\n' "Built $kind pair without flashing:"
printf '%s\n' "$output_directory/glove80_${kind}_lh.uf2"
printf '%s\n' "$output_directory/glove80_${kind}_rh.uf2"
