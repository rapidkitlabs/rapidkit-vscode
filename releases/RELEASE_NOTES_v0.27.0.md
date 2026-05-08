# Workspai v0.27.0 Release Notes

**Release Date:** May 8, 2026  
**Version:** 0.26.0 → 0.27.0  
**Release Posture:** `stabilization-only`  
**Quality Gates:** typecheck ✓ | build ✓ | package ✓ | 731/731 tests ✓ (66 files)

---

## Executive Summary

This release ships **enterprise-grade stabilization hardening** across routing, UI phase gates, telemetry integrity, test reliability, and import stack coverage. No net-new feature surface is introduced. All changes strengthen existing core loops per the Week 6.5 stabilization directive.

---

## 1. Incident Routing Shared Module

### `src/ui/panels/incidentRouting.ts` (NEW)

Extracted all action-type routing logic from `welcomePanel.ts` into a dedicated shared module.

**Exports:**
- `RoutingResult` type — typed union of all `actionType` values and `fallbackReason` codes
- `routeIncidentActionTypeFromMessage(message)` — deterministic routing function

**Specialist intents added:**

| Intent keywords | Routes to |
|---|---|
| `devops`, `ci/cd`, `pipeline`, `kubernetes`, `helm`, `dockerfile`, `docker compose` | `doctor-fix` |
| `database`, `sql`, `schema`, `migration`, `postgres`, `mysql`, `mongodb` | `change-impact-lite` |
| `documentation`, `readme`, `runbook`, `adr` | `workspace-memory-wizard` |
| `architecture`, `risk`, `blast radius`, `refactor plan` | `change-impact-lite` |

**Terminal-bridge precision:** primary check requires `traceback` / `stack trace` / `exception` or compound `error + context` signals; bare `error` falls to secondary fallback only.

**Fix-preview precision:** requires `preview` or `patch` or `fix + code context keyword`; bare `fix` alone does not route to `fix-preview-lite`.

**Result:** 11/11 routing regression tests pass; tests import real implementation directly.

---

## 2. Scope-Aware Suggested Questions

### `src/ui/panels/welcomePanel.ts` — `_buildSuggestedQuestions`

Method signature extended: `_buildSuggestedQuestions(actionType, message, scopeIntent: 'workspace' | 'project')`.

**Specialist intent branches (before standard action type branches):**

- **DevOps (workspace):** topology-level CI/CD and cross-service deployment questions
- **DevOps (project):** Dockerfile runtime, pipeline stage, cross-service dependency questions
- **Database (workspace):** rollback SQL, migration order, cross-service schema impact questions
- **Database (project):** current migration state, rollback plan, affected service questions
- **Docs (workspace):** workspace topology context, multi-project ADR, runbook coverage questions
- **Docs (project):** per-project ADR, runbook freshness, decision traceability questions
- **Architecture (workspace):** rollout order, topology risk, cross-service coupling questions
- **Architecture (project):** blast-radius scope, verify plan, rollback path questions

**Standard branches** (doctor-fix, change-impact-lite, verify-pack-autopilot, etc.) also produce scope-differentiated question sets.

**Call site:** `scopeIntent` derived from `current.projectPath ? 'project' : 'workspace'` in the chat brain handler.

---

## 3. Phase-Gate UI Alignment

### `webview-ui/src/components/AIIncidentStudio.tsx` — `phaseContext`

Pre-computed telemetry gate signals added before `phaseContext` useMemo:

```typescript
const telemetryHardGatePass = studioHardGateStatus?.gates?.hardGatePass ?? false;
const telemetryRoutePrecisionPass = studioStabilizationKpiStatus?.gates?.routePrecisionPass ?? false;
const telemetryVerifyPathPass = studioStabilizationKpiStatus?.gates?.verifyPathCompletionPass ?? false;
const verifyPackQualityAdequate = studioReproPackKpiStatus?.qualityScore ?? 0;
const workspaceHasPriorResolutions = (verifiedOutcomeLoopStatus?.verifiedOutcomes ?? 0) > 0;
```

**Phase readiness rules:**

| Phase | Gate condition |
|---|---|
| `diagnosisReady` | original signals + `telemetryHardGatePass` as corroborating signal (non-blocking) |
| `planReady` | blocked when `telemetryRoutePrecisionPass === false` AND telemetry data exists |
| `verifyReady` | `qualityScore >= 60` required for verify-pack path; `telemetryVerifyPathPass` as standalone pass |
| `priorResolutionAvailable` | `incidentResume?.resolved || workspaceHasPriorResolutions` |

---

## 4. Data-Driven Action Matrix

### `webview-ui/src/lib/incidentCliActionMatrix.ts`

Canonical CLI action source with stable IDs and resolver functions:

**Entries (workspace scope):**
- `workspace-doctor` → `doctor-workspace-check`
- `workspace-doctor-fix` → `doctor-fix`, `doctor-workspace-fix`
- `workspace-readiness-json`
- `workspace-policy-show` → `view-compliance-report`
- `workspace-sync`

**Entries (project scope):**
- `project-init` → `project-init`
- `project-test` → `project-test`, `verify-pack-autopilot`
- `project-build` → `project-build`
- `project-shell-activate` → `project-shell-activate`
- `project-browser-smoke-test` → `browser-smoke-test`

**Resolver functions:**
- `resolveIncidentCliActionByActionType(actionType, hasProjectSelected)` → `IncidentCliActionEntry | undefined`
- `resolveIncidentCliActionIdByActionType(actionType, hasProjectSelected)` → `string | undefined`
- `buildIncidentCliActionMatrix(hasProjectSelected)` → `{ workspace, project }`

---

## 5. Module Graph Tree

### `webview-ui/src/components/AIIncidentStudio.tsx` — Module graph section

Doctor evidence now includes `installedModules` from registry manifests, grouped by framework in the UI.

**UI features:**
- `doctorModuleGraphByFramework` — useMemo groups projects by detected framework
- Framework dropdown filter (`moduleGraphFrameworkFilter`)
- Severity filter: `all` | `healthy` | `warning` | `critical` (`moduleGraphSeverityFilter`)
- Module search (`moduleGraphSearch`)
- **Stability guard:** `useEffect` auto-resets `moduleGraphFrameworkFilter` to `'all'` when the selected framework is no longer present in the dataset

---

## 6. BYOP Stack Expansion

### `src/commands/importProjectUtils.ts` — `detectProjectStack`

Six new stacks with BYOP-first detection:

| Stack | Detection markers |
|---|---|
| `django` | `manage.py` + `wsgi.py` |
| `flask` | `app.py` with flask import |
| `express` | `package.json` with express dependency |
| `koa` | `package.json` with koa dependency |
| `rails` | `Gemfile` + `config/routes.rb` |
| `dotnet` | `*.csproj` or `*.sln` |

---

## 7. Enterprise Gate Fixtures

**New files in `releases/fixtures/`:**

- `wave2-enterprise-gate.json` — last7d + last30d windows, `consecutiveWindowsPass: 2`, all gates green
- `wave3-enterprise-gate.json` — same structure for wave3 scope
- `release-posture-label.md` — posture: `stabilization-only`

---

## 8. Incident Conversation Metrics

### `src/ui/panels/incidentConversationMetrics.ts` (NEW)

`buildIncidentLifecycleMetrics(input, nowMs)` → `IncidentLifecycleMetrics`

Sanitizes malformed numbers/timestamps before telemetry emission:
- Non-negative integer clamping for counts
- ISO timestamp validation with fallback to `nowMs`
- Prevents NaN or negative duration values from corrupting KPI windows

---

## 9. Incident Resume Snapshot Hardening

### `src/ui/panels/incidentStudioResume.ts`

Added sanitizer functions:
- `toNonNegativeInteger(v)` — clamps to 0 floor
- `toNonNegativeTimestamp(v, fallback)` — validates epoch, falls back to provided timestamp
- `toValidTurns(v)` — clamps turn count between 0 and 9999

`buildIncidentResumeSnapshot` now applies all sanitizers before building the snapshot payload.

---

## 10. Doctor Telemetry Refresh Hardening

### `src/ui/panels/doctorTelemetryRefresh.ts`

- `onError` callback hook added to the debounce refresh controller
- Async catch added in the refresh executor
- Prevents unhandled promise rejections from propagating to the extension host on telemetry refresh failures

---

## 11. Release Gate Workflow Hardening

### `.github/workflows/release-gate-wave2.yml` + `release-gate-wave3.yml`

- Severity parser extracted to shared helper (consistent parse across wave2/wave3)
- Paginated GitHub issue fetch replaces single-page query (prevents missed open P0/P1 issues)
- Fixture fallback paths removed — hard-fail when KPI marker is absent
- `scripts/release-stop-gate.mjs` updated with hardened severity classification

---

## 12. Test Regression Fixes

### `src/test/incidentStudioPromptPolicy.test.ts`

Three route-precision tests updated to read from `incidentRouting.ts` instead of `welcomePanel.ts`:
- `route precision: doctor-fix and recipe-pack routes are reachable`
- `route precision: terminal-bridge requires explicit terminal signal`
- `route precision: fix-preview-lite requires patch context`

These tests were broken after routing was extracted to the shared module.

---

## Test Summary

```
Test Files  66 passed (66)
     Tests  731 passed (731)
  Duration  3.01s
```

---

## Files Changed

**New files:**
- `src/ui/panels/incidentRouting.ts`
- `src/ui/panels/incidentConversationMetrics.ts`
- `src/test/incidentConversationMetrics.test.ts`
- `releases/fixtures/wave2-enterprise-gate.json`
- `releases/fixtures/wave3-enterprise-gate.json`
- `releases/fixtures/release-posture-label.md`

**Modified (key):**
- `src/ui/panels/welcomePanel.ts` — routing delegation, scope-aware suggested questions
- `webview-ui/src/components/AIIncidentStudio.tsx` — phase-gate signals, module graph tree
- `webview-ui/src/lib/incidentCliActionMatrix.ts` — data-driven matrix, resolver functions
- `src/ui/panels/incidentStudioResume.ts` — sanitizers
- `src/ui/panels/doctorTelemetryRefresh.ts` — onError + async catch
- `src/commands/importProjectUtils.ts` — BYOP stacks
- `.github/workflows/release-gate-wave2.yml` / `release-gate-wave3.yml` — hardened gates
- `scripts/release-stop-gate.mjs` — severity parser
- `src/test/incidentStudioPromptPolicy.test.ts` — routing source fix
