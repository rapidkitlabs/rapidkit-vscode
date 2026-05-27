# Release Notes — v0.30.0

Date: 2026-05-27

Summary:
- Studio: clarify structured AI response cards and improved card semantics.
- AI: improve chat clarity, stream timeout handling, and add an output quality gate.
- AI: surface modal evidence contract used by incident workflows and debug flows.
- Editor: enrich AI debug actions and the architecture lens surface for better debugging.
- Incident: harden verify-first release gates and related verification flows.
- Workspace: add snapshot recovery and import hardening to improve robustness of workspace imports.
- Chore: migrate organization and documentation domain references to rapidkitlabs / www.workspai.com.

Commit-level audit (most recent 8 commits):

- `ce4ee8b` — feat(studio): clarify structured AI response cards
- `e1daab1` — fix(ai): improve chat clarity and stream timeout
- `d630705` — feat(ai): surface modal evidence contract
- `aeebc0b` — feat(editor): enrich AI debug actions and architecture lens
- `262f407` — fix(incident): harden verify-first release gates
- `551a9d1` — feat(ai): add output quality gate
- `6709580` — feat(workspace): add snapshot recovery and import hardening
- `59aa208` — chore: migrate organization and domain references

Notes:
- This release focuses on stabilization and reliability across AI, editor, and incident flows while also completing organizational/domain migration work.
- Build and verification: run `npm run compile` and `npm run build` before publishing the VSIX or creating the marketplace release.

---
