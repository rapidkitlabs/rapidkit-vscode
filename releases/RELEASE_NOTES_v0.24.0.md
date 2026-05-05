# Release Notes - v0.24.0 (May 5, 2026)

## ✦ Decision Clarity Loop Completion + Enterprise Readiness Gate

### Summary

This release ships the full CLC1-7 closure in Incident Studio: strict decision clarity grammar, pre-execution mutation blocking, deterministic phase-next-action routing, outcome KPI gate integration, UX mode enforcement, and complete artifact success-criteria rendering.

---

### Added

- **Decision clarity grammar contract (CLC1)**
  Added one explicit decision-clarity response structure across actionable Incident Studio outputs.

- **Outcome KPI computation module (CLC5)**
  Added outcome-quality KPI computation and fixture-backed telemetry records for release gates.

- **Artifact criteria + UX mode adapters (CLC6/CLC7)**
  Added dedicated adapters for mode policy and per-artifact success criteria evaluation.

---

### Changed

- **Pre-execution mutation safety (CLC2)**
  Decision-clarity required fields are now enforced before mutation-ready completion claims.

- **Deterministic phase progression (CLC3)**
  Phase rail and next-action guidance now consume deterministic policy logic.

- **Release gate hard checks (CLC5)**
  Outcome-based KPI thresholds are now part of mandatory `overallPass` evaluation.

- **Artifact evidence rendering (CLC7)**
  All five artifact kinds now surface explicit pass/fail/partial criteria in UI.

---

### Fixed

- **Decision clarity host/webview dead path**
  Fixed payload wiring so clarity evidence is emitted in action result contracts.

- **Mode bypass and UI status gaps**
  Fixed multi-CTA mode-policy bypass and missing criteria status styles.

---

### Validation Snapshot

- `npm run test` -> 644/644 pass
- `npm run build && npm run compile && npm run package` -> pass
