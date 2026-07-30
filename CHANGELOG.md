# Changelog

All notable changes to this project will be documented here.

## Unreleased

- Recorded the alpha6 hardware result: preserved split typing and complete
  left-side control worked, while the twelve-fragment right-side scene
  transfer reproducibly aborted before rendering or acknowledgement.
- Added reproducible alpha7 firmware with a 3.5-second bounded split-transfer
  window inside a 4-second lease reserve, plus encrypted acknowledgement
  permission, without removing either action bank.
- Established the product, architecture, safety, firmware, integration, and roadmap
  specifications.
- Separated ambient display from momentary interaction.
- Set all 80 cells across both halves as the product target while retaining six
  USB cells as the first regression fixture.
- Added future-user requirements and explicit evidence gates for expansion.
- Documented the complete key-to-integration UX using an initial Codex task
  example.
- Planned the native desktop application, MoErgo-inspired visual editor,
  adapter contracts, state flows, tests, and phased delivery.
- Defined the Codex and Calendar v0 user experiences from current primary
  product and platform documentation.
- Generalized bindings from fixed targets to integration-owned source
  selectors so one key can safely represent a fixed Codex task or a changing
  next meeting.
- Replaced manual per-chat Codex setup with a self-maintaining, sticky task
  board whose region may use any ordered subset of the 80 cells.
