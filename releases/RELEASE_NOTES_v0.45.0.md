<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Portable project intelligence and evidence-driven agent operations",
  "summary": "Workspai for VS Code 0.45.0 is verified against CLI 0.66.0 and brings project-owned Graph evidence, evidence-selected Skills, and dual-era intelligence contracts into one governed extension experience.",
  "highlights": [
    {
      "icon": "🧭",
      "text": "Adopted projects carry an integrity-checked portable Graph projection back to the canonical workspace"
    },
    {
      "icon": "🧠",
      "text": "Agent bootstrap validates project readiness and evidence-selected Skills before grounded work"
    },
    {
      "icon": "🔎",
      "text": "Graph search supports project scope and entity kind with explicit inventory and provider coverage"
    },
    {
      "icon": "🛡️",
      "text": "MCP and repair capability upgrades remain schema-checked and backward compatible"
    },
    {
      "icon": "📦",
      "text": "The extension ships the integrity-checked Workspai CLI 0.66.0 runtime"
    }
  ]
}
-->

# Workspai VS Code v0.45.0

Prepared for release validation.

## Portable project intelligence and evidence-driven agent operations

Workspai for VS Code 0.45.0 is validated against Workspai CLI 0.66.0. The
extension now consumes the CLI's evidence-driven project intelligence directly:
the workspace remains canonical, each adopted project receives a portable
projection, and every agent-facing capability is accepted only after its
contract, scope, integrity, and freshness checks pass.

## One canonical workspace, portable project Graphs

The workspace-owned Model and proof-backed Graph remain the aggregate authority
for cross-project reasoning. An adopted or nested project may carry a bounded
project Graph reference under its own `.workspai` directory. The extension
validates its portable path, canonical payload hash, project identity, and
workspace Graph source hash before using it for Agent grounding.

The Artifacts view exposes that project Graph, project context, Skills index,
MCP design, and canonical workspace Graph as separate clickable authorities.
Studio, Assistant, and Copilot resolve project-owned files from the project
root—even when a linked repository lives outside the workspace directory—and
use an explicit `project:` evidence locator for sandboxed reads.

This keeps project-local consumers useful when a repository is opened directly
without duplicating or silently forking the workspace architecture. A missing
legacy reference remains compatible; a modern receipt that advertises a corrupt
or stale reference is blocked visibly.

## Skills and readiness are evidence, not decoration

Agent bootstrap now understands the 0.66 readiness dimensions and project Graph
reference while retaining compatibility with valid pre-0.66 receipts. Generated
Skill indexes expose selection decisions, evidence, confidence, suppression,
and bounded operational commands. The extension validates those decisions and
does not present unrelated workflows as repository capabilities.

Dashboard evidence also exposes the implemented dual-era MCP runtime,
structured content and protocol-error support, candidate tools, and approval or
availability state for planned tools. Repair handshakes validate the CLI's
qualification matrix, including fail-to-valid recovery coverage and declared
invariants.

## More precise Graph and workspace operations

Graph views show whether inventory is exact or estimated and summarize provider
input coverage, file budgets, selection strategy, semantic bindings, and API
runtime registration coverage. Search can pass a canonical entity kind and `project:<name>`
scope directly to the CLI. The workspace Model detail view surfaces CI, release,
and ownership governance without dumping raw model JSON.

CLI 0.66 activity journals now feed the Dashboard's bounded Recent Commands
view while remaining explicitly observational—not evidence, verification, or
decision authority. The full Flow Board remains available through Live
Workspace Activity.

New governed commands synchronize the workspace contract, launch the CLI-owned
live activity graph, and pass plan/runtime choices to workspace lifecycle runs.
The extension remains an orchestration and presentation layer; it does not
reimplement CLI discovery, Graph semantics, or live-event truth.

## Reliable Assistant control loop

Agent and Goal request missing blocking input through an explicit structured
action before mutation; ordinary model prose cannot become an implicit scope or
authority change. Cancel releases the durable session even while a provider
request is still pending. Plan remains read-only, and **Run with Agent** now
carries both the original request and the inspected Plan into a user-approved
handoff while requiring Agent to refresh evidence before editing.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.66.0 or newer
- RapidKit Core 0.6.0 only when a Python-backed kit or module requires it

Workspai CLI 0.66.0 is the bundled, verified, and minimum supported authority
for this release.

## Upgrade

Install or update the extension from the Marketplace:

```bash
code --install-extension rapidkit.rapidkit-vscode --force
```

The compatible CLI is bundled with the extension. For terminal use, install the
same published release:

```bash
npm install -g workspai@0.66.0
```

Release posture: `portable-project-intelligence-and-agent-operations`

Release gate posture: `expansion-eligible`.
