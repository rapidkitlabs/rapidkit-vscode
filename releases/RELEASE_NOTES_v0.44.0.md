<!-- workspai-release-announcement
{
  "productId": "workspai-vscode",
  "headline": "Governed repair convergence and an immersive workspace graph",
  "summary": "Workspai for VS Code 0.44.0 is verified against CLI 0.64.0 and combines deterministic repair routing with a live, proof-backed 3D Workspace Graph.",
  "highlights": [
    {
      "icon": "🔁",
      "text": "Missing and stale lifecycle evidence now routes through its exact project-scoped CLI producer"
    },
    {
      "icon": "🛡️",
      "text": "Studio repair remains autonomous in new or uncommitted repositories without weakening source boundaries"
    },
    {
      "icon": "🧠",
      "text": "Architecture, Globe, Brain, Constellation, and Workspai views project the same canonical graph in true 3D"
    },
    {
      "icon": "🎥",
      "text": "Governed GIF and high-quality H.264 MP4 exports preserve the selected shape, pace, framing, and full orbit"
    },
    {
      "icon": "✅",
      "text": "Validated graph generations keep Dashboard, Studio, and exported evidence aligned"
    }
  ]
}
-->

# Workspai VS Code v0.44.0

Published.

## Governed repair convergence and immersive workspace graph

Workspai for VS Code 0.44.0 is validated against Workspai CLI 0.64.0. This
release strengthens the path from a blocker to fresh evidence and gives the
canonical Workspace Graph a live, deterministic 3D presentation surface.

The model still reasons about the repair, but it no longer has to guess which
Workspai command owns missing or stale lifecycle evidence. The controller maps
the finding to the exact governed producer, refreshes its artifact, runs Verify
again, and returns any remaining causal source work to Studio.

The same release makes graph exploration substantially more useful. Every 2D,
3D, animated, and exported view is derived from one bounded graph generation,
with scope and integrity checks between the CLI artifact, extension host, and
dashboard.

## Repair follows the canonical producer chain

Missing or stale project lifecycle evidence now enters a deterministic chain:

```text
Finding
  → project-scoped governed producer
  → refreshed canonical artifact
  → Workspace Verify
  → remaining causal finding or verified closure
```

`init`, `test`, `build`, and `start` evidence is produced through the registered
Workspai command surface and the integrity-checked CLI bundled with the
extension. The model cannot route a Workspai command through the general command
tool or a mutable `npx` invocation. That general tool remains available only for
bounded project-native commands.

Source fingerprints no longer include Workspai reports, repair transactions,
generated caches, dependency trees, or build output. Studio can therefore
establish a stable before/after boundary in a newly created repository or a
workspace without an initial commit, while unexpected source mutation still
stops autonomous execution.

## One validated live graph generation

The Graph stream validates schema, workspace scope, revision identity, entity
and relationship references, and completion before a generation is promoted to
the dashboard. Partial stream updates are coalesced, stale revisions cannot
replace newer evidence, and corrupt or cross-workspace input fails visibly.

Search, filters, project scope, selection, details, 2D Map, 3D projection, and
exports all consume that same promoted generation. The dashboard does not
silently invent missing nodes or relationships, and it preserves the CLI's
proof-backed identity and topology.

## Semantic 3D projections

The Graph now opens in 3D and supports persistent yaw, pitch, and roll with
mouse, keyboard, zoom, reset, and automatic orbit controls. Reduced-motion
preferences remain authoritative.

Five deterministic projections are available:

- **Architecture** arranges semantic levels on equal-radius rings.
- **Globe** distributes the complete graph over a readable spherical surface.
- **Brain** forms an anatomical side-profile with cortex, hemispheres,
  cerebellum, and control-plane stem cues.
- **Constellation** groups projects into stable asterisms with real depth.
- **Workspai** samples the official SVG silhouette and preserves its detached
  signal mark and purple-to-teal visual progression.

Changing the projection changes only presentation. Entity identity,
relationships, proofs, filters, and selected scope remain canonical.

## Presentation-ready governed export

Graph export captures the current bounded revision and selected semantic shape.
The camera follows a deterministic multi-axis route that covers upper, lower,
front, rear, and rolled perspectives rather than merely spinning the user's
current view.

GIF export uses a frame-derived adaptive palette, perceptual matching, restrained
dithering, dashboard-matched framing, and selectable Fast, Standard, Calm, or
Slow pacing. High-quality MP4 export keeps true-color frames and uses a
high-bitrate H.264 pipeline with deterministic timestamps and fast-start
metadata.

Both paths show capture progress, validate scope and output limits, and save
through a governed VS Code dialog. MP4 licensing is documented in the packaged
third-party notices.

## A more focused Graph workspace

Graph quality, provider health, coverage, binding, and diagnostic detail are
collapsed into a compact evidence summary. Controls adapt at narrower dashboard
widths, while the graph canvas remains near the initial viewport instead of
being pushed below several rows of metadata.

## Compatibility

- VS Code 1.106.0 or newer
- Workspai CLI 0.64.0 or newer
- RapidKit Core 0.6.0 only when a Python-backed kit or module requires it

CLI 0.64.0 remains the bundled and minimum supported authority for this release.

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
