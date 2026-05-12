# Workspai VS Code Extension v0.27.3

Release date: 2026-05-12

## Summary

This release is a stabilization-heavy patch focused on Incident Studio trust guarantees, deterministic release gates, and boundary-safe workspace behavior.

## What is new

- Incident Studio trust and claim coherence hardening:
  - success claims are blocked when NO-GO evidence or verify-gate blockers exist
  - GO is shown as HOLD when verify completion gates are not satisfied
  - guided mode is deterministic (next + verify) and hides dense board panel
- Portable command transport is enforced (`npx --yes --package rapidkit rapidkit ...`) while UI command display stays readable (`rapidkit ...`).
- Stabilization KPI model expanded with anti-false-positive controls:
  - route fallback non-success share
  - verify incomplete warning rate
  - top verify-path miss reason share
- New Incident Studio support modules:
  - `src/ui/panels/incidentStudioPolicyGates.ts`
  - `src/ui/panels/incidentStudioResponseValidator.ts`
  - `src/ui/panels/incidentStudioVerifyRerun.ts`
  - `src/ui/panels/incidentStudioVerifyDiff.ts`
  - `src/ui/panels/incidentStudioEvidenceMapping.ts`
  - `src/ui/panels/incidentStudioEvidenceProvenance.ts`
  - `src/ui/panels/incidentStudioConfidenceUI.ts`
  - `src/ui/panels/incidentStudioExportProvenance.ts`
- New core contract/tooling modules:
  - `src/core/backendFrameworkContract.ts`
  - `src/core/verifyPackContractExporter.ts`
  - `src/core/workspaceHygieneProbes.ts`
- Shared parity snapshot automation:
  - `contracts/backend-import-stack-parity.snapshot.json`
  - `scripts/sync-import-stack-parity-snapshot.mjs`
  - `npm run sync:parity-snapshot`
  - `npm run check:parity-snapshot`
- Workspace membership fallback now uses normalized boundary-safe checks in `src/utils/findWorkspace.ts` (fixes prefix-collision false positives).
- CI smoke workflow hardening:
  - release-stop-gate runs without KPI bypass
  - `format:check` added in smoke matrix (non-Windows)

## Test and quality coverage added

- New tests:
  - `src/test/AIIncidentStudio.component.test.ts`
  - `src/test/AIIncidentStudio.interaction.test.ts`
  - `src/test/findWorkspace.test.ts`
  - `src/test/importStackParity.snapshot.test.ts`
  - `src/test/verifyPackContractExporter.test.ts`
  - `src/test/workspaceHygieneProbes.test.ts`
  - `src/test/incidentStudioConfidenceUI.test.ts`
  - `src/test/incidentStudioEvidenceMapping.test.ts`
  - `src/test/incidentStudioEvidenceProvenance.test.ts`
  - `src/test/incidentStudioExportProvenance.test.ts`
  - `src/test/incidentStudioPolicyGates.test.ts`
  - `src/test/incidentStudioResponseValidator.test.ts`
  - `src/test/incidentStudioVerifyDiff.test.ts`
  - `src/test/incidentStudioVerifyRerun.test.ts`

## CI release fixtures enforced

- `releases/wave3-kpi-marker.json`
- `releases/wave3-claim-checklist.md`
- `releases/wave3-enterprise-gate.json`
- `releases/release-posture-label.md`

## Governance posture

- Release posture: `stabilization-only`
