# Release Notes v0.31.0

## v0.31.0 (May 31, 2026)

### ✦ Stable Analyze Integration and Incident Studio Reuse

Summary:
- Moved the analyze workflow out of the Incident Studio redesign path and into the stable `WelcomePanel` / `AIIncidentStudio` experience.
- Added a modular analyze helper and stable message handlers for `runAnalyze`, `loadReport`, and `revealEvidence`.
- Added a dedicated `Workspace Live Diagnosis` analyze card, including run-analyze guidance and retry support.
- Improved missing-analyze handling so users are prompted to run `rapidkit analyze` instead of seeing an empty state.

Notable changes:
- `src/ui/panels/incidentStudioAnalyze.ts` now centralizes analyze report loading and command execution.
- `src/ui/panels/welcomePanel.ts` and `webview-ui/src/App.tsx` now handle stable analyze lifecycle messages.
- `webview-ui/src/components/AIIncidentStudio.tsx` now renders a dedicated analyze card within the stable incident diagnosis panel.

Validation:
- `npm run compile` recommended.
- `npm run test` recommended.
