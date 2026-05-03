import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf-8');
}

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.vscode-test',
  '.turbo',
]);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.svg',
  '.ttf',
  '.woff',
  '.woff2',
  '.eot',
  '.zip',
  '.gz',
  '.tar',
  '.vsix',
  '.lockb',
  '.pdf',
  '.mp4',
  '.webm',
  '.mp3',
]);

function collectProjectFiles(root: string): string[] {
  const files: string[] = [];

  const walk = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath).split(path.sep).join('/');

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;

      files.push(relPath);
    }
  };

  walk(root);
  return files;
}

describe('contract drift guard', () => {
  it('keeps repository text content free of unenglish characters', () => {
    const filePaths = collectProjectFiles(repoRoot);
    const arabicScriptRegex = /[\u0600-\u06FF]/u;

    const violations: Array<{ file: string; line: number; snippet: string }> = [];

    for (const relPath of filePaths) {
      const absPath = path.join(repoRoot, relPath);
      let content: string;

      try {
        content = fs.readFileSync(absPath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      for (let idx = 0; idx < lines.length; idx += 1) {
        const line = lines[idx];
        if (arabicScriptRegex.test(line)) {
          violations.push({
            file: relPath,
            line: idx + 1,
            snippet: line.trim(),
          });
          if (violations.length >= 20) break;
        }
      }

      if (violations.length >= 20) break;
    }

    if (violations.length > 0) {
      const details = violations.map((v) => `${v.file}:${v.line} -> ${v.snippet}`).join('\n');
      throw new Error(`Unenglish text guard failed:\n${details}`);
    }

    expect(violations).toHaveLength(0);
  });

  it('keeps workspace doctor command contract aligned with npm CLI', () => {
    const extensionSource = read('src/extension.ts');
    const workspaceOpsSource = read('src/commands/workspaceOperations.ts');
    const commandSource = `${extensionSource}\n${workspaceOpsSource}`;

    expect(commandSource).toContain("['doctor', 'workspace']");
    expect(commandSource).toContain("['doctor', 'workspace', '--fix']");
    expect(commandSource).not.toContain('doctor --workspace');
  });

  it('keeps profile enum values aligned across type, completion, hover, and wizard', () => {
    const expectedProfiles = [
      'minimal',
      'python-only',
      'node-only',
      'go-only',
      'polyglot',
      'enterprise',
    ];

    const extensionSource = read('src/extension.ts');
    const workspaceOpsSource = read('src/commands/workspaceOperations.ts');
    const commandSource = `${extensionSource}\n${workspaceOpsSource}`;
    const typesSource = read('src/types/index.ts');
    const completionSource = read('src/providers/completionProvider.ts');
    const hoverSource = read('src/providers/hoverProvider.ts');
    const wizardSource = read('src/ui/wizards/workspaceWizard.ts');
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');
    const webviewTypesSource = read('webview-ui/src/types.ts');
    const projectSchemaSource = read('schemas/rapidkit.schema.json');
    const workspaceSchemaSource = read('schemas/rapidkitrc.schema.json');

    for (const profile of expectedProfiles) {
      expect(commandSource).toContain(`'${profile}'`);
      expect(typesSource).toContain(`'${profile}'`);
      expect(completionSource).toContain(profile);
      expect(hoverSource).toContain(`\`${profile}\``);
      expect(wizardSource).toContain(`'${profile}'`);
      expect(welcomePanelSource).toContain(`'${profile}'`);
      expect(webviewTypesSource).toContain(`'${profile}'`);
      expect(projectSchemaSource).toContain(`"${profile}"`);
      expect(workspaceSchemaSource).toContain(`"${profile}"`);
    }

    expect(completionSource).not.toContain('standard');
    expect(hoverSource).not.toContain('`standard`');
    expect(projectSchemaSource).not.toContain('"standard"');
    expect(workspaceSchemaSource).not.toContain('"standard"');
  });

  it('keeps updater/setup commands pinned to stable npm install syntax and workspace doctor contract', () => {
    const updateCheckerSource = read('src/utils/updateChecker.ts');
    const setupPanelSource = read('src/ui/panels/setupExperiencePanel.ts');
    const extensionSource = read('src/extension.ts');
    const workspaceOpsSource = read('src/commands/workspaceOperations.ts');
    const commandSource = `${extensionSource}\n${workspaceOpsSource}`;

    expect(updateCheckerSource).not.toContain('rapidkit@latest');
    expect(setupPanelSource).not.toContain('rapidkit@latest');
    expect(extensionSource).not.toContain('rapidkit@latest');

    expect(commandSource).toContain("['doctor', 'workspace']");
    expect(commandSource).toContain("['doctor', 'workspace', '--fix']");

    expect(setupPanelSource).toContain('runCommandsInTerminal');
    expect(setupPanelSource).toContain("'python -m pipx upgrade rapidkit-core'");
    expect(setupPanelSource).toContain("'python -m pipx install --force rapidkit-core'");
    expect(setupPanelSource).toContain("'python -m pipx --version'");
    expect(setupPanelSource).toContain("'python3 -m pip --version'");
    expect(setupPanelSource).toContain("'python -m pip install --user pipx'");
    expect(setupPanelSource).toContain("'python -m pipx ensurepath'");
  });

  it('keeps release stop automation wired to gate script and CI workflow', () => {
    const packageJsonSource = read('package.json');
    const workflowSource = read('.github/workflows/extension-smoke-matrix.yml');
    const wave2WorkflowSource = read('.github/workflows/release-gate-wave2.yml');
    const gateManifestSource = read('releases/wave2-foundation-gate.json');
    const gateScriptSource = read('scripts/release-stop-gate.mjs');

    expect(packageJsonSource).toContain(
      '"release:stop-gate": "node scripts/release-stop-gate.mjs"'
    );
    expect(packageJsonSource).toContain(
      '"release:stop-gate:wave2": "node scripts/release-stop-gate.mjs --manifest releases/wave2-foundation-gate.json --marker releases/fixtures/wave2-kpi-marker.json"'
    );
    expect(workflowSource).toContain('Release stop gate (contract/parity)');
    expect(workflowSource).toContain('npm run release:stop-gate -- --skip-kpi');
    expect(wave2WorkflowSource).toContain('Wave 2 release gate');
    expect(wave2WorkflowSource).toContain('npm run release:stop-gate:wave2');
    expect(wave2WorkflowSource).toContain('WORKSPAI_GATE_PREDICTIVE_PRECISION_MIN');
    expect(wave2WorkflowSource).toContain('WORKSPAI_GATE_FALSE_ALARM_RATE_MAX');
    expect(gateManifestSource).toContain('WAVE2_FOUNDATION_GATE');
    expect(gateManifestSource).toContain('docs/WAVE2_ENGINEERING_BREAKDOWN.md');
    expect(gateManifestSource).toContain('releases/fixtures/wave2-kpi-marker.json');
    expect(gateScriptSource).toContain('src/test/driftGuard.test.ts');
    expect(gateScriptSource).toContain('src/test/incidentStudioPayload.test.ts');
    expect(gateScriptSource).toContain('src/test/workspaceUsageTracker.test.ts');
    expect(gateScriptSource).toContain('--manifest');
    expect(gateScriptSource).toContain('--skip-contract-checks');
    expect(gateScriptSource).toContain('WORKSPAI_GATE_PREDICTIVE_PRECISION_MIN');
    expect(gateScriptSource).toContain('WORKSPAI_GATE_FALSE_ALARM_RATE_MAX');
  });

  it('keeps terminal execution centralized in approved files', () => {
    const sourceFiles = collectProjectFiles(path.join(repoRoot, 'src')).filter(
      (relPath) => relPath.endsWith('.ts') && !relPath.startsWith('test/')
    );

    const violations: string[] = [];

    for (const relPath of sourceFiles) {
      const content = read(`src/${relPath}`);
      const sendTextCount = (content.match(/\.sendText\(/g) || []).length;
      const createTerminalCount = (content.match(/createTerminal\(/g) || []).length;

      if (relPath === 'utils/terminalExecutor.ts') {
        expect(sendTextCount).toBe(2);
        expect(createTerminalCount).toBe(1);
        continue;
      }

      if (relPath === 'extension.ts') {
        expect(sendTextCount).toBe(0);
        expect(createTerminalCount).toBe(0);
        continue;
      }

      if (relPath === 'commands/projectLifecycle.ts') {
        expect(sendTextCount).toBe(0);
        expect(createTerminalCount).toBe(0);
        expect(content).toContain('openTerminal({');
        expect(content).toContain('interruptTerminal(existingTerminal)');
        continue;
      }

      if (sendTextCount > 0) {
        violations.push(`${relPath}: sendText(${sendTextCount})`);
      }
      if (createTerminalCount > 0) {
        violations.push(`${relPath}: createTerminal(${createTerminalCount})`);
      }
    }

    if (violations.length > 0) {
      throw new Error(`Terminal API drift detected:\n${violations.join('\n')}`);
    }

    expect(violations).toHaveLength(0);
  });

  it('keeps project lifecycle command contracts cross-platform for fastapi/go/nestjs', () => {
    const extensionSource = read('src/extension.ts');
    const projectLifecycleSource = read('src/commands/projectLifecycle.ts');
    const lifecycleSource = `${extensionSource}\n${projectLifecycleSource}`;

    expect(lifecycleSource).toContain("registerCommand('workspai.projectInit'");
    expect(lifecycleSource).toContain("registerCommand('workspai.projectDev'");
    expect(lifecycleSource).toContain("registerCommand('workspai.projectTest'");

    expect(lifecycleSource).toContain("commands: [['init']]");
    expect(lifecycleSource).toContain("commands: [['test']]");
    expect(lifecycleSource).toContain("commands: [['init'], ['dev']]");

    expect(lifecycleSource).toContain("commands: [['dev', '--allow-global-runtime']]");
    expect(lifecycleSource).toContain("commands: [['dev', '--port', String(port)]]");
    expect(lifecycleSource).toContain("commands: [['dev']]");

    expect(lifecycleSource).toContain("commands: ['npm run start:dev']");
    expect(lifecycleSource).toContain('PORT: String(port)');

    expect(lifecycleSource).not.toContain('PORT=${port} npm run start:dev');
    expect(lifecycleSource).not.toContain('PORT=${port} npx rapidkit dev');
    expect(lifecycleSource).not.toContain('PORT=$PORT npx rapidkit dev');
    expect(lifecycleSource).not.toContain('npx rapidkit init && npx rapidkit dev');
  });

  it('keeps workspace operations on command-array contracts', () => {
    const extensionSource = read('src/extension.ts');
    const workspaceOpsSource = read('src/commands/workspaceOperations.ts');
    const operationsSource = `${extensionSource}\n${workspaceOpsSource}`;

    expect(operationsSource).toContain("commands: [['bootstrap', '--profile'");
    expect(operationsSource).toContain("commands: [['setup', (runtime as any).value]]");
    expect(operationsSource).toContain("commands: [['init']]");

    expect(operationsSource).toContain("commands: [['workspace', 'policy', 'show']]");
    expect(operationsSource).toContain(
      "['workspace', 'policy', 'set', policyKey.label, policyValue]"
    );

    expect(operationsSource).toContain("commands: [['cache', 'status']]");
    expect(operationsSource).toContain("commands: [['cache', 'clear']]");
    expect(operationsSource).toContain("commands: [['cache', 'prune']]");
    expect(operationsSource).toContain("commands: [['cache', 'repair']]");

    expect(operationsSource).toContain("commands: [['mirror', 'status']]");
    expect(operationsSource).toContain("commands: [['mirror', 'sync']]");
    expect(operationsSource).toContain("commands: [['mirror', 'verify']]");
    expect(operationsSource).toContain("commands: [['mirror', 'rotate']]");

    expect(operationsSource).toContain("commands: [['doctor', 'workspace']]");
    expect(operationsSource).toContain("commands: [['doctor', 'workspace', '--fix']]");

    expect(operationsSource).not.toContain('npx rapidkit cache status');
    expect(operationsSource).not.toContain('npx rapidkit mirror status');
    expect(operationsSource).not.toContain('npx workspai.doctor workspace');
    expect(operationsSource).not.toContain('RAPIDKIT_ENABLE_RUNTIME_ADAPTERS=1 npx rapidkit setup');
  });

  it('keeps setup panel language toolchain commands cross-platform and shell-safe', () => {
    const setupPanelSource = read('src/ui/panels/setupExperiencePanel.ts');

    expect(setupPanelSource).toContain('runCommandsInTerminal');

    expect(setupPanelSource).toContain("'python3 --version'");
    expect(setupPanelSource).toContain("'python --version'");
    expect(setupPanelSource).toContain("'python -m pip --version'");
    expect(setupPanelSource).toContain("'python3 -m pip --version'");
    expect(setupPanelSource).toContain("commands: [['--version']]");
    expect(setupPanelSource).toContain("'go version'");

    expect(setupPanelSource).toContain("'python -m pipx install --force rapidkit-core'");
    expect(setupPanelSource).toContain("'pipx install --force rapidkit-core'");

    expect(setupPanelSource).not.toContain('RAPIDKIT_ENABLE_RUNTIME_ADAPTERS=1');
    expect(setupPanelSource).not.toContain('PORT=');
  });

  it('keeps AI modal stop-generation contract aligned across webview and panel', () => {
    const appSource = read('webview-ui/src/App.tsx');
    const aiModalSource = read('webview-ui/src/components/AIModal.tsx');
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');

    expect(appSource).toContain(
      "vscode.postMessage('aiCancelQuery', { requestId: aiRequestIdRef.current });"
    );
    expect(appSource).toContain('context: ctx, requestId');
    expect(appSource).toContain('onCancel={handleAICancelQuery}');

    expect(aiModalSource).toContain('onCancel: () => void;');
    expect(aiModalSource).toContain('onClick={isStreaming ? onCancel : handleSubmit}');
    expect(aiModalSource).toContain("{isStreaming ? 'Stop' : 'Send'}");

    expect(welcomePanelSource).toContain("case 'aiCancelQuery':");
    expect(welcomePanelSource).toContain('this._aiQueryTokenSource?.cancel();');
    expect(welcomePanelSource).toContain('requestId: queryRequestId');
    expect(welcomePanelSource).toContain(
      "this._panel.webview.postMessage({ command: 'aiStreamDone' });"
    );
  });

  it('keeps AI modal clarification gate ahead of model streaming', () => {
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');

    expect(welcomePanelSource).toContain('prepared.validation.clarificationNeeded');
    expect(welcomePanelSource).toContain("trackAIModalOutcome('clarification-needed'");
    expect(welcomePanelSource).toContain("'workspai.aimodal.clarification_gate'");
    expect(welcomePanelSource).toContain("command: 'aiChunkUpdate'");
    expect(welcomePanelSource).toContain("command: 'aiStreamDone'");

    const clarificationIdx = welcomePanelSource.indexOf('prepared.validation.clarificationNeeded');
    const streamIdx = welcomePanelSource.indexOf('await streamAIResponse(');
    const breakIdx = welcomePanelSource.indexOf('break;', clarificationIdx);

    expect(clarificationIdx).toBeGreaterThan(-1);
    expect(streamIdx).toBeGreaterThan(-1);
    expect(breakIdx).toBeGreaterThan(clarificationIdx);
    expect(clarificationIdx).toBeLessThan(streamIdx);
    expect(breakIdx).toBeLessThan(streamIdx);
  });
});
