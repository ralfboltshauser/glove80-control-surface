# Contributing

Glove80 Control Surface is currently specification-first. Before implementing a
large component, open an issue describing the user outcome, affected safety
invariants, and smallest hardware-independent validation.

## Pull requests

- Keep firmware application-agnostic.
- Preserve normal typing behavior and fail-open recovery.
- Do not add automatic flashing or destructive ZMK commands.
- Cite primary documentation or source for hardware and protocol claims.
- Add or update an architecture decision when changing a foundational boundary.
- Explain how the change was tested without hardware before requesting a flash.

## Commit style

Use concise imperative subjects, for example:

```text
Specify atomic scene commits
Add simulated six-cell surface
Reject expired broker leases
```

## Hardware work

Never ask contributors to disable Glove80 current/brightness limits. Any
firmware artifact intended for testing must identify its source revision,
configuration hash, target side, and rollback path.
