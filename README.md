# Workspai for VS Code

<div align="center">

### Understand the workspace. Change it with evidence. Verify the result.

Workspai gives developers and AI agents a shared, evidence-backed view of a
software workspace, then helps them investigate, change, and verify it from
inside VS Code.

[![Install](https://img.shields.io/visual-studio-marketplace/v/rapidkit.rapidkit-vscode?label=Install&style=flat-square&color=00CFC1)](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/rapidkit.rapidkit-vscode?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
[![Open Source](https://img.shields.io/badge/Open%20Source-MIT-111827?style=flat-square)](LICENSE)

[Install extension](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode) · [Documentation](https://www.workspai.dev/) · [GitHub](https://github.com/chistiq/rapidkit-vscode)

</div>

<p align="center"><img src="media/readme/incident-studio.gif" alt="Workspai Agent inspecting workspace evidence, changing source, and verifying the result" width="78%" /></p>

<p align="center"><strong>Ask → inspect → change → test → verify</strong></p>

## Start in minutes

1. [Install Workspai](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode).
2. Open an existing repository or start a new workspace in VS Code.
3. Open the **Workspai** sidebar, then adopt or create your project.
4. Ask a question, prepare a plan, run an Agent task, or define a Goal.

The extension includes a verified Workspai CLI runtime. You do not need a
separate global CLI installation for extension-owned operations.

## One assistant, four ways to work

| Mode      | Best for                                                            |
| --------- | ------------------------------------------------------------------- |
| **Ask**   | Understanding code, architecture, diagnostics, and workspace state. |
| **Plan**  | Investigating a task and preparing a grounded, read-only plan.      |
| **Agent** | Editing code, running scoped checks, and verifying the result.      |
| **Goal**  | Working toward a defined outcome until its required checks pass.    |

Ask and Plan stay read-only. Agent and Goal can make changes, but every write
is scoped, reviewable, and verified.

## Work with the system, not just isolated files

Workspai combines source code with projects, dependencies, contracts,
diagnostics, documentation, and operational evidence. This gives the assistant
a focused map of the system before it decides where to reason or what to
change.

### Create

Describe the workspace or project you want. Workspai prepares a clear plan for
review before it creates files or runs setup commands.

### Studio

Use one conversational loop to inspect evidence, edit source, run project
commands, review changed files, and verify the outcome. When an operation needs
permission, Studio shows a compact approval card in the conversation. You can
run it once, allow the exact action for the session or project when supported,
or decline it.

An ordinary Agent task does not need an incident card. It reads before changing,
then verifies the result against fresh evidence.

### Graph

Explore how projects, modules, files, APIs, and dependencies connect. Select an
entity to inspect its relationships and supporting evidence.

<p align="center"><img src="media/readme/workspace-graph.gif" alt="Workspai workspace graph showing connected entities, relationships, and evidence" width="94%" /></p>

### Live

See what Workspai and its agents are doing: active commands, completed stages,
failures, verification, model usage, and measurable context efficiency.
Operations Floor correlates that activity with the bounded canonical Graph,
tool attempts, PCC assurance, and evidence provenance in one presentation-ready view.

### Artifacts

Open the generated Model, Graph, agent context, Skills, reports, and other
workspace evidence without searching through internal directories.

## Safe without getting in the way

- Read-only investigation can run without unnecessary prompts.
- Source changes are scoped, recorded, and reversible where supported.
- Sensitive or invasive actions require an explicit, exact approval.
- Agent completion requires verification, not just a plausible answer.
- Agent changes can carry their intent, observed effects, and verification as
  one inspectable record.

## Bring your model

Use VS Code models, a local model, or your preferred provider:

`VS Code Models` · `OpenAI` · `Claude` · `Gemini` · `Kimi` · `DeepSeek` ·
`OpenRouter` · `Groq` · `Mistral` · `xAI` · `Ollama` · `Custom`

Provider credentials are stored in VS Code Secret Storage.

## Learn more

- [Getting started](docs/GETTING_STARTED.md)
- [CLI Repair Engine integration](docs/CLI_REPAIR_ENGINE_INTEGRATION.md)
- [Release notes](RELEASE_NOTES.md)
- [Workspai CLI](https://www.npmjs.com/package/workspai)
- [Contributing](CONTRIBUTING.md)
- [Issues and feature requests](https://github.com/chistiq/rapidkit-vscode/issues)

MIT © [Chistiq](https://github.com/chistiq)
