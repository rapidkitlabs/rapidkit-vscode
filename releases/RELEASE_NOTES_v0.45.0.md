<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Portable project intelligence and evidence-driven agent operations",
  "summary": "Workspai for VS Code 0.45.0 is verified against CLI 0.67.0 and brings project-owned Graph evidence, evidence-selected Skills, Live Operations, and provenance-aware benchmarks into one governed extension experience.",
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
      "text": "The extension ships the integrity-checked Workspai CLI 0.67.0 runtime"
    }
  ]
}
-->

# Workspai VS Code v0.45.0

Prepared for release validation.

## Portable project intelligence and evidence-driven agent operations

Workspai for VS Code 0.45.0 is validated against Workspai CLI 0.67.0. The
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

CLI activity journals feed the Dashboard's bounded Recent Commands view while
remaining explicitly observational—not evidence, verification, or decision
authority. The dedicated Live tab combines the CLI-owned Board v1 projection
with durable Studio tool calls in a continuously refreshed vertical timeline;
its Command Center mode combines observed stages, proof-backed Graph metrics,
and provenance-aware efficiency. Typed Board v1 artifact, Graph, proof, and
project references form a visible evidence bridge. The extension overlays an
architecture edge only for a declared, source-revision-bound Graph identity;
artifact correlation never becomes a fabricated entity relationship.

The `agent-core.v1` retrieval suite appears as a first-class artifact and can be
generated from the Dashboard. Estimated retrieval-payload reduction stays
separate from provider-reported or tokenizer-counted model usage. Evaluation
detail includes input/output/cached/reasoning tokens, latency, cost, repeated
artifact reads, no-progress decisions, blockers resolved, and verified outcome.

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

Registered linked projects are resolved from canonical Model identity rather
than directory ancestry. The model may select any evidence-backed,
project-native causal command in the linked project root; Studio executes it as
a bounded no-shell argument vector inside a serialized source transaction. A
private byte-complete checkpoint restores undeclared source mutations and
partial changes from failed approved commands before the model continues.
Process identity, duration, output volume, exit, and rollback are durable Live
events. Missing system toolchains remain visible as operator prerequisites
instead of triggering an unsafe autonomous install.

When a repository-native command is expected to change source or dependency
state, Studio pauses for exact approval. The dialog shows the command, working
directory, scope, model rationale, and risk reasons. A fingerprint-bound grant
may authorize that immutable proposal once, for the current session, or for the
current project; saved approvals expire and can be revoked from the Command
Palette. Changed arguments always require a new approval. Shells, privilege
escalation, secret forwarding, Workspai CLI bypasses, and scope escapes remain
blocked even with approval.

Repository-metadata and external registry, cluster, daemon, or remote effects
are available through the same exact structured proposal, but only with a
one-run approval. The receipt states that the local source checkpoint cannot
roll back those non-source effects. Studio records machine-readable effect
domains and rejects completion until a successful read-only command observes
each matching domain. This preserves broad tool freedom without turning a saved
approval into ambient infrastructure authority or trusting a prompt-only rule.

Long-running sessions compact older durable causal events into a deterministic,
sequence-bound spine. Earlier failures, verification outcomes, user steering,
model checkpoints, and per-tool outcomes remain available after the raw event
window advances, without persisting source bodies or relying on a model-written
memory summary.

Graph-bounded reasoning now composes with active VS Code language providers for
definitions, references, implementations, hover types, document symbols, and
workspace symbols. Up to eight independent read-only inspections may execute
concurrently with deterministic result order; source mutation remains strictly
serialized and transaction-bound.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.67.0 or newer
- RapidKit Core 0.6.0 only when a Python-backed kit or module requires it

Workspai CLI 0.67.0 is the bundled, verified, and minimum supported authority
for this release.

## Upgrade

Install or update the extension from the Marketplace:

```bash
code --install-extension rapidkit.rapidkit-vscode --force
```

The compatible CLI is bundled with the extension. For terminal use, install the
same published release:

```bash
npm install -g workspai@0.67.0
```

Release posture: `portable-project-intelligence-and-agent-operations`

Release gate posture: `expansion-eligible`.
