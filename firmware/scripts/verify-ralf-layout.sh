#!/bin/sh
set -eu

expected_keymap=732b79ad73a3b93d74c5fc6d3002411a4dfd7e4338149b77922bad7105479410
expected_json=aa4de7a2e830fa70462cc3a6f1779b97c335de045edf5a7dbdb2ed9c156f91d3

keymap_path=${1:-"/Users/ralf/Downloads/fe5af554-f9e7-4db1-a4dc-e99d817603fd_Ralf Custom Swiss v8.keymap"}
json_path=${2:-"/Users/ralf/Downloads/fe5af554-f9e7-4db1-a4dc-e99d817603fd_Ralf Custom Swiss v8.json"}

test -f "$keymap_path"
test -f "$json_path"

actual_keymap=$(shasum -a 256 "$keymap_path" | awk '{print $1}')
actual_json=$(shasum -a 256 "$json_path" | awk '{print $1}')

test "$actual_keymap" = "$expected_keymap"
test "$actual_json" = "$expected_json"

printf '%s\n' "Verified Ralf Custom Swiss v8"
printf '%s\n' "keymap $actual_keymap"
printf '%s\n' "json   $actual_json"
