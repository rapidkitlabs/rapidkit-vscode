<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Proof-carrying Studio and live operational assurance",
  "summary": "Workspai for VS Code 0.46.0 is verified against CLI 0.72.0 and connects governed agent operations to deletion-aware change assurance, Live evidence, and strict independent verification.",
  "highlights": [
    {
      "icon": "🛡️",
      "text": "Agent and Goal changes carry intent, baseline, effects, Graph re-observation, verification, and uncertainty"
    },
    {
      "icon": "🔗",
      "text": "Studio, native Chat, CLI, Live, Graph, and Artifacts consume the same PCC contracts"
    },
    {
      "icon": "🧭",
      "text": "Linked-project receipts preserve portable canonical identities without exposing absolute paths"
    },
    {
      "icon": "📊",
      "text": "Live combines Board activity, Change Assurance, benchmark provenance, and model usage"
    },
    {
      "icon": "📦",
      "text": "The extension ships the integrity-checked Workspai CLI 0.72.0 runtime"
    }
  ]
}
-->

# Workspai VS Code v0.46.0

Released September 1, 2026.

## Proof-carrying Studio and live operational assurance

Workspai for VS Code 0.46.0 is validated against Workspai CLI 0.72.0. The
extension now carries a source-changing model operation from an immutable Goal
and pinned architecture baseline to typed observed effects, fresh Graph
re-observation, independent verification, and a tamper-evident capsule. The CLI
remains the sole lifecycle and ledger authority; the extension supplies IDE
approval, execution, observation, and presentation without creating parallel
truth.

## One governed path from intent to sealed change

Agent, Goal, autonomous blocker repair, and native Chat establish or restore a
CLI Goal Pack before mutation tools become available. The first effect begins
or joins the Goal-bound Proof-Carrying Change and pins the exact Model, Graph,
and input generation. A resumed Studio session discovers its existing open
change through `change list --json`, so it does not create a second ledger or
detach later effects from the original intent.

The extension translates the existing Studio approval boundary into bounded
PCC effect classes. Source proposals remain SHA-protected CLI Repair
transactions. Project-native commands remain structured argument vectors with
no shell. Once an operation finishes, Studio records a typed effect receipt
that identifies the command or repair transaction and the exact resulting
source bytes. Verification succeeds only when canonical verification passes
and `change verify --strict` seals the capsule.

Read-only commands remain visible in Live but do not create fake PCC effects.
A dependency mutation receives a dependency effect class, ordinary source
transformations receive a command effect class, and proven rollbacks leave no
observed-change receipt. Repository-metadata and external-system effects need
an exact, uncached one-run approval and cannot complete until a successful
read-only command observes the matching effect domain.

Ask and Plan remain read-only. Agent and Goal receive mutation tools only after
the project bootstrap, Goal binding, workspace trust, scope, evidence, and
approval boundaries pass. Prediction is never displayed or consumed as proof.

## Portable proof for linked projects

Adopted repositories may live outside the managed workspace directory. Effect
receipts never persist those absolute paths. The extension resolves the source
through `.workspai/workspace.contract.json`, maps it to the contract-owned
`external/<project>/...` identity, hashes the current bytes, and lets CLI 0.72
validate the same portable reference through its linked-project evidence
resolver.

Missing, stale, escaped, symlinked, or digest-mismatched artifacts fail closed.
Deleted artifacts are recorded as CLI-derived `deletion-tombstone-v1` evidence.
The capsule becomes invalid if a claimed deletion reappears; the extension does
not fabricate bytes or preserve a stale absence claim.

## Change Assurance in Live

Dashboard Live now provides one correlated overview and three focused views:

- Operations Floor presents execution stages, tool attempts, the bounded
  canonical Graph, benchmark provenance, and PCC assurance in one
  presentation-ready control surface. It never derives architecture edges from
  activity labels or timing.
- Operations presents the vertical sequence of CLI and Studio activity.
- Change Assurance presents open, blocked, verified, sealed, aborted, and
  invalid PCC capsules with intent, baseline, effects, re-observation,
  verification, uncertainty, and next actions. Its evidence controls open the
  capsule, architecture lease, prediction, actual Graph delta, surprise report,
  Decisions transaction, and event stream through the governed artifact bridge.
- The Graph tab can overlay predicted operations, observed architecture
  changes, and unpredicted surprises over the canonical Graph. This is a visual
  projection only; it never edits Graph entities or upgrades prediction into
  proof.
- Command Center combines live execution, proof-backed Graph metrics,
  retrieval efficiency, model-usage provenance, and engineering outcome.

Live activity remains observation, not verification. Graph edges are rendered
only when Board v1 supplies an exact revision-bound Graph reference. Capsule
assurance comes from the Decisions ledger, source receipts, Graph overlay, and
independent verifier rather than timing or label similarity.

## A stronger model control loop

Studio exposes bounded source discovery, exact file reads, Graph search,
diagnostics, VS Code definitions, references, implementations, hover types,
symbols, change inspection, safe edits, guarded patches, deletion, governed
repair, and project-native commands. Independent reads may run concurrently;
all writes remain serialized.

Commands that may mutate source require an immutable fingerprint-bound grant.
Studio checkpoints the complete selected source boundary, reports process
lifecycle into Live, restores undeclared mutations, and rolls back partial
source changes when an approved command fails. Repository metadata and external
systems stay one-run approvals because local source rollback cannot reverse
them. Shell execution, privilege escalation, secret forwarding, Workspai CLI
bypass, and workspace escape remain non-approvable.

Repository-specific executables do not need a hard-coded product patch. A bare
PATH executable or contained local wrapper can run through the same no-shell
transaction, but unknown semantics force exact one-run approval and a dynamic
`command:<name>` observation scope before completion. A blocked PCC ledger is
resumed only after a separate uncached human confirmation, preserving the same
Goal and event history.

Long sessions preserve a deterministic causal spine for tool outcomes,
failures, verification, steering, and model checkpoints. Resume restores the
same Goal context and discovers the matching PCC transaction before another
effect is admitted.

Fresh CLI remediation evidence is also a control input, not merely prompt
text. When the active blocker maps to one non-invasive executable action,
Studio persists an exact `execute-remediation-step` continuation and exposes
only that native tool and immutable `stepId` to the next model turn. The model
cannot reopen inspection, substitute command text, or claim completion around
the action. CLI actions marked `requiresApproval` pause before `tool.started`,
use an evidence- and blocker-bound one-run fingerprint, and carry the actual
approver into Repair and PCC receipts. A declined action survives reload; an
executed action that genuinely fails widens once to the general capability
plane with the failure evidence attached.

The CLI is the preferred causal map, not the model's only navigation path. A
workspace-wide remediation plan is projected onto the active finding and its
dependency closure before an action is selected, so an unrelated advisory
cannot hijack a Doctor repair. If that scoped plan has no exact executable
action and no typed external prerequisite, the model keeps the governed file
discovery, source and evidence inspection, Graph query, diagnostic, structured
command, patch, and verification tools needed to discover another route.

CLI 0.72 makes host and runtime prerequisites explicit. Studio and native Chat
preserve each action's typed requirements, structured invocation, retry policy,
and the active-finding projection of the plan-owned `nextActionId`. If Go, .NET,
Java, Node, Python, Rust, PHP, Ruby, Elixir, or another required executable is
unavailable, the IDE presents **Environment setup required** with setup and
recheck actions instead of reporting the plan refresh as repair completion or
entering a Resume loop. It waits for an environment change plus a fresh plan;
it does not approve a dependent command, choose a convenient later step, or
retry the same blocked action generation.

In the sidebar, that boundary is a compact card inside the Studio conversation
instead of a detached system dialog. The card keeps the selected command,
scope, reason, and exact fingerprint visible, offers only the execution scopes
admitted by the immutable descriptor, and resumes the same tool call after the
decision. Native Chat keeps the VS Code modal as a fallback for hosts without
Workspai's interactive webview surface.

The Goal boundary also follows the CLI's canonical freshness contract instead
of failing before the model loop begins. A CLI-authored `live-input-mismatch`
causes one visible retry with `--refresh`, preserving the same objective,
consumer, and project scope. The retry is bounded and removed before any later
scope or runtime decision, so refresh cannot become a repeated rebuild loop.
Unrelated Goal failures remain visible and fail closed.

## Graph and measurable efficiency

The Graph tab can arrange only the selected project's real entities and
relationships into a Unicode-aware project-name projection. Display-only
labels remove repeated project and entity-kind prose while canonical labels
remain unchanged for search, detail, evidence, and agent consumers. GIF and
MP4 exports use the same verified Graph data.

The `agent-core.v1` benchmark and evaluation artifacts keep provider-reported,
tokenizer-counted, estimated, mixed, and unavailable token provenance visibly
separate. The extension does not present estimated payload reduction as
measured provider savings.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.72.0 or newer
- RapidKit Core 0.6.0 only when a Python-backed kit or module requires it

Workspai CLI 0.72.0 is the bundled, verified, and minimum supported authority
for this release because Studio consumes its causal remediation ordering and
typed environment-prerequisite boundary.

## Upgrade

Install or update the extension from the Marketplace:

```bash
code --install-extension rapidkit.rapidkit-vscode --force
```

The compatible CLI is bundled with the extension. For terminal use, install the
same published release:

```bash
npm install -g workspai@0.72.0
```

Release posture: `proof-carrying-studio-and-live-assurance`

Release gate posture: `expansion-eligible`.

Publication status: published September 1, 2026.
