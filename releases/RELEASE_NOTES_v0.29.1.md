# Release 0.29.1 — Stable AI Baseline Patch

Date: 2026-05-23


This release consolidates an important set of stabilization and governance changes applied since `v0.29.0` and publishes the validated stable AI baseline. These are meaningful improvements — not merely trivial edits — and include runtime, contract, and governance hardening across host and webview flows. The new Incident Studio is delivered in-tree as an opt-in experience and does not alter stable AI routing unless explicitly enabled.

Highlights
- AI runtime & streaming hardening (deterministic model selection, robust cancellation/timeouts, safe stream lifecycle, duplicate done prevention).
- Memory policy exposure and write-access contract enforcement across host and payload flows.
- Doctor, provenance, verify gates, and export reliability improvements to reduce false-positive verification claims.
- Incident Studio (vNext) delivered as opt-in (localStorage flag `incident-studio-ui-version`), compiled and included but gated by user choice.
- Localization cleanup and a single deterministic textual ordering alignment to preserve contract tests (no runtime behavior change).

Validation
- `npm run compile` — OK
- `npm run typecheck` — OK
- `npx vitest run` — OK (1013 tests)

Commit-level audit (v0.29.0..HEAD):

- `2ff3a50` — 2026-05-23 — chore: commit rapidkit-vscode stable extension changes; preserve current stable AI feature base
	- Files: `README.md`, `src/commands/aiFreeFeatures.ts`, `src/commands/chatParticipant.ts`, `src/commands/incidentStudioNext.ts`, `src/ui/panels/welcomePanel.ts`, `src/ui/panels/incidentStudioPanel.ts`, webview redesign files under `webview-ui/src/components/StudioRedesign/`, `webview-ui/src/lib/studioFeatureFlags.ts`, `webview-ui/esbuild.js`
	- Impact: High — includes localization cleanup, deterministic textual-order alignment for contract tests (non-functional change), and in-tree Studio redesign (opt-in).

- `ead47c2` — 2026-05-22 — feat(workspace): add autopilot release command integration
	- Files: `package.json`, `src/commands/workspaceOperations.ts`, `src/test/driftGuard.test.ts`, `src/ui/panels/welcomePanel.ts`
	- Impact: Low — release/autopilot integration and test adjustments.

- `05c2c3d` — 2026-05-19 — stabilization: extract creation/report lanes in welcome panel
	- Files: `src/ui/panels/welcomePanel.ts`
	- Impact: Medium — refactors lanes to improve lifecycle clarity.

- `19af650` — 2026-05-19 — stabilization: isolate activation and incident lanes (wave 2)
	- Files: `src/extension.ts`, `src/ui/panels/welcomePanel.ts`
	- Impact: Medium — isolates lanes to reduce startup/incident cross-effects.

- `96a6fab` — 2026-05-19 — fix(stabilization): harden polyglot watchers and AI stream reliability
	- Files: `src/core/aiModelSelection.ts`, `src/core/aiService.ts`, `src/extension.ts`, `src/ui/panels/welcomePanel.shared.ts`, `src/ui/panels/welcomePanel.ts`
	- Impact: High — core AI runtime and model-selection fixes; important for streaming stability and fallback behavior.

Notes
- Release tag: `v0.29.1`
- Release is stabilization-only and intended to preserve the stable AI baseline.
