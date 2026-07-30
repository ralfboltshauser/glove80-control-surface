# Roadmap

The canonical, checkable delivery plan is
[MILESTONES.md](../MILESTONES.md). It replaces the earlier macOS-native roadmap
so implementation status and acceptance evidence have one source of truth.

The order is:

1. evidence, cross-platform architecture, and bootable monorepo;
2. complete simulated product vertical slice;
3. dynamic Codex discovery and capability-honest live status;
4. the existing six-cell HID path;
5. generic 80-cell, both-half firmware and one-shot interaction;
6. platform/accessibility hardening and a strict Calendar ship/defer gate; and
7. signed, clean-machine release validation.

Every milestone follows the same loop:

```text
re-check evidence and assumptions
→ update docs and acceptance criteria
→ implement a vertical slice
→ run automated and end-to-end checks
→ run adversarial and visual reviews
→ close blocking findings
→ mark complete
```

The sequence deliberately exercises the same ports against deterministic fakes
before touching firmware. Expanding from the proven six-cell fixture to 40 and
then 80 cells must not require redesigning the application.

No milestone permits automatic flashing, Bluetooth pairing changes, or false
claims about unobserved Codex states. The user must explicitly approve any
firmware flash after reproducible artifacts and recovery instructions exist.
