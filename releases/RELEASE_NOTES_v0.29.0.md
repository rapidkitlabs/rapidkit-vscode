# Release Notes

## v0.29.0 (May 19, 2026)

### AI Stability And Enterprise Typing Hardening Release

Summary:
- This release packages the full git range from v0.28.0 to current HEAD for publication as 0.29.0.
- Focus remains reliability-first hardening across AI runtime and command execution surfaces.
- No expansion-oriented risk was introduced in this release window.

Highlights:
- Commit range included (v0.28.0..HEAD):
  - e68f54e refactor(stabilization): inline ui preference workspace path resolver
  - 8c3bd0b refactor(stabilization): inline workspace project discovery deps wrapper
  - 1c65c59 refactor(stabilization): inline incident primary cta experiment variant wrapper
  - f275da1 refactor(stabilization): extract telemetry workspace path resolver helper
  - 25f6410 refactor(stabilization): inline nonce generation helper
  - 4283cbd refactor(stabilization): inline prediction confidence band helper
  - ea32346 refactor(stabilization): inline incident rollback protected path helper
  - e8c9162 refactor(stabilization): inline incident rollback approval/protection helpers
  - 6ec502a refactor(stabilization): inline chatbrain fallback helper calls
  - 2e7526c refactor(stabilization): inline sandbox verify helper calls
  - 396efbe refactor(stabilization): inline ui preference helper calls
  - 1a65fca refactor(stabilization): extract chatbrain request tracking helpers
  - 4a92cbd refactor(stabilization): extract sandbox verify parsing helpers
  - c1013c7 refactor(stabilization): extract chatbrain fallback helpers
  - db82945 refactor(stabilization): extract ui preference helpers from welcome panel
  - a03b363 refactor(stabilization): extract telemetry experiment helpers from welcome panel
  - 7d725cb refactor(stabilization): split incident policy helpers from welcome panel
  - 7df368e refactor(stabilization): reduce any debt in extension lifecycle and setup panel
  - 423f4a1 refactor(stabilization): enforce lint budget and harden workspace operations
  - 0ea490d refactor(stabilization): tighten command item typing in workspace selection
  - d8ec173 refactor(stabilization): harden createWorkspace typing contracts
  - ef7602d fix(stabilization): harden gates typing and observability
  - 5d83228 chore: harden release gate, memory policy, and repro-pack safety
- AI runtime hardening:
  - stream timeout/cancellation lifecycle safeguards in host AI execution
  - deterministic model matching behavior and safer fallback handling
  - duplicate stream-done prevention and stronger defensive parsing in welcome panel paths
- Command and contract hardening:
  - typing cleanup and guarded narrowing in addModule, createProject, workspaceSelection, doctor, and related command integrations
  - stricter provider contract compatibility between selection commands and extension wiring
  - incident export provenance typing improvements for stable payload handling
- New support module:
  - src/ui/panels/welcomePanelChatBrainTracking.ts

Validation:
- npm run compile passed.
- npm run test passed.
- Lint remains warning-only for known backlog debt outside this release scope.

Release posture: stabilization-only
