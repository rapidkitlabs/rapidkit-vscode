# Release Notes - v0.25.0 (May 7, 2026)

## ✦ S01–S05 Full Stabilization Loop — Telemetry Breakdowns + Cohort Validation

### Summary

Completes the full 5-KPI stabilization loop with false-positive protections. Every KPI now has an operational breakdown that prevents aggregate metrics from masking degradation. S01 fallback mix, S02 verify-path miss reasons, S04 recovery class, and S05 artifact-cohort validation are all tracked, exported in snapshot Markdown, and displayed in the Stabilization KPI gate card. Operational docs updated across KPI map, weekly template, 6-week plan, and canonical story.

---

### Added

- **S01 Fallback-reason breakdown**
  `fallbackReasonBreakdown` classifies every `next_action_clicked` event into one of 5 categories:
  - `success` — intended route, no fallback
  - `bare_keyword_only` — keyword-only match, no context
  - `fix_preview_fallback` — code-context fallback path
  - `orchestrate_default` — default orchestration route
  - `other` — unclassified; investigate and reclassify if recurring
  Computed in `workspaceUsageTracker`, surfaced in snapshot export (`S01 fallback mix` line) and card stats row (Sparkles icon).

- **S02 Verify-path miss reasons (top offenders)**
  `verifyPathReasonTop` extracts top-5 miss reasons by count from `verify_passed`/`verify_failed` events where `verifyPathPresent=false`. Snapshot export includes `S02 verify-path misses (top reasons)` line. Card shows miss list with AlertTriangle icon.

- **S04 Recovery class breakdown**
  `recoveryClassBreakdown` segments `rollback_attempted`, `rollback_succeeded`, `rollback_failed` events by `recoveryClass` prop: `auto_rollback`, `manual_recovery`, `unspecified`. Snapshot export includes `S04 recovery class mix` line. Card shows recovery class mix with RotateCw icon.

- **S05 Cohort validation**
  `repeatVerifiedWithArtifactReady` counts `verified_outcome_ready_for_artifact` events where `repeatedIncident=true` AND `replayReady=true`. `repeatVerifiedWithArtifactRate` expresses this as a percentage of `repeatedIncidentDetected`. New **S05-Cohort Repeat with artifact** metric card added to Stabilization KPI gate UI. Snapshot table extended with `S05-Cohort Repeat With Artifact` row.

- **Operational documentation (4 files)**
  - `WORKSPAI_VERIFIED_EXECUTION_LOOP_KPI_MAP.md` — S01–S05 false-positive risk playbooks, threshold rules, 3-cadence review sequence, weekly runbook.
  - `WORKSPAI_WEEKLY_KPI_DASHBOARD_TEMPLATE.md` — S03/S04 recovery class table, S05 cohort table, False-Positive Prevention Checklist (section 11), expanded Quick Runbook (section 10).
  - `WORKSPAI_6_WEEK_LOOP_COMPLETION_PLAN.md` — Operational Discipline section with fallback-mix, verify-path-reason, and release-gate rules.
  - `WORKSPAI_CANONICAL_PRODUCT_STORY.md` — Operational Accountability Anchor section grounding stabilization claims in transparency and auditability.

---

### Changed

- **Stabilization snapshot Markdown** extended with:
  - `S01 fallback mix: success=X, bare_keyword_only=Y, ...`
  - `S02 verify-path misses (top reasons): reason1 (N), reason2 (N), ...`
  - `S04 recovery class mix: auto_rollback=X, manual_recovery=Y, unspecified=Z`
  - `S05-Cohort Repeat With Artifact` row in gate table
  - Repeat incidents line: `X verified / Y with artifact / Z detected`

- **`StudioStabilizationKpiStatus.metrics`** contract extended (all optional, backward-compatible):
  - `fallbackReasonBreakdown?`
  - `verifyPathReasonTop?`
  - `recoveryClassBreakdown?`
  - `repeatVerifiedWithArtifactReady?`
  - `repeatVerifiedWithArtifactRate?`

- **`StudioStabilizationKpiStatus`** types propagated consistently across:
  - `workspaceUsageTracker.ts`
  - `incidentStudioTelemetry.ts`
  - `AIIncidentStudio.tsx`

- **S05 KPI Dictionary status** promoted from `Partial` → `Available` (cohort validation via `verified_outcome_ready_for_artifact` + `replayReady` flag now instrumented).

---

### Validation Snapshot

| Check | Result |
|---|---|
| `npm run compile` | ✅ pass (no TS errors; webview esbuild clean) |
| `npm run lint` | ✅ pass (no ESLint violations) |
| `npm test -- --run` | ✅ 701/701 tests pass |
| S01 fallback breakdown | ✅ computed and exported |
| S02 top miss reasons | ✅ computed and exported |
| S04 recovery class | ✅ computed and exported |
| S05 cohort validation | ✅ `repeatVerifiedWithArtifactRate` computed and card rendered |
| Operational docs sync | ✅ 4 documents updated (KPI map, weekly template, 6-week plan, canonical story) |
