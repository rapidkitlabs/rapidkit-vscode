import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('workspace explorer activation ordering', () => {
  it('publishes initial workspace selection only after command and views are registered', () => {
    const explorer = read('src/ui/treeviews/workspaceExplorer.ts');
    const extension = read('src/extension.ts');

    expect(explorer).toContain(
      'this._initialLoadPromise = this.loadWorkspaces({ publishSelection: false })'
    );
    expect(explorer).toContain('public async whenReady()');
    expect(explorer).toContain('public async publishSelectedWorkspaceContext(');
    expect(explorer).toContain(
      "await vscode.commands.executeCommand('workspai.workspaceSelected', selectedWorkspace)"
    );
    expect(
      extension.indexOf("vscode.commands.registerCommand('workspai.workspaceSelected'")
    ).toBeLessThan(extension.indexOf("'initial-workspace-selection'"));
    expect(extension.indexOf('vscode.window.registerWebviewViewProvider')).toBeLessThan(
      extension.indexOf("'initial-workspace-selection'")
    );
    expect(extension).not.toContain(
      'await workspaceExplorer.whenReady();\n    await workspaceExplorer.publishSelectedWorkspaceContext();'
    );
  });

  it('keeps workspace explorer as the selected workspace command source', () => {
    const extension = read('src/extension.ts');

    expect(extension).toContain("vscode.commands.registerCommand('workspai.getSelectedWorkspace'");
    expect(extension).toContain('return workspaceExplorer?.getSelectedWorkspace() ?? null;');
    expect(extension).not.toContain('return projectExplorer?.getSelectedWorkspace() ?? null;');
  });

  it('uses stable activation log labels instead of drifting step numbers', () => {
    const extension = read('src/extension.ts');

    expect(extension).toContain('Activation: registering commands');
    expect(extension).toContain('Activation: initializing workspace selection');
    expect(extension).toContain('Activation: Workspai extension initialized');
    expect(extension).not.toMatch(/Step \d+(?:\.\d+)?:/);
  });

  it('runs CLI gate and walkthrough evidence inside the non-blocking selection lane', () => {
    const extension = read('src/extension.ts');

    const laneIndex = extension.indexOf("'initial-workspace-selection'");
    const publishIndex = extension.indexOf(
      'await workspaceExplorer.publishSelectedWorkspaceContext()'
    );
    expect(laneIndex).toBeGreaterThan(-1);
    expect(publishIndex).toBeGreaterThan(-1);
    expect(laneIndex).toBeLessThan(publishIndex);
    expect(publishIndex).toBeLessThan(extension.indexOf('await presentCliVersionGate'));
    const selectionHandlerIndex = extension.indexOf(
      "vscode.commands.registerCommand('workspai.workspaceSelected'"
    );
    const walkthroughIndex = extension.indexOf(
      'syncWalkthroughEvidenceContext(selectedWorkspace?.path ?? null'
    );
    expect(selectionHandlerIndex).toBeGreaterThan(-1);
    expect(walkthroughIndex).toBeGreaterThan(selectionHandlerIndex);
    expect(selectionHandlerIndex).toBeLessThan(laneIndex);
  });

  it('prompts to register detected workspace roots only after explorer activation is ready', () => {
    const extension = read('src/extension.ts');
    const detector = read('src/core/workspaceDetector.ts');

    expect(detector).toContain('detectWorkspaceRoots');
    expect(detector).toContain('hasWorkspaceRootMarkers(workspacePath)');
    expect(extension).toContain('promptToRegisterDetectedWorkspaceRoots');
    expect(extension).toContain(
      'Workspai workspace detected: ${candidate.name}. Add it to Workspai?'
    );
    expect(extension).toContain("const addAction = 'Add to Workspai'");
    expect(extension).toContain("const notNowAction = 'Not now'");
    expect(extension).toContain('await workspaceExplorer.whenReady();');
    expect(extension.indexOf("'initial-workspace-selection'")).toBeLessThan(
      extension.indexOf("'detected-workspace-registration'")
    );
    expect(extension).toContain('await workspaceExplorerProvider?.selectWorkspace(workspace);');
  });

  it('keeps workspace archive import failures recoverable instead of dead-end errors', () => {
    const explorer = read('src/ui/treeviews/workspaceExplorer.ts');

    expect(explorer).toContain('showArchiveImportRecovery');
    expect(explorer).toContain('Archive could not be verified.');
    expect(explorer).toContain('The archive is missing signed manifest or checksum evidence.');
    expect(explorer).toContain("const ARCHIVE_RECOVERY_DOCS_ACTION = 'Open Docs'");
    expect(explorer).toContain("const ARCHIVE_RECOVERY_FOLDER_ACTION = 'Import Folder Instead'");
    expect(explorer).toContain('WORKSPACE_ARCHIVE_RECOVERY_DOCS_URL');
    expect(explorer).toContain('formatArchiveVerificationDetails');
    expect(explorer).toContain('Missing checksum records');
    expect(explorer).toContain('await this.importFromFolder();');
    expect(explorer).not.toContain('Failed to import archive: ${error');
  });

  it('records activation-lane timing without blocking failure recovery', () => {
    const extension = read('src/extension.ts');
    expect(extension).toContain('completed in ${Date.now() - startedAt}ms');
    expect(extension).toContain('failed after ${Date.now() - startedAt}ms (non-critical)');
  });

  it('initializes catalog services synchronously without blocking activation lanes', () => {
    const extension = read('src/extension.ts');
    expect(extension).toContain('ModulesCatalogService.initialize(context)');
    expect(extension).toContain('ExamplesService.initialize(context)');
    expect(extension).toContain('KitsService.initialize(context)');
    expect(extension).not.toContain("'modules-catalog-init'");
    expect(extension).not.toContain("'examples-service-init'");
    expect(extension).not.toContain("'kits-service-init'");
  });

  it('refreshes doctor evidence on project selection, not every project tree paint', () => {
    const extension = read('src/extension.ts');
    const explorer = read('src/ui/treeviews/projectExplorer.ts');
    expect(explorer).toContain('onDidChangeSelectedProject');
    expect(extension).toContain('projectExplorer.onDidChangeSelectedProject');
    expect(extension).not.toMatch(
      /projectExplorer\.onDidChangeTreeData\(\(\) => \{\s*doctorEvidenceExplorer\.refresh/
    );
  });

  it('repaints the workspace tree after the initial registry load settles', () => {
    const explorer = read('src/ui/treeviews/workspaceExplorer.ts');
    expect(explorer).toContain(
      'this._initialLoadPromise = this.loadWorkspaces({ publishSelection: false })'
    );
    expect(explorer).toContain('this._onDidChangeTreeData.fire()');
    expect(explorer.indexOf('this.syncScopedFileWatchers()')).toBeLessThan(
      explorer.lastIndexOf('this._onDidChangeTreeData.fire()')
    );
    expect(explorer).toContain(
      'If a later refresh superseded the constructor load, wait for the latest'
    );
  });

  it('keeps workspace switch responsive by not awaiting dashboard hydration', () => {
    const extension = read('src/extension.ts');
    expect(extension).toContain(
      '// Sidebar selection must stay responsive. Dashboard/evidence hydration is'
    );
    expect(extension).toContain('void Promise.all([');
    expect(extension).toContain('WelcomePanel.refreshDashboardForWorkspaceSelection()');
  });

  it('creates the active-workspace watcher before publishing any selection', () => {
    const extension = read('src/extension.ts');
    const watcherIndex = extension.indexOf(
      'projectRefreshWatcherController = registerProjectRefreshWatchers('
    );
    const selectionHandlerIndex = extension.indexOf(
      "vscode.commands.registerCommand('workspai.workspaceSelected'"
    );
    const initialPublishIndex = extension.indexOf("'initial-workspace-selection'");
    expect(watcherIndex).toBeGreaterThan(-1);
    expect(watcherIndex).toBeLessThan(selectionHandlerIndex);
    expect(selectionHandlerIndex).toBeLessThan(initialPublishIndex);
    expect(extension).not.toContain(
      'doctorEvidenceExplorer.setWorkspacePath(initialWs?.path ?? null)'
    );
    expect(extension).not.toContain(
      'workspaceContractGraphExplorer.setWorkspacePath(initialWs?.path ?? null)'
    );
  });

  it('activates a workspace from tree selection independently of list open mode', () => {
    const extension = read('src/extension.ts');
    const explorer = read('src/ui/treeviews/workspaceExplorer.ts');
    expect(extension).toContain(
      "const workspacesTreeView = vscode.window.createTreeView('rapidkitWorkspaces'"
    );
    expect(extension).toContain('workspacesTreeView.onDidChangeSelection');
    expect(extension).toContain('void workspaceExplorer.selectWorkspace(item.workspace)');
    expect(explorer).not.toContain("command: 'workspai.selectWorkspace'");
  });
});
