<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Deterministic startup and workspace synchronization",
  "summary": "Workspai for VS Code 0.47.1 is validated against CLI 0.75.0 and makes sidebar readiness, workspace switching, project discovery, and Dashboard scope deterministic.",
  "highlights": [
    {
      "icon": "⚡",
      "text": "Commit workspace selection immediately without waiting for VS Code context or persistence work"
    },
    {
      "icon": "🔄",
      "text": "Replay the latest scope after Dashboard, Quick Actions, and secondary-sidebar readiness"
    },
    {
      "icon": "🧭",
      "text": "Keep Projects, Workspace Health, Contract Graph, modules, and Dashboard on one active scope"
    },
    {
      "icon": "🛡️",
      "text": "Discard late project and evidence results from superseded workspace selections"
    },
    {
      "icon": "📦",
      "text": "Run on the integrity-checked Workspai CLI 0.75.0 runtime and contracts"
    }
  ]
}
-->

# Workspai VS Code v0.47.1

Prepared September 7, 2026.

## Deterministic startup and workspace synchronization

Workspai for VS Code 0.47.1 is validated against Workspai CLI 0.75.0. This
patch release closes activation, readiness, and stale-state races that could
leave one sidebar section blank, keep Projects on an earlier workspace, or
delay Dashboard scope synchronization after a rapid workspace switch.

## One committed workspace selection

Workspace selection now commits to the explorer immediately and publishes a
synchronous internal selection event. Project discovery, scoped watchers,
Workspace Health, Contract Graph, both sidebar surfaces, the status bar, and
Dashboard refresh all project from that committed selection.

VS Code context keys, last-access persistence, walkthrough evidence, and
Dashboard hydration remain asynchronous projections. They can no longer delay
or cancel the active workspace transaction. The public
`workspai.workspaceSelected` command remains available for integration
compatibility but is no longer the internal state bus.

Project selection is also committed before either sidebar reads its scope.
The tree has one selection ingress, and both primary and secondary sidebars
receive the same project snapshot.

## Ready handshake and replay

Dashboard and sidebar webviews now install their message receivers before
loading local HTML. Quick Actions and the secondary sidebar send an explicit
ready handshake; the host then replays theme, model, active workspace,
selected project, and pending tab state. A visible sidebar can request the
same current snapshot again.

This removes the timing window where host messages could be posted before
React installed its receiver and then disappear permanently.

## Independent and stale-safe hydration

Workspace truth, catalogs, and environment probes use independent bootstrap
lanes. A slow CLI, network, or toolchain probe in one lane does not prevent
other Dashboard sections from rendering.

Project scans, workspace registry loads, module resolution, Doctor evidence,
Contract Graph reads, and Dashboard evidence retain generation checks. Late
results from a superseded workspace or project are discarded, and project
loading is rescheduled for the current scope. Dashboard evidence performs a
final generation check after activity-journal I/O before publication.

## Startup and watcher stability

Recursive workspace-wide watchers remain restricted to the active governed
workspace and managed evidence paths. This avoids exhausting Linux inotify
capacity in large monorepos while preserving explicit refresh on selection,
imports, creation, and governed artifact changes.

Large Studio and Incident session payloads are stored in extension storage
files with serialized atomic writes and migration from legacy VS Code
Memento state.

## Operational diagnosis

Workspai activation lanes emit duration telemetry. If the entire Extension
Host becomes unresponsive, use VS Code's running-extension or Extension Host
profile before attributing the stall to a Workspai loader. Because extensions
share a host process, another built-in extension can delay Workspai rendering
and selection events even after Workspai has registered its command surface.

## Validation

- Full extension suite: 3,315 passed, 6 skipped
- TypeScript and webview type checks passed
- Formatting and release-policy checks passed
- Local and release VSIX bundles contain identical extension and sidebar code
- VSIX artifact smoke validation covers the bundled CLI, webview assets,
  contracts, and package manifest

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.75.0 or newer
- Git for Analyze Repo
- RapidKit Core 0.6.0 only for Python-backed kits/modules

Optional terminal installation:

```bash
npm install -g workspai@0.75.0
workspai --version
```

Release posture: `stability-patch`.

Publication status: Prepared for release September 7, 2026.
