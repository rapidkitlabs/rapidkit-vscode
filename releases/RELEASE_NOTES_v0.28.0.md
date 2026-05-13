# Workspai VS Code Extension v0.28.0

Release date: 2026-05-13

## Summary

This release includes all commits from tag `v0.27.3` to current `HEAD` and ships the enterprise stabilization slices for E1 plus E2.1 through E2.5.

## Commit range included

- `7ebe77c` chore(ci): harden release gate with open-issue severity enforcement
- `7111314` feat(e1): add versioned cross-service impact score contract v1
- `33aa978` feat(stabilization): complete E1.3 E1.4 E1.5 execution
- `31a1c5d` feat(e2.1): expose local-processing memory policy profile
- `7b828b7` feat(e2.2): enforce workspace memory write access contract
- `be68e00` feat(e2.3): add repro-pack sensitivity labeling end-to-end
- `6969017` feat(e2.4): link memory influence timeline to decision artifacts
- `80ebb71` feat(e2.5): harden memory-export security review coverage

## What is new

- E1 hardening baseline:
  - versioned impact score contract (`v1`) is wired and validated
  - cross-service impact safety and confidence surfaces strengthened

- E2 private-brain and policy boundaries:
  - E2.1 local-processing memory policy profile exposed in host and payload contracts
  - E2.2 workspace memory write-access contract enforced in write paths
  - E2.3 repro-pack sensitivity labels shipped across host -> payload -> UI -> export
  - E2.4 memory influence audit timeline linked to decision artifacts
  - E2.5 memory/export security review coverage hardened with explicit drift/contract checks

- CI/release governance:
  - release-stop gate hardened for open-issue severity enforcement
  - open-issues export script added for deterministic release evidence flow

## Scope highlights (files)

- Host/runtime contracts:
  - `src/ui/panels/welcomePanel.ts`
  - `src/core/workspaceMemoryService.ts`
  - `src/core/systemGraphIndexer.ts`
- Webview contracts and UI:
  - `webview-ui/src/lib/incidentStudioPayload.ts`
  - `webview-ui/src/components/AIIncidentStudio.tsx`
  - `webview-ui/src/App.tsx`
- Repro/export safety:
  - `src/ui/panels/incidentReproPackUtils.ts`
- CI/governance:
  - `.github/workflows/extension-smoke-matrix.yml`
  - `scripts/release-stop-gate.mjs`
  - `scripts/export-open-issues-report.mjs`
- Validation:
  - `src/test/impactScoreScenarioMatrix.test.ts`
  - `src/test/workspaceMemoryService.test.ts`
  - `src/test/incidentReproPackUtils.test.ts`
  - `src/test/incidentStudioPayload.test.ts`
  - `src/test/AIIncidentStudio.interaction.test.ts`
  - `src/test/driftGuard.test.ts`

## Governance posture

- Release posture: `stabilization-only`
