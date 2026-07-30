# Milestone 3 verification

## Outcome

The host has a complete 80-cell HID path, but it remains inert by default and
correctly identifies the keyboard currently connected to this Mac as the
legacy six-cell experiment. No LED write or firmware flash was performed.

## Contract

- HID reports are 64 API bytes total: one nonzero report ID plus 63 packet
  bytes.
- Feature report 8 is a static, read-only capability response.
- Capabilities identify protocol, topology, and the exact eight-byte firmware
  build ID.
- Complete scenes are sorted by public cell ID, divided into exactly fourteen
  canonical fragments for 80 cells, and followed by one checksum-protected
  atomic commit.
- A right half has an explicit state: absent, incompatible, syncing, applied,
  or power-limited. A generation alone is never interpreted as current
  connectivity.
- Scene generation is an opaque equality token. Reusing one token for changed
  content is rejected by the host.
- The session ID survives transient handle reconnects; a new host may not
  silently steal a live lease.

## Closed adversarial findings

- Lifecycle epochs and serialized teardown prevent a delayed connection or
  fragment stream from committing after Disable.
- One monotonic 1.5-second deadline bounds an entire HID exchange.
- Responses must match packet sequence, session, expected kind, and (for
  errors) request kind.
- Capability admission requires all 80 cells, `maxSceneCells == 80`, a usable
  lease, both effects, input events, and current right-half acknowledgement.
- VID/PID and the feature contract are authoritative; product and serial text
  are optional.
- HIDAPI writes must accept the exact report length.
- Renewal scheduling uses the device-confirmed remaining lease.
- Pause copy no longer claims a disconnected right half cleared immediately.

## Tests

The deterministic fake covers complete and partial scenes, all 80 public cell
IDs, coalescing, pause/close, renewal, cable loss, bounded reconnect, capability
refusal, generation-content conflicts, logical-session retention, and Disable
during an in-flight fragment.

The shared protocol suite freezes wire vectors, strict padding, static
capability discovery, canonical ordering, fragmentation, and clear.

## Hardware evidence

The packaged read-only probe found USB `Glove80 Left`, VID `16c0`, PID `27db`,
serial `moergo.com:GLV80-8724BC489C30D56E`, and legacy feature report 5 with
six controlled cells. It emitted no output report and left LEDs unchanged.
The generic 80-cell path therefore refuses the currently flashed firmware.
