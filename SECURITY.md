# Security policy

## Reporting

Do not open a public issue for a vulnerability that could cause unintended
keystrokes, expose integration credentials, alter Bluetooth bonds, flash the wrong
half, bypass brightness limits, or leave a keyboard unusable.

Until a private reporting channel is published, contact the repository owner
through the private contact method on their GitHub profile.

## Scope

Security-sensitive surfaces include:

- HID report validation;
- desktop application and future local IPC boundaries;
- integration isolation and credentials;
- firmware build provenance;
- artifact side/board validation;
- flashing and rollback; and
- fail-open lease behavior.

No released or supported version exists yet.
