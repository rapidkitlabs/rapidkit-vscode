<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Conversational Create and an embedded CLI authority",
  "summary": "Workspai for VS Code 0.43.0 is verified against CLI 0.64.0 and unifies conversational creation, canonical execution capabilities, and reliable first-run behavior.",
  "highlights": [
    {
      "icon": "🧭",
      "text": "Create understands conversation, clarification, adoption, existing-source work, and creation intent"
    },
    {
      "icon": "🧱",
      "text": "CLI-authored profiles and kits drive one controller-owned creation capability"
    },
    {
      "icon": "🔒",
      "text": "An integrity-checked CLI 0.64.0 runtime ships inside the extension"
    },
    {
      "icon": "🚀",
      "text": "Create, Doctor, Graph, Goal, Agent, and Dashboard work from the same packaged CLI authority"
    },
    {
      "icon": "✅",
      "text": "Python-backed plans validate prerequisites before workspace mutation and return actionable recovery"
    }
  ]
}
-->

# Workspai VS Code v0.43.0

Published.

## Conversational Create and embedded CLI authority

Workspai for VS Code 0.43.0 is validated against Workspai CLI 0.64.0. This
release makes first-run creation understandable to a model, deterministic for
the controller, and reproducible in the packaged extension.

The model can discuss a product idea, ask one useful clarifying question, inspect
portable creation capabilities, and propose an architecture. It cannot directly
invoke arbitrary generators or silently widen authority. The controller validates
the proposal, binds approval to an expiring digest and canonical scope, and then
executes the exact CLI-authored plan.

## Create is conversational before it is mutating

Create no longer treats every message as a scaffold request. Greetings and
product questions remain conversation. Ambiguous requests receive one bounded
next step. Adopt/import requests, work on existing source, architecture advice,
and explicit creation requests follow separate routes.

For a real creation request, the model first reads the current Create surface,
selected workspace and project scope, and the portable capability contract. It
can then propose one workspace profile, primary project, optional companion
projects, and modules supported by the active CLI. The user approves the plan
before any mutation begins.

Approval is tied to the plan digest, immutable Create session, target-aware
destination, and expiration time. Creating a workspace is independent of
volatile sidebar selection. Creating a project requires the active canonical
workspace selected by the user and cannot silently fall back to another or
default workspace. Edited, replayed, concurrent, stale, or cross-workspace
approvals fail closed with a re-draft path. Automatic retry is allowed only when
failure is proven to have occurred before source mutation.

The Workspace/Project selector remains stable while sidebar scope hydrates or a
previous Create conversation is visible. The approval card names the operation
and destination the controller will actually mutate, so an unused model
workspace suggestion can never be presented as a workspace that will be
created.

## One canonical creation architecture

Workspace profiles, executable kits, runtime candidates, default kits, profile
compatibility, and Python-engine requirements come from the CLI 0.64.0 Create
Planner contract. The extension does not maintain a competing framework map.

One controller-owned capability creates the workspace shell, primary project,
companion projects, and canonical Workspace Intelligence evidence. It verifies
workspace markers between phases and stops before further scaffolding if the
preceding phase is incomplete. Partial source output requires review and a fresh
plan instead of an unsafe replay.

Dependency initialization remains a separate, explicit lifecycle operation.
Create produces a synchronized workspace and project boundary; it does not hide
an environment bootstrap behind a successful scaffold result.

## The CLI runtime ships with the extension

The VSIX contains the exact published Workspai CLI 0.64.0 runtime declared by
the extension release policy. Create, adopt, Workspace Intelligence, Doctor,
Graph, Goal, Agent, Dashboard, and Studio capability probes use this same
integrity-bound authority rather than a global installation or mutable `npx`
cache.

The packaged runtime is integrity-checked before activation and fails closed when
its version, files, or contracts are missing or incompatible. Generated
third-party notices and license files travel with the runtime.

Integrated terminals now show the ordinary command surface, such as
`workspai doctor workspace --fix`, instead of exposing a long npm package
launcher. The terminal receives a session-scoped launcher for the same embedded
runtime, so the shorter command does not require a global installation or weaken
the version guarantee.

## Portable prerequisite diagnostics

Python-backed plans validate the selected Python runtime, pip, venv, Poetry, or
pipx prerequisites before workspace mutation. Failures identify the selected
installation method and provide operating-system-specific recovery. Node-only
and non-Python polyglot plans do not install the optional Python engine.

Machine-local paths stay outside model context, user-visible evidence, and
portable workspace artifacts.

## Repair starts from the causal evidence queue

Stale and missing evidence are reconciled by their exact CLI producers before a
model is asked to inspect or change source. Sidebar Studio and native Chat share
the same bounded remediation queue, and Resume continues from that refreshed
state. If no deterministic producer action applies, the model receives the
smallest authorized source scope and the governed patch, command, rollback, and
verification tools.

The Repair view presents only causal producer cards. Explain, Why, and Trace
remain available as inspectable artifacts but no longer duplicate the same root
blocker. Raw freshness timestamps are retained in technical details rather than
used as primary card copy.

## Dashboard follows one evidence generation

Dashboard and Artifacts watch the complete governed state of the selected
workspace and any linked project. A burst of CLI or Studio writes is coalesced,
then all evidence cards are rebuilt from disk as one canonical generation. This
prevents one refreshed card from being shown beside stale dependent cards.

Every contracted card has an explicit state. Share, Recovery Snapshot, and
Import Readiness now remain visible as missing when their producer has not run,
rather than disappearing from the payload. Studio uses the same refresh path
after transaction, repair, and verification artifacts change.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.64.0 or newer
- RapidKit Core 0.6.0 only when a Python-backed kit or module requires it

CLI 0.64.0 is the runtime floor for this release. Its Create Planner profiles,
lifecycle policy, portable diagnostics, and consumer contracts govern planning,
execution, and verification.

## Upgrade

Install or update the extension from the Marketplace:

```bash
code --install-extension rapidkit.rapidkit-vscode --force
```

The compatible CLI is bundled with the extension. For terminal use, install the
same published release:

```bash
npm install -g workspai@0.64.0
```
