# ADR 0003: Plugin bindings live on the host

- Status: Accepted
- Date: 2026-07-29

## Context

Plugin identifiers, credentials, resources, and state are meaningful only when
the desktop runtime is present. Persisting them in keyboard flash would add
wear, migrations, capacity limits, and stale configuration.

## Decision

Store pages, plugin bindings, resources, and visual overrides in the desktop
broker. Firmware stores only topology and safety capabilities compiled for the
device.

## Consequences

- Rebinding is immediate and flash-free.
- The same firmware supports many plugin configurations.
- A computer without the broker sees an ordinary keyboard.
- Portable profiles require an explicit export/import feature later.
