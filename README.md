# Workspai for VS Code

<div align="center">

### Understand the workspace. Change it with evidence. Verify the result.

Workspai gives developers and AI agents one shared view of the code, projects,
contracts, dependencies, and operational evidence that make up a software system.

[![Install](https://img.shields.io/visual-studio-marketplace/v/rapidkit.rapidkit-vscode?label=Install&style=flat-square&color=00CFC1)](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/rapidkit.rapidkit-vscode?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
[![Open Source](https://img.shields.io/badge/Open%20Source-MIT-111827?style=flat-square)](LICENSE)

[Install extension](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
· [Read the docs](https://www.workspai.dev/)
· [View source](https://github.com/chistiq/rapidkit-vscode)

</div>

<p align="center">
  <img
    src="media/readme/incident-studio.gif"
    alt="Workspai Agent inspecting workspace evidence, changing source, and verifying the result"
    width="75%"
  />
</p>

<p align="center">
  <strong>Ask → inspect → change → test → verify</strong>
</p>

## One assistant, four ways to work

| Mode      | Use it when you want Workspai to…                                       |
| --------- | ----------------------------------------------------------------------- |
| **Ask**   | Explain the workspace using source, diagnostics, changes, and evidence. |
| **Plan**  | Investigate a task and prepare a grounded implementation plan.          |
| **Agent** | Edit code, run scoped checks, review the diff, and verify the result.   |
| **Goal**  | Pursue any bounded engineering outcome through evidence and safe edits. |

Agent handles ordinary tasks without an incident card. It reads before changing, writes through transactions, and verifies the result. Missing blocking context is requested explicitly in the same session, and Cancel stops the session even while a model request is in flight. Plan stays read-only; **Run with Agent** carries the approved plan forward but requires fresh inspection before any edit. For adopted projects, Agent validates the portable Workspai entry receipt, readiness dimensions, and project-owned Graph reference before resolving canonical evidence or permitting broad source discovery and mutation.

## Set one governed goal

Describe the outcome once. Workspai binds it to the Model, proof-backed Graph,
bounded agent handoff, and CLI-owned repair, verification, and rollback.

Try retry, refactoring, performance, documentation, or coverage outcomes from
**Goal**, Dashboard → Run → Intelligence, or `@workspai /goal`.

Coverage, dependency-security, and release-readiness Goals use exact CLI
verifiers. Other Goals keep the same scope, evidence, transaction, rollback,
and attempt controls, but finish with outcome review plus CLI workspace safety
checks—not a false machine-proof claim.

## Why Workspai

- **The whole system, not one file** — connect projects, services, contracts,
  infrastructure, documentation, and evidence across a polyglot workspace.
- **Less context guessing** — give humans and agents focused, traceable workspace
  context instead of repeatedly loading an entire repository.
- **Changes you can verify** — inspect diagnostics and diffs, apply guarded
  patches, run project checks, and return the result to shared workspace evidence.

## Explore the workspace graph

See how projects, modules, files, APIs, and dependencies connect across the
workspace. Select any entity to inspect its relationships and the evidence that supports them. The canonical workspace Graph remains the aggregate authority;
each adopted project receives a portable, integrity-bound projection that points
back to that aggregate without copying the whole workspace into agent context.
Artifacts keeps the workspace Graph, project Graph/context, selected Skills,
and MCP design independently inspectable. Linked projects resolve from their
own root, so Agent never confuses project and workspace reports.

<p align="center">
  <img
    src="media/readme/workspace-graph.gif"
    alt="Workspai workspace graph showing connected entities, relationships, and proof paths"
    width="94%"
  />
</p>

## Bring your model

Use models already available through VS Code, run locally, or connect with your
own provider key.

`VS Code Models` · `OpenAI` · `Claude` · `Gemini` · `Kimi` · `DeepSeek` ·
`OpenRouter` · `Groq` · `Mistral` · `xAI` · `Ollama` · `Custom`
Provider credentials are isolated in VS Code Secret Storage. Endpoint and model
preferences are stored separately for each provider.

## Start in minutes

1. [Install Workspai from the Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode).
2. Open the Workspai sidebar. The extension includes its verified CLI runtime,
   so Create, adopt, Doctor, Graph, Agent, and Goal work without a separate
   global CLI installation.
3. In **Create**, describe what you need. Workspai distinguishes a new scaffold
   from questions, clarification, adopt/import, or existing-source work, and
   never changes files before you approve a clear creation plan.
4. Open **Workspai: Open Dashboard**, select or adopt a workspace, then open the
   Assistant and choose **Ask**, **Plan**, **Agent**, or **Goal**.
Install `workspai` separately only for an external terminal; extension-owned
operations use the integrity-checked runtime shipped inside the extension.
Workspai scaffolds its published catalog and adopts arbitrary repositories.
Intelligence uses the CLI's open taxonomy across Node, Python, Go, JVM, .NET,
Rust, native, Ruby, PHP, Elixir, Bun, and Deno without forcing adopted code into
the scaffold catalog. Deep modules appear only when the CLI authorizes them.

## Learn more

- [Workspai documentation](https://www.workspai.dev/)
- [Workspai platform](https://www.workspai.com/)
- [CLI on npm](https://www.npmjs.com/package/workspai)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Issues and feature requests](https://github.com/chistiq/rapidkit-vscode/issues)
  MIT © [Chistiq](https://github.com/chistiq)
