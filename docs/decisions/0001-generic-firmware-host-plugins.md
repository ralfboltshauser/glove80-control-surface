# ADR 0001: Generic firmware, host-side plugins

- Status: Accepted
- Date: 2026-07-29

## Context

Application-specific state changes frequently, while keyboard firmware updates
are comparatively disruptive. Encoding applications or their states in
firmware would couple releases and require unnecessary flashing.

## Decision

Firmware exposes generic cells, key events, rendering primitives, capabilities,
and leases. Application integrations are desktop plugins. Key-to-plugin
bindings are stored by the desktop broker.

## Consequences

- New plugins and bindings do not require firmware changes.
- A standalone broker is required for application state.
- Firmware remains useful to applications not known when it was built.
- The broker must resolve plugin conflicts and stale state.
