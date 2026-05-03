/**
 * Welcome Panel - React Version
 * Uses React for webview UI with postMessage communication
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { WorkspaceManager } from '../../core/workspaceManager';
import { ModulesCatalogService } from '../../core/modulesCatalogService';
import { CoreVersionService } from '../../core/coreVersionService';
import { ExamplesService } from '../../core/examplesService';
import { KitsService } from '../../core/kitsService';
import { WorkspaceMemoryService } from '../../core/workspaceMemoryService';
import { getGitDiffStat } from '../../core/aiProjectContextUtils';
import { isWorkspacePathAncestor } from '../../core/aiContextResolver';
import {
  indexProjectSystemGraph,
  queryProjectSystemGraphImpact,
  scoreSystemGraphImpactDeterministic,
  createProjectSystemGraphWatcher,
  type ProjectSystemGraphWatcherHandle,
} from '../../core/systemGraphIndexer';
import { runSandboxSimulation, type SandboxVerifyCommand } from '../../core/sandboxSimulation';
import {
  extractPatchesFromAiResponse,
  applyPatches,
  type MultiFilePatchResult,
} from '../../core/patchApplyEngine';
import { MODULES, ModuleData } from '../../data/modules';
import { runningServers } from '../../extension';
import { run } from '../../utils/exec';
import { getWorkspaceVenvRapidkitCandidates } from '../../utils/platformCapabilities';
import { isPoetryInstalledCached } from '../../utils/poetryHelper';
import { checkPythonEnvironmentCached } from '../../utils/pythonChecker';
import {
  runCommandsInTerminal,
  runRapidkitCommandsInTerminal,
  runShellCommandInTerminal,
} from '../../utils/terminalExecutor';
import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import { openWorkspace } from '../../commands/workspaceContextMenu';
import type { WorkspaceExplorerProvider } from '../treeviews/workspaceExplorer';
import { createDoctorTelemetryRefreshController } from './doctorTelemetryRefresh';
import {
  findIncidentNavigatorSelection,
  resolveIncidentNavigatorTargetPath,
} from './incidentNavigatorTarget';
import { buildIncidentPredictiveWarning } from './incidentPredictiveWarning';
import {
  buildIncidentStudioTelemetryFromCache,
  buildIncidentStudioTelemetryPayload,
  shouldUseIncidentStudioTelemetryCache,
} from './incidentStudioTelemetry';
import { ProjectSelectionSequence } from './projectSelectionSequence';
import { buildIncidentResumeSnapshot, type IncidentResumeSnapshot } from './incidentStudioResume';
import {
  buildIncidentMemoryPromptHint,
  buildIncidentMemoryReuseSnapshot,
  mergeIncidentReplayLearningIntoMemory,
  prependIncidentMemoryReuseBlock,
  shouldAttachIncidentMemoryReuse,
} from './incidentStudioMemory';
import {
  buildIncidentFirstResponseRules,
  classifyIncidentActionPolicy,
  isIncidentActionAllowlisted,
} from './incidentStudioPromptPolicy';
import {
  buildIncidentReplayQuery,
  buildLinkSafeExportBundle,
  parseImportedReproBundle,
} from './incidentReproPackUtils';

type IncidentWorkspaceGraphSnapshot = {
  snapshotVersion: 'v1';
  workspace: {
    path?: string;
    name?: string;
  };
  project: {
    framework: string;
    kit: string;
    selectedProject: {
      path: string;
      name?: string;
      type?: string;
    } | null;
  };
  topology: {
    modulesCount: number;
    topModules: string[];
  };
  doctor: {
    hasEvidence: boolean;
    generatedAt?: string;
    health?: {
      passed: number;
      warnings: number;
      errors: number;
      total: number;
      percent: number;
    };
  };
  git: {
    diffStat: string;
    hasDiffContext: boolean;
  };
  memory: {
    context?: string;
    conventionsCount: number;
    decisionsCount: number;
    hasMemory: boolean;
  };
  telemetry: {
    totalEvents: number;
    lastCommand: string | null;
    onboardingFollowupClickThroughRate: number;
  };
  evidence: {
    hasDoctorEvidence: boolean;
    hasGitDiff: boolean;
    hasWorkspaceMemory: boolean;
    projectScoped: boolean;
  };
  completeness: 'fresh' | 'cached' | 'partial' | 'degraded';
  lastUpdatedAt: number;
};

export class WelcomePanel {
  private static readonly UI_PREFS_KEY = 'rapidkit.welcome.uiPreferences';
  public static currentPanel: WelcomePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _aiQueryTokenSource?: vscode.CancellationTokenSource;
  private _activeAIQueryRequestId?: number;
  private static _selectedProject: { name: string; path: string; type?: string } | null = null;
  private static _projectSelectionSequence = new ProjectSelectionSequence();
  private _modulesCatalog: ModuleData[] = MODULES;
  private static _workspaceExplorer: WorkspaceExplorerProvider | undefined;
  /** Framework name queued to open as a modal after the webview becomes ready */
  private static _pendingModal: string | null = null;
  private static _pendingAICreateMode: 'workspace' | 'project' = 'workspace';
  /** Module data queued to show as install modal after webview becomes ready */
  private static _pendingModuleModal: any | null = null;
  /** AI modal context queued to show after webview becomes ready */
  private static _pendingAIModal: import('../../core/aiService').AIModalContext | null = null;
  /** Incident Studio open request queued until webview is ready */
  private static _pendingIncidentStudioOpen: {
    workspacePath: string;
    workspaceName?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    initialQuery?: string;
  } | null = null;
  /** Whether the webview has fired its first 'ready' event for the current panel instance */
  private _isReady = false;
  /** Workspace share bundle dashboard payload queued until webview is ready */
  private static _pendingWorkspaceShareDashboardOpen: {
    summary: {
      sourceFile: string;
      workspaceName: string;
      workspaceProfile?: string;
      generatedAt?: string;
      schemaVersion: string;
      projectCount: number;
      runtimes: string[];
      doctorEvidenceIncluded: boolean;
      healthTotals: {
        passed: number;
        warnings: number;
        errors: number;
      };
    };
  } | null = null;
  /** Cached extension context so static methods can open the panel */
  private static _extensionContext: vscode.ExtensionContext | undefined;

  /**
   * Open the welcome panel and immediately trigger the Create Project modal
   * for the given framework. Safe to call whether the panel is open or not.
   */
  public static openProjectModal(
    context: vscode.ExtensionContext,
    framework: 'fastapi' | 'nestjs' | 'go' | 'springboot'
  ): void {
    // If the panel is already open and ready, post immediately.
    if (WelcomePanel.currentPanel?._isReady) {
      WelcomePanel.currentPanel._panel.webview.postMessage({
        command: 'openProjectModal',
        data: { framework },
      });
      return;
    }
    WelcomePanel._pendingModal = framework;
    WelcomePanel.createOrShow(context);
  }

  /**
   * Open the welcome panel and immediately trigger the Create Workspace modal.
   * Safe to call whether the panel is open or not.
   */
  /**
   * Open the welcome panel and immediately show the module install modal.
   * Safe to call whether the panel is open or not.
   */
  public static showModuleInstallModal(moduleData: any): void {
    const context = WelcomePanel._extensionContext;
    if (!context) {
      return;
    }
    if (WelcomePanel.currentPanel?._isReady) {
      WelcomePanel.currentPanel._panel.webview.postMessage({
        command: 'openModuleInstallModal',
        data: moduleData,
      });
      return;
    }
    WelcomePanel._pendingModuleModal = moduleData;
    WelcomePanel.createOrShow(context);
  }

  /**
   * Open the welcome panel and immediately show the AI assistant modal for a given context.
   */
  public static showAIModal(
    context: vscode.ExtensionContext,
    aiContext: import('../../core/aiService').AIModalContext
  ): void {
    WelcomePanel._extensionContext = context;
    if (WelcomePanel.currentPanel?._isReady) {
      WelcomePanel.currentPanel._panel.webview.postMessage({
        command: 'openAIModal',
        data: aiContext,
      });
      return;
    }
    WelcomePanel._pendingAIModal = aiContext;
    WelcomePanel.createOrShow(context);
  }

  public static openWorkspaceModal(context: vscode.ExtensionContext): void {
    if (WelcomePanel.currentPanel?._isReady) {
      WelcomePanel.currentPanel._panel.webview.postMessage({ command: 'openWorkspaceModal' });
      return;
    }
    WelcomePanel._pendingModal = '__workspace__';
    WelcomePanel.createOrShow(context);
  }

  /**
   * Open the welcome panel and immediately show the AI Create modal (workspace mode).
   * Called from the sidebar Quick Actions "Create with AI" button.
   */
  public static openAICreateModal(
    context: vscode.ExtensionContext,
    mode: 'workspace' | 'project' = 'workspace'
  ): void {
    WelcomePanel._pendingAICreateMode = mode;
    if (WelcomePanel.currentPanel?._isReady) {
      const selectedWs =
        mode === 'project' ? WelcomePanel._workspaceExplorer?.getSelectedWorkspace() : undefined;
      WelcomePanel.currentPanel._panel.webview.postMessage({
        command: 'openAICreateModal',
        data: {
          mode,
          targetWorkspaceName: selectedWs?.name,
          targetWorkspacePath: selectedWs?.path,
        },
      });
      return;
    }
    WelcomePanel._pendingModal = '__ai_create__';
    WelcomePanel.createOrShow(context);
  }

  /**
   * Open the welcome panel and jump directly to Incident Studio analysis.
   */
  public static openIncidentStudio(
    context: vscode.ExtensionContext,
    data: {
      workspacePath: string;
      workspaceName?: string;
      projectPath?: string;
      projectName?: string;
      projectType?: string;
      initialQuery?: string;
    }
  ): void {
    if (WelcomePanel.currentPanel?._isReady) {
      WelcomePanel.currentPanel._panel.webview.postMessage({
        command: 'openIncidentStudio',
        data,
      });
      return;
    }
    WelcomePanel._pendingIncidentStudioOpen = data;
    WelcomePanel.createOrShow(context);
  }

  /**
   * Open the welcome panel and show imported workspace share bundle summary on the dashboard.
   */
  public static openWorkspaceShareDashboard(
    context: vscode.ExtensionContext,
    data: {
      summary: {
        sourceFile: string;
        workspaceName: string;
        workspaceProfile?: string;
        generatedAt?: string;
        schemaVersion: string;
        projectCount: number;
        runtimes: string[];
        doctorEvidenceIncluded: boolean;
        healthTotals: {
          passed: number;
          warnings: number;
          errors: number;
        };
      };
    }
  ): void {
    if (WelcomePanel.currentPanel?._isReady) {
      WelcomePanel.currentPanel._panel.webview.postMessage({
        command: 'openWorkspaceShareDashboard',
        data,
      });
      return;
    }
    WelcomePanel._pendingWorkspaceShareDashboardOpen = data;
    WelcomePanel.createOrShow(context);
  }

  /**
   * Set workspace explorer reference (called from extension.ts)
   */
  public static setWorkspaceExplorer(explorer: WorkspaceExplorerProvider) {
    WelcomePanel._workspaceExplorer = explorer;
  }

  public static setExtensionContext(context: vscode.ExtensionContext) {
    WelcomePanel._extensionContext = context;
  }

  /**
   * Called from extension.ts when user selects a project in the sidebar tree view
   */
  public static async updateWithProject(projectPath: string, projectName: string) {
    console.log('[WelcomePanel] updateWithProject called:', projectName, projectPath);

    const selectionVersion = WelcomePanel._projectSelectionSequence.begin();

    const projectType = await WelcomePanel._detectProjectTypeStatic(projectPath);
    if (!WelcomePanel._projectSelectionSequence.isCurrent(selectionVersion)) {
      return;
    }

    WelcomePanel._selectedProject = {
      name: projectName,
      path: projectPath,
      type: projectType ?? undefined,
    };

    if (WelcomePanel.currentPanel) {
      const currentPanel = WelcomePanel.currentPanel;
      const installedModules = await WelcomePanel._readInstalledModules(projectPath);
      if (
        !WelcomePanel._projectSelectionSequence.isCurrent(selectionVersion) ||
        WelcomePanel.currentPanel !== currentPanel
      ) {
        return;
      }
      console.log('[WelcomePanel] Found', installedModules.length, 'installed modules');

      // Check if server is running and extract port
      let isRunning = false;
      let runningPort: number | undefined;
      const runningTerminal = runningServers.get(projectPath);
      if (runningTerminal) {
        isRunning = true;
        // Extract port from terminal name like "🚀 project [:8001]"
        const match = runningTerminal.name.match(/:([0-9]+)/);
        if (match) {
          runningPort = parseInt(match[1], 10);
          console.log('[WelcomePanel] Server running on port:', runningPort);
        }
      }

      // Detect project type for UI adaptation (e.g., hide modules for Go)
      currentPanel._panel.webview.postMessage({
        command: 'updateWorkspaceStatus',
        data: {
          hasWorkspace: true,
          hasProjectSelected: true,
          workspaceName: projectName,
          workspacePath: projectPath,
          projectName,
          projectPath,
          projectType: projectType ?? undefined,
          installedModules,
          isRunning,
          runningPort,
        },
      });
      console.log('[WelcomePanel] ✅ Workspace status sent to webview');

      // Refresh modules catalog to get correct versions for the new project
      if (
        !WelcomePanel._projectSelectionSequence.isCurrent(selectionVersion) ||
        WelcomePanel.currentPanel !== currentPanel
      ) {
        return;
      }

      await currentPanel._refreshModulesCatalog();
      console.log('[WelcomePanel] ✅ Modules catalog refreshed for project switch');
    } else {
      console.log('[WelcomePanel] ❌ No currentPanel - stored for later');
    }
  }

  /**
   * Clear selected project
   */
  public static clearSelectedProject() {
    console.log('[WelcomePanel] clearSelectedProject called');
    WelcomePanel._projectSelectionSequence.begin();
    WelcomePanel._selectedProject = null;

    if (WelcomePanel.currentPanel) {
      const selectedWorkspace = WelcomePanel._workspaceExplorer?.getSelectedWorkspace();
      WelcomePanel.currentPanel._panel.webview.postMessage({
        command: 'updateWorkspaceStatus',
        data: {
          hasWorkspace: Boolean(selectedWorkspace),
          hasProjectSelected: false,
          workspaceName: selectedWorkspace?.name,
          workspacePath: selectedWorkspace?.path,
          installedModules: [],
        },
      });
    }
  }

  /**
   * Refresh recent workspaces list in React panel
   */
  public static refreshRecentWorkspaces() {
    if (WelcomePanel.currentPanel) {
      WelcomePanel.currentPanel._sendRecentWorkspaces();
    }
  }

  /**
   * Refresh workspace status (installed modules) after module installation
   */
  public static async refreshWorkspaceStatus() {
    if (WelcomePanel.currentPanel) {
      await WelcomePanel.currentPanel._sendWorkspaceStatus();
      // Also refresh modules catalog to get latest versions
      await WelcomePanel.currentPanel._refreshModulesCatalog();
    }
  }

  private _getSelectedWorkspaceInfo(): { name: string; path: string } | null {
    const ws = WelcomePanel._workspaceExplorer?.getSelectedWorkspace();
    if (!ws) {
      return null;
    }
    return { name: ws.name, path: ws.path };
  }

  /**
   * Read installed modules from registry.json
   */
  private static async _readInstalledModules(
    projectPath: string
  ): Promise<{ slug: string; version: string; display_name: string }[]> {
    try {
      const primaryRegistryPath = path.join(projectPath, 'registry.json');
      const legacyRegistryPath = path.join(projectPath, '.rapidkit', 'registry.json');

      const primaryExists = await fs.pathExists(primaryRegistryPath);
      const legacyExists = await fs.pathExists(legacyRegistryPath);

      const registryPath = primaryExists ? primaryRegistryPath : legacyRegistryPath;
      const exists = primaryExists || legacyExists;

      if (exists) {
        const content = await fs.readFile(registryPath, 'utf-8');
        const registry = JSON.parse(content);
        return registry.installed_modules || [];
      }
    } catch (error) {
      console.error('[WelcomePanel] Error reading registry.json:', error);
    }
    return [];
  }

  private _context: vscode.ExtensionContext;
  private _chatBrainQueryTokenSource?: vscode.CancellationTokenSource;
  private _activeChatBrainRequestId?: string;
  private _activeChatBrainConversationId?: string;
  private _chatBrainInFlightRequestIds = new Set<string>();
  private _chatBrainCompletedRequestIds: string[] = [];
  private _chatBrainConversations = new Map<
    string,
    {
      workspacePath?: string;
      projectPath?: string;
      projectName?: string;
      projectType?: string;
      startedAt: number;
      lastActivityAt: number;
      phase: 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';
      history: Array<{ role: 'user' | 'assistant'; content: string }>;
      // Analytics dimensions
      queryCount: number;
      actionCount: number;
      verifyPassedAt?: number;
      framework?: string;
      importedIncidentReplay?: {
        packId: string;
        actionType: string;
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
        likelyFailureMode?: string;
        verifyChecklist: string[];
        blockedReasons: string[];
        relatedFiles: string[];
        importedFrom?: string;
      };
      // Last AI response text (populated after each _handleAiChatQuery call)
      lastActionResponseText?: string;
    }
  >();
  private _pendingImportedIncidentReplayByWorkspace = new Map<
    string,
    {
      packId: string;
      actionType: string;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      likelyFailureMode?: string;
      verifyChecklist: string[];
      blockedReasons: string[];
      relatedFiles: string[];
      importedFrom?: string;
    }
  >();
  private _incidentResumeByWorkspace = new Map<string, IncidentResumeSnapshot>();
  /** Per-workspace system graph watchers for incremental refresh on file change. */
  private _systemGraphWatcherByPath = new Map<string, ProjectSystemGraphWatcherHandle>();
  private _doctorTelemetryRefreshController = createDoctorTelemetryRefreshController({
    onRefresh: (explicitWorkspacePath?: string) =>
      this._sendIncidentStudioTelemetry(explicitWorkspacePath),
  });

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;

    this._registerDoctorEvidenceWatcher();

    // Set webview content
    this._panel.webview.html = this._getHtmlContent(context);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        const protocolRequestId =
          typeof message?.meta?.requestId === 'string'
            ? message.meta.requestId
            : typeof message?.data?.requestId === 'string'
              ? message.data.requestId
              : undefined;
        switch (message.command) {
          case 'ready':
            // Mark this panel instance as ready so static callers can post directly.
            this._isReady = true;
            // Send initial data to webview
            this._sendInitialData();
            // If a modal was queued (e.g. triggered from sidebar), open it now — post
            // directly without a delay because the webview just confirmed it is ready.
            if (WelcomePanel._pendingModal) {
              const pending = WelcomePanel._pendingModal;
              WelcomePanel._pendingModal = null;
              if (pending === '__workspace__') {
                this._panel.webview.postMessage({ command: 'openWorkspaceModal' });
              } else if (pending === '__ai_create__') {
                const selectedWs =
                  WelcomePanel._pendingAICreateMode === 'project'
                    ? WelcomePanel._workspaceExplorer?.getSelectedWorkspace()
                    : undefined;
                this._panel.webview.postMessage({
                  command: 'openAICreateModal',
                  data: {
                    mode: WelcomePanel._pendingAICreateMode,
                    targetWorkspaceName: selectedWs?.name,
                    targetWorkspacePath: selectedWs?.path,
                  },
                });
              } else {
                this._panel.webview.postMessage({
                  command: 'openProjectModal',
                  data: { framework: pending },
                });
              }
            }
            // If a module install modal was queued (e.g. triggered from sidebar), open it now
            if (WelcomePanel._pendingModuleModal) {
              const moduleData = WelcomePanel._pendingModuleModal;
              WelcomePanel._pendingModuleModal = null;
              this._panel.webview.postMessage({
                command: 'openModuleInstallModal',
                data: moduleData,
              });
            }
            // If an AI modal was queued (triggered from tree view inline button), open it now
            if (WelcomePanel._pendingAIModal) {
              const aiCtx = WelcomePanel._pendingAIModal;
              WelcomePanel._pendingAIModal = null;
              this._panel.webview.postMessage({
                command: 'openAIModal',
                data: aiCtx,
              });
            }
            // If Incident Studio open was queued, switch the webview directly.
            if (WelcomePanel._pendingIncidentStudioOpen) {
              const incidentData = WelcomePanel._pendingIncidentStudioOpen;
              WelcomePanel._pendingIncidentStudioOpen = null;
              this._panel.webview.postMessage({
                command: 'openIncidentStudio',
                data: incidentData,
              });
            }
            if (WelcomePanel._pendingWorkspaceShareDashboardOpen) {
              const shareData = WelcomePanel._pendingWorkspaceShareDashboardOpen;
              WelcomePanel._pendingWorkspaceShareDashboardOpen = null;
              this._panel.webview.postMessage({
                command: 'openWorkspaceShareDashboard',
                data: shareData,
              });
            }
            break;
          case 'createWorkspace':
            // Close the modal immediately — don't block on command execution
            this._panel.webview.postMessage({
              command: 'setCreatingWorkspace',
              data: { isLoading: false },
            });
            // Fire and forget — notifications/progress run in background
            if (message.data?.name) {
              vscode.commands.executeCommand('workspai.createWorkspace', message.data);
            } else {
              vscode.commands.executeCommand('workspai.createWorkspace');
            }
            break;
          case 'createFastAPIProject':
            // Close project modal immediately
            this._panel.webview.postMessage({ command: 'closeProjectModal' });
            if (message.data?.name) {
              vscode.commands.executeCommand('workspai.createFastAPIProject', message.data.name);
            } else {
              vscode.commands.executeCommand('workspai.createFastAPIProject');
            }
            break;
          case 'createNestJSProject':
            // Close project modal immediately
            this._panel.webview.postMessage({ command: 'closeProjectModal' });
            if (message.data?.name) {
              vscode.commands.executeCommand('workspai.createNestJSProject', message.data.name);
            } else {
              vscode.commands.executeCommand('workspai.createNestJSProject');
            }
            break;
          case 'createProjectWithKit':
            // New handler for kit-aware project creation from modal
            if (message.data?.name && message.data?.framework && message.data?.kit) {
              console.log('[WelcomePanel] Creating project with kit:', message.data);
              // Close modal immediately
              this._panel.webview.postMessage({ command: 'closeProjectModal' });

              // Get selected workspace path
              let workspacePath: string | undefined;
              if (WelcomePanel._workspaceExplorer) {
                const selectedWorkspace = WelcomePanel._workspaceExplorer.getSelectedWorkspace();
                workspacePath = selectedWorkspace?.path;
              }

              // Fire and forget
              (async () => {
                const { createProjectCommand } = await import('../../commands/createProject.js');
                await createProjectCommand(
                  workspacePath,
                  message.data.framework,
                  message.data.name,
                  message.data.kit
                );
              })();
            }
            break;
          case 'openSetup':
            await vscode.commands.executeCommand('workspai.openSetup');
            break;
          case 'debugWithAI':
            await vscode.commands.executeCommand('workspai.debugWithAI');
            break;
          case 'workspaceBrain':
            await vscode.commands.executeCommand('workspai.workspaceBrain');
            break;
          case 'aiSuggestModules': {
            // AI module recommendation based on framework + project name
            const { framework: fw, projectName: pn } = message.data || {};
            if (!fw) {
              break;
            }
            const panel = this._panel;
            try {
              const { selectModelWithPreference } = await import('../../core/aiService.js');
              const { model, modelId } = await selectModelWithPreference();
              panel.webview.postMessage({
                command: 'aiModuleSuggestions',
                data: { loading: true, modelId },
              });

              if (!this._modulesCatalog.length) {
                await this._refreshModulesCatalog();
              }
              const moduleList = this._modulesCatalog.length
                ? this._modulesCatalog
                    .map((m) => {
                      const tags =
                        m.tags && m.tags.length ? ` | tags: ${m.tags.slice(0, 4).join(', ')}` : '';
                      return `- ${m.slug}: ${m.description || m.name} | category: ${m.category} | status: ${m.status}${tags}`;
                    })
                    .join('\n')
                : '(module list not available)';

              const prompt = `You are a Workspai assistant. Recommend the top 5 most useful Workspai modules for a ${fw} project named "${pn || 'my-project'}".
Available modules:
${moduleList}

Reply ONLY with a JSON array of objects like: [{"slug": "free/auth/core", "reason": "short reason"}]
Use ONLY slugs from the list above. Prefer modules that fit the framework and avoid deprecated or invented slugs.
No markdown, no explanation outside the JSON.`;

              const token = new vscode.CancellationTokenSource().token;
              const response = await model.sendRequest(
                [vscode.LanguageModelChatMessage.User(prompt)],
                {},
                token
              );

              let raw = '';
              for await (const chunk of response.text) {
                raw += chunk;
              }

              // Extract and sanitize JSON from response
              const jsonMatch = raw.match(/\[[\s\S]*\]/);
              const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
              const allowedSlugs = new Set(this._modulesCatalog.map((m) => m.slug));
              const suggestions = Array.isArray(parsed)
                ? parsed
                    .filter(
                      (item): item is { slug: string; reason?: string } =>
                        item && typeof item === 'object' && typeof item.slug === 'string'
                    )
                    .map((item) => ({
                      slug: item.slug.trim(),
                      reason:
                        typeof item.reason === 'string' && item.reason.trim()
                          ? item.reason.trim().slice(0, 180)
                          : 'Recommended for this project',
                    }))
                    .filter((item) => allowedSlugs.has(item.slug))
                    .slice(0, 5)
                : [];
              panel.webview.postMessage({
                command: 'aiModuleSuggestions',
                data: { loading: false, modelId, suggestions },
              });
            } catch (err: any) {
              panel.webview.postMessage({
                command: 'aiModuleSuggestions',
                data: { loading: false, error: err?.message ?? 'AI unavailable' },
              });
            }
            break;
          }
          case 'aiGetModels': {
            // Return the list of language models available in this VS Code instance
            const panel = this._panel;
            try {
              const { listAvailableModels } = await import('../../core/aiService.js');
              const models = await listAvailableModels();
              panel.webview.postMessage({ command: 'aiModelsList', data: { models } });
            } catch {
              panel.webview.postMessage({ command: 'aiModelsList', data: { models: [] } });
            }
            break;
          }
          case 'aiCancelQuery': {
            const cancelRequestId =
              typeof message?.data?.requestId === 'number' ? message.data.requestId : undefined;
            if (
              typeof cancelRequestId === 'number' &&
              typeof this._activeAIQueryRequestId === 'number' &&
              cancelRequestId !== this._activeAIQueryRequestId
            ) {
              break;
            }
            this._aiQueryTokenSource?.cancel();
            this._aiQueryTokenSource?.dispose();
            this._aiQueryTokenSource = undefined;
            const doneRequestId =
              typeof cancelRequestId === 'number' ? cancelRequestId : this._activeAIQueryRequestId;
            if (typeof doneRequestId === 'number') {
              this._panel.webview.postMessage({
                command: 'aiStreamDone',
                data: { requestId: doneRequestId },
              });
            } else {
              this._panel.webview.postMessage({ command: 'aiStreamDone' });
            }
            this._activeAIQueryRequestId = undefined;
            break;
          }
          case 'aiQuery': {
            // Stream AI response for the AI modal queries
            const {
              mode,
              question,
              context: aiCtx,
              requestId,
              history,
              modelId: requestedModelId,
            } = message.data || {};
            const panel = this._panel;
            const queryRequestId = typeof requestId === 'number' ? requestId : Date.now();
            const normalizedMode = mode === 'debug' ? 'debug' : 'ask';
            const normalizedQuestion = typeof question === 'string' ? question : '';
            const aiContext =
              aiCtx && typeof aiCtx === 'object'
                ? (aiCtx as import('../../core/aiService').AIModalContext)
                : undefined;
            const conversationHistory = Array.isArray(history)
              ? history
                  .filter(
                    (h: any): h is { role: 'user' | 'assistant'; content: string } =>
                      h &&
                      typeof h === 'object' &&
                      (h.role === 'user' || h.role === 'assistant') &&
                      typeof h.content === 'string'
                  )
                  .slice(-8)
              : [];

            const canTrackTelemetry =
              typeof (vscode.window as { createOutputChannel?: unknown }).createOutputChannel ===
              'function';

            const trackAIModalOutcome = async (
              result:
                | 'success'
                | 'empty'
                | 'prepare-error'
                | 'clarification-needed'
                | 'cancelled'
                | 'error',
              extraProps?: Record<string, unknown>
            ) => {
              if (!canTrackTelemetry) {
                return;
              }

              try {
                await WorkspaceUsageTracker.getInstance().trackCommandEvent(
                  `workspai.aimodal.${normalizedMode}`,
                  typeof aiContext?.path === 'string' ? aiContext.path : undefined,
                  {
                    source: 'ai-modal',
                    result,
                    hasPrompt: Boolean(normalizedQuestion.trim()),
                    historyTurns: conversationHistory.length,
                    ...extraProps,
                  }
                );
              } catch {
                // Telemetry should never interrupt AI modal UX.
              }
            };

            if (!normalizedQuestion.trim() || !aiContext) {
              await trackAIModalOutcome('empty', {
                hasContext: Boolean(aiContext),
              });
              panel.webview.postMessage({
                command: 'aiStreamDone',
                data: { requestId: queryRequestId },
              });
              break;
            }

            this._aiQueryTokenSource?.cancel();
            this._aiQueryTokenSource?.dispose();
            const tokenSource = new vscode.CancellationTokenSource();
            this._aiQueryTokenSource = tokenSource;
            this._activeAIQueryRequestId = queryRequestId;
            let currentStage: 'prepare' | 'stream' = 'prepare';
            try {
              const { streamAIResponse, prepareAIConversation, extractContractTelemetry } =
                await import('../../core/aiService.js');

              // Build doctor snapshot for the contract — best-effort, non-blocking
              const aiQueryDoctorSnapshot =
                aiContext?.path || aiContext?.workspaceRootPath
                  ? await this._readDoctorEvidenceSnapshot(
                      aiContext.workspaceRootPath ?? aiContext.path
                    ).catch(() => undefined)
                  : undefined;

              const prepared = await prepareAIConversation(
                normalizedMode,
                normalizedQuestion,
                aiContext,
                conversationHistory,
                aiQueryDoctorSnapshot ?? undefined
              );

              if (prepared.validation.clarificationNeeded) {
                const clarificationText =
                  prepared.validation.clarificationReason ??
                  'Context evidence is missing. Please select a workspace and run npx rapidkit doctor workspace, then ask again.';

                if (canTrackTelemetry) {
                  try {
                    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
                      'workspai.aimodal.clarification_gate',
                      typeof aiContext?.path === 'string' ? aiContext.path : undefined,
                      {
                        source: 'ai-modal',
                        mode: normalizedMode,
                        missingFields: prepared.validation.missing,
                      }
                    );
                  } catch {
                    // Telemetry should never interrupt AI modal UX.
                  }
                }

                panel.webview.postMessage({
                  command: 'aiChunkUpdate',
                  data: {
                    text: `${clarificationText}\n\nPlease share the selected workspace/project path so I can continue with evidence-based guidance.`,
                    requestId: queryRequestId,
                  },
                });
                panel.webview.postMessage({
                  command: 'aiStreamDone',
                  data: { requestId: queryRequestId },
                });
                await trackAIModalOutcome('clarification-needed', {
                  stage: 'prepare',
                  missingFields: prepared.validation.missing,
                });
                break;
              }

              currentStage = 'stream';

              // Send contract telemetry to webview before streaming starts
              if (aiContext) {
                panel.webview.postMessage({
                  command: 'aiContextContract',
                  data: {
                    requestId: queryRequestId,
                    ...extractContractTelemetry(prepared.contract),
                    persona_level: prepared.contract.persona,
                    evidence_confidence: prepared.contract.evidence_confidence,
                  },
                });
              }

              const { modelId } = await streamAIResponse(
                prepared.messages,
                (() => {
                  // Buffer chunks and flush to webview every 50 ms.
                  // Without this, the extension host calls postMessage hundreds of
                  // times per second inside the same event-loop tick, causing VS Code's
                  // IPC layer to batch ALL messages into one delivery — the webview
                  // receives nothing until streaming finishes, then sees the full text
                  // appear all at once.  Explicit time-slicing breaks that batching.
                  let chunkBuffer = '';
                  let flushTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
                    if (chunkBuffer && !tokenSource.token.isCancellationRequested) {
                      panel.webview.postMessage({
                        command: 'aiChunkUpdate',
                        data: { text: chunkBuffer, requestId: queryRequestId },
                      });
                      chunkBuffer = '';
                    }
                  }, 50);

                  return (chunk: { text: string; done: boolean }) => {
                    if (chunk.text) {
                      chunkBuffer += chunk.text;
                    }
                    if (chunk.done) {
                      // Clear the timer and flush any remaining buffered text
                      if (flushTimer !== null) {
                        clearInterval(flushTimer);
                        flushTimer = null;
                      }
                      if (chunkBuffer && !tokenSource.token.isCancellationRequested) {
                        panel.webview.postMessage({
                          command: 'aiChunkUpdate',
                          data: { text: chunkBuffer, requestId: queryRequestId },
                        });
                        chunkBuffer = '';
                      }
                      panel.webview.postMessage({
                        command: 'aiStreamDone',
                        data: { requestId: queryRequestId },
                      });
                    }
                  };
                })(),
                tokenSource.token,
                typeof requestedModelId === 'string' ? requestedModelId : undefined
              );

              if (tokenSource.token.isCancellationRequested) {
                await trackAIModalOutcome('cancelled', { stage: 'after-stream' });
              } else {
                await trackAIModalOutcome('success', {
                  modelId,
                });
              }

              // Notify the webview which model was used
              panel.webview.postMessage({
                command: 'aiModelUsed',
                data: { modelId, requestId: queryRequestId },
              });
            } catch (err) {
              if (tokenSource.token.isCancellationRequested) {
                await trackAIModalOutcome('cancelled', { stage: currentStage });
                panel.webview.postMessage({
                  command: 'aiStreamDone',
                  data: { requestId: queryRequestId },
                });
                break;
              }

              const errMsg = err instanceof Error ? err.message : String(err);
              await trackAIModalOutcome(currentStage === 'prepare' ? 'prepare-error' : 'error', {
                error: errMsg.slice(0, 180),
                stage: currentStage,
              });

              panel.webview.postMessage({
                command: 'aiStreamDone',
                data: { error: errMsg, requestId: queryRequestId },
              });
            } finally {
              if (this._aiQueryTokenSource === tokenSource) {
                this._aiQueryTokenSource = undefined;
              }
              if (this._activeAIQueryRequestId === queryRequestId) {
                this._activeAIQueryRequestId = undefined;
              }
              tokenSource.dispose();
            }
            break;
          }
          case 'aiParseCreation': {
            // Parse workspace/project creation intent via AI
            const {
              prompt: creationPrompt,
              mode: creationMode,
              framework: creationFw,
            } = message.data || {};
            if (!creationPrompt || creationPrompt === '__reset__') {
              this._panel.webview.postMessage({ command: 'aiCreationReset' });
              break;
            }
            const panel = this._panel;
            panel.webview.postMessage({ command: 'aiCreationThinking', data: { thinking: true } });
            try {
              const { parseCreationIntent } = await import('../../core/aiService.js');
              let workspacePath: string | undefined;
              if (WelcomePanel._selectedProject) {
                workspacePath = path.dirname(WelcomePanel._selectedProject.path);
              } else if (WelcomePanel._workspaceExplorer) {
                workspacePath = WelcomePanel._workspaceExplorer.getSelectedWorkspace()?.path;
              } else if (
                vscode.workspace.workspaceFolders &&
                vscode.workspace.workspaceFolders.length > 0
              ) {
                workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
              }
              const { plan, modelId } = await parseCreationIntent(
                creationPrompt,
                creationMode ?? 'workspace',
                creationFw,
                workspacePath
              );
              panel.webview.postMessage({ command: 'aiCreationPlan', data: { plan, modelId } });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              panel.webview.postMessage({ command: 'aiCreationError', data: { error: errMsg } });
            } finally {
              panel.webview.postMessage({
                command: 'aiCreationThinking',
                data: { thinking: false },
              });
            }
            break;
          }
          case 'aiCreateConfirm': {
            // Execute workspace + project creation from AI plan
            const plan = message.data;
            if (!plan) {
              break;
            }
            const panel = this._panel;
            panel.webview.postMessage({ command: 'aiCreationStarted' });
            try {
              if (plan.type === 'workspace') {
                // Create workspace with the AI-resolved config
                const wsConfig = {
                  name: plan.workspaceName,
                  profile: plan.profile,
                  installMethod: plan.installMethod ?? 'auto',
                  initGit: true,
                  policyMode: 'warn',
                  dependencySharing: 'isolated',
                };
                await vscode.commands.executeCommand('workspai.createWorkspace', wsConfig);

                // Compute the expected workspace path (always created under ~/Workspai/rapidkits/<name>)
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const os = require('os') as typeof import('os');
                const wsPath = path.join(os.homedir(), 'Workspai', 'rapidkits', plan.workspaceName);
                const wsExists = await fs.pathExists(wsPath);

                if (wsExists && plan.projectName) {
                  // Workspace was created — now create the first project inside it.
                  // Notify the UI that the workspace stage is complete BEFORE attempting
                  // project creation so the user always knows their workspace exists even
                  // if the project step fails.
                  panel.webview.postMessage({
                    command: 'aiCreationProgress',
                    data: { stage: 'workspace_done', workspacePath: wsPath },
                  });
                  try {
                    const { createProjectCommand } =
                      await import('../../commands/createProject.js');
                    await createProjectCommand(wsPath, plan.framework, plan.projectName, plan.kit);
                  } catch (projErr) {
                    // Workspace is intact — only project creation failed.
                    // Send a partial-success rather than a generic top-level error so the
                    // user knows exactly what happened and can retry from the sidebar.
                    const projErrMsg = projErr instanceof Error ? projErr.message : String(projErr);
                    panel.webview.postMessage({
                      command: 'aiCreationDone',
                      data: {
                        plan,
                        workspaceCreated: true,
                        projectError: projErrMsg,
                        workspacePath: wsPath,
                      },
                    });
                    return;
                  }
                }

                panel.webview.postMessage({
                  command: 'aiCreationDone',
                  data: { plan, workspaceCreated: wsExists },
                });
              } else {
                // Project-only creation (inside existing selected workspace).
                // Prefer the workspace path that was captured when the modal opened (passed from
                // the webview via plan.targetWorkspacePath) so we don't silently create in a
                // different workspace if the user changed the sidebar selection while the modal
                // was open.
                const workspacePath: string | undefined =
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (plan as any).targetWorkspacePath ||
                  WelcomePanel._workspaceExplorer?.getSelectedWorkspace()?.path;
                const { createProjectCommand } = await import('../../commands/createProject.js');
                await createProjectCommand(
                  workspacePath,
                  plan.framework,
                  plan.projectName,
                  plan.kit
                );
                panel.webview.postMessage({ command: 'aiCreationDone', data: { plan } });
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              panel.webview.postMessage({ command: 'aiCreationError', data: { error: errMsg } });
              panel.webview.postMessage({
                command: 'aiCreationThinking',
                data: { thinking: false },
              });
            }
            break;
          }
          case 'refreshWorkspaces':
            CoreVersionService.getInstance().clearCache();
            this._sendRecentWorkspaces();
            break;
          case 'getUiPreferences':
            this._sendUiPreferences();
            break;
          case 'setUiPreference':
            if (message.data?.key) {
              await this._setUiPreference(String(message.data.key), message.data.value);
            }
            break;
          case 'cloneExample':
            if (message.data) {
              await this._cloneExample(message.data);
            }
            break;
          case 'updateExample':
            if (message.data) {
              await this._updateExample(message.data);
            }
            break;
          case 'openWorkspaceFolder':
            if (message.data?.path) {
              await openWorkspace(message.data.path);
            }
            break;
          case 'selectWorkspace':
            if (message.data) {
              await vscode.commands.executeCommand('workspai.selectWorkspace', message.data);
              // Send updated workspace status
              await this._sendWorkspaceStatus();
            }
            break;
          case 'removeWorkspace':
            if (message.data) {
              await vscode.commands.executeCommand('workspai.removeWorkspace', message.data);
            }
            break;
          case 'refreshModules':
            this._sendModulesCatalog();
            break;
          case 'requestWorkspaceToolStatus':
            await this._sendWorkspaceToolStatus();
            break;
          case 'requestIncidentStudioTelemetry':
            await this._sendIncidentStudioTelemetry(
              message.data?.workspacePath,
              message.data?.forceRefresh === true
            );
            break;
          case 'aiChatStart':
            await this._handleAiChatStart(message.data, protocolRequestId);
            break;
          case 'aiChatSyncWorkspace':
            await this._handleAiChatSyncWorkspace(message.data, protocolRequestId);
            break;
          case 'aiChatQuery':
            await this._handleAiChatQuery(message.data, protocolRequestId);
            break;
          case 'aiChatExecuteAction':
            await this._handleAiChatExecuteAction(message.data, protocolRequestId);
            break;
          case 'aiChatApplyPatch':
            await this._handleApplyPatch(message.data, protocolRequestId);
            break;
          case 'exportIncidentReproPack':
            await this._handleExportIncidentReproPack(message.data, protocolRequestId);
            break;
          case 'exportSandboxSimulationEvidence':
            await this._handleExportSandboxSimulationEvidence(message.data, protocolRequestId);
            break;
          case 'importIncidentReproPack':
            await this._handleImportIncidentReproPack(protocolRequestId);
            break;
          case 'incidentPredictionAccepted': {
            const conversationId =
              typeof message.data?.conversationId === 'string'
                ? message.data.conversationId
                : undefined;
            const conv = conversationId
              ? this._chatBrainConversations.get(conversationId)
              : undefined;
            const explicitWorkspacePath =
              typeof message.data?.workspacePath === 'string' && message.data.workspacePath.trim()
                ? message.data.workspacePath.trim()
                : undefined;

            this._trackStudioEvent(
              'workspai.studio.prediction_accepted',
              explicitWorkspacePath || conv?.workspacePath,
              {
                conversationId,
                warningId:
                  typeof message.data?.warningId === 'string' ? message.data.warningId : undefined,
                predictionKey:
                  typeof message.data?.predictionKey === 'string'
                    ? message.data.predictionKey
                    : undefined,
                framework: conv?.framework ?? 'unknown',
              }
            );
            break;
          }
          case 'aiChatFeedback':
            this._panel.webview.postMessage({
              command: 'aiChatDone',
              data: {
                conversationId: message.data?.conversationId,
                messageId: message.data?.messageId || `feedback-${Date.now()}`,
                phase: 'learn',
                confidence: 75,
                nextActions: ['Continue investigation', 'Run verification checks'],
              },
              meta: { requestId: protocolRequestId, version: 'v1' },
            });
            break;
          case 'aiChatClose': {
            const conversationId = message.data?.conversationId;
            if (typeof conversationId === 'string') {
              const conv = this._chatBrainConversations.get(conversationId);
              if (conv) {
                const resumeSnapshot = buildIncidentResumeSnapshot(conv);
                if (resumeSnapshot) {
                  this._incidentResumeByWorkspace.set(resumeSnapshot.workspacePath, resumeSnapshot);
                }

                const durationMs = Date.now() - conv.startedAt;
                const hasExchange = conv.history.length > 0;
                const resolved = typeof conv.verifyPassedAt === 'number';

                if (resolved) {
                  // ── Analytics: incident_loop_completed ───────────────────
                  this._trackStudioEvent('workspai.studio.loop_completed', conv.workspacePath, {
                    framework: conv.framework ?? 'unknown',
                    durationMs,
                    queryCount: conv.queryCount,
                    actionCount: conv.actionCount,
                    timeToVerifyMs: conv.verifyPassedAt! - conv.startedAt,
                  });
                } else if (hasExchange) {
                  // ── Analytics: incident_abandoned ─────────────────────────
                  this._trackStudioEvent('workspai.studio.abandoned', conv.workspacePath, {
                    framework: conv.framework ?? 'unknown',
                    durationMs,
                    queryCount: conv.queryCount,
                    actionCount: conv.actionCount,
                  });
                }

                this._chatBrainConversations.delete(conversationId);
              }
            }
            break;
          }
          case 'installModule': {
            if (message.data) {
              // Construct full module object like stable welcomePanel does
              const moduleData = message.data;
              const moduleObj = {
                id: moduleData.id,
                displayName: moduleData.display_name || moduleData.name,
                description: moduleData.description || '',
                category: moduleData.category || 'unknown',
                status: moduleData.status || 'stable',
                tags: moduleData.tags || [],
                dependencies: moduleData.dependencies || [],
                installed: false,
                slug: moduleData.slug || `unknown/${moduleData.id}`,
              };
              await vscode.commands.executeCommand('workspai.addModule', moduleObj);
            }
            break;
          }
          case 'showModuleDetails':
            if (message.data) {
              const moduleId = message.data;
              const moduleData = MODULES.find((m) => m.id === moduleId || m.slug === moduleId);
              if (moduleData) {
                await this._showModuleDetails(moduleData);
              } else {
                console.error('Module not found:', moduleId);
              }
            }
            break;
          case 'openDocs':
            await vscode.env.openExternal(vscode.Uri.parse('https://getrapidkit.com/docs'));
            break;
          case 'openGitHub':
            await vscode.env.openExternal(vscode.Uri.parse('https://github.com/rapidkit/rapidkit'));
            break;
          case 'openMarketplace':
            await vscode.env.openExternal(
              vscode.Uri.parse(
                'https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit'
              )
            );
            break;
          case 'openUrl':
            if (message.data?.url) {
              await vscode.env.openExternal(vscode.Uri.parse(message.data.url));
            }
            break;
          case 'upgradeCore':
            if (message.data?.path) {
              const workspacePath = message.data.path;
              const targetVersion = message.data.version;

              // Detect if workspace has venv
              const venvPath = path.join(workspacePath, '.venv');
              const hasVenv = await fs.pathExists(venvPath);

              runCommandsInTerminal({
                name: `Upgrade RapidKit Core`,
                cwd: workspacePath,
                commands: [hasVenv ? 'poetry update rapidkit-core' : 'pipx upgrade rapidkit-core'],
              });

              vscode.window.showInformationMessage(
                `Upgrading RapidKit Core${targetVersion ? ` to v${targetVersion}` : ''}...`,
                'OK'
              );
            }
            break;

          case 'checkWorkspaceHealth':
            console.log('[WelcomePanel] Check Workspace Health requested for:', message.data?.path);
            if (message.data?.path) {
              vscode.commands.executeCommand('workspai.checkWorkspaceHealth', {
                path: message.data.path,
              });
            }
            break;

          case 'exportWorkspace':
            console.log('[WelcomePanel] Export Workspace requested for:', message.data?.path);
            if (message.data?.path) {
              vscode.commands.executeCommand('workspai.exportWorkspace', {
                path: message.data.path,
              });
            }
            break;
          case 'aiForWorkspace':
            WelcomePanel.showAIModal(WelcomePanel._extensionContext!, {
              type: 'workspace',
              name: message.data?.workspaceName || 'Workspace',
              path: message.data?.workspacePath,
            });
            break;
          case 'aiForModule':
            WelcomePanel.showAIModal(WelcomePanel._extensionContext!, {
              type: 'module',
              name: message.data?.moduleName || 'Module',
              moduleSlug: message.data?.moduleSlug,
            });
            break;
          case 'aiFixPreviewLite':
            await vscode.commands.executeCommand('workspai.aiFixPreviewLite', {
              source: 'dashboard',
              trigger: 'card_click',
            });
            break;
          case 'aiChangeImpactLite':
            await vscode.commands.executeCommand('workspai.aiChangeImpactLite', {
              source: 'dashboard',
              trigger: 'card_click',
            });
            break;
          case 'aiTerminalBridge':
            await vscode.commands.executeCommand('workspai.aiTerminalBridge', {
              source: 'dashboard',
              trigger: 'card_click',
            });
            break;
          case 'aiWorkspaceMemoryWizard':
            await vscode.commands.executeCommand('workspai.aiWorkspaceMemoryWizard', {
              source: 'dashboard',
              trigger: 'incident_studio',
            });
            break;
          case 'runDoctorChecks':
            {
              const explicitWorkspacePath =
                typeof message.data?.workspacePath === 'string' && message.data.workspacePath.trim()
                  ? message.data.workspacePath.trim()
                  : undefined;
              const selectedWorkspace = this._getSelectedWorkspaceInfo();
              const workspacePath = explicitWorkspacePath || selectedWorkspace?.path;
              const workspaceName =
                (typeof message.data?.workspaceName === 'string' &&
                  message.data.workspaceName.trim()) ||
                selectedWorkspace?.name ||
                (workspacePath ? path.basename(workspacePath) : undefined);

              if (!workspacePath) {
                vscode.window.showWarningMessage('Select a workspace first.');
                break;
              }

              runRapidkitCommandsInTerminal({
                name: `Workspai: Doctor - ${workspaceName}`,
                cwd: workspacePath,
                commands: [['doctor', 'workspace']],
              });

              this._trackStudioEvent('workspai.studio.action_executed', workspacePath, {
                actionType: 'doctor-workspace-check',
                workspaceName: workspaceName || path.basename(workspacePath),
              });
            }
            break;
          case 'openIncidentNavigatorTarget':
            {
              const targetPath =
                typeof message.data?.path === 'string' ? message.data.path.trim() : '';
              const targetKind =
                typeof message.data?.kind === 'string' ? message.data.kind.trim() : 'file';
              const targetLabel =
                typeof message.data?.label === 'string' && message.data.label.trim()
                  ? message.data.label.trim()
                  : targetPath;
              const targetSymbol =
                typeof message.data?.symbolName === 'string' && message.data.symbolName.trim()
                  ? message.data.symbolName.trim()
                  : undefined;
              const rawTargetLine = Number(message.data?.startLine);
              const targetLine =
                Number.isFinite(rawTargetLine) && rawTargetLine > 0
                  ? Math.floor(rawTargetLine)
                  : undefined;
              const explicitWorkspacePath =
                typeof message.data?.workspacePath === 'string' && message.data.workspacePath.trim()
                  ? message.data.workspacePath.trim()
                  : undefined;
              const explicitProjectPath =
                typeof message.data?.projectPath === 'string' && message.data.projectPath.trim()
                  ? message.data.projectPath.trim()
                  : undefined;
              const selectedWorkspace = this._getSelectedWorkspaceInfo();
              const workspacePath = explicitWorkspacePath || selectedWorkspace?.path;
              const projectPath =
                explicitProjectPath ||
                (WelcomePanel._selectedProject?.path &&
                isWorkspacePathAncestor(workspacePath, WelcomePanel._selectedProject.path)
                  ? WelcomePanel._selectedProject.path
                  : undefined);

              if (!targetPath) {
                vscode.window.showWarningMessage('No impact target was provided.');
                break;
              }

              const resolvedTargetPath = resolveIncidentNavigatorTargetPath({
                targetPath,
                workspacePath,
                projectPath,
              });

              if (!resolvedTargetPath) {
                vscode.window.showWarningMessage(`Could not resolve impact target: ${targetLabel}`);
                break;
              }

              if (!(await fs.pathExists(resolvedTargetPath))) {
                vscode.window.showWarningMessage(
                  `Impact target is not available in this workspace: ${targetLabel}`
                );
                break;
              }

              const targetStat = await fs.stat(resolvedTargetPath);
              if (!targetStat.isFile()) {
                vscode.window.showWarningMessage(
                  `Impact target is not an openable file: ${targetLabel}`
                );
                break;
              }

              const document = await vscode.workspace.openTextDocument(
                vscode.Uri.file(resolvedTargetPath)
              );
              const editor = await vscode.window.showTextDocument(document, { preview: false });
              const selection = findIncidentNavigatorSelection(document.getText(), {
                symbolName: targetSymbol,
                startLine: targetLine,
              });
              if (selection) {
                const range = new vscode.Range(
                  selection.line,
                  selection.startCharacter,
                  selection.line,
                  selection.endCharacter
                );
                editor.selection = new vscode.Selection(range.start, range.end);
                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
              }

              if (workspacePath) {
                this._trackStudioEvent('workspai.studio.scope_navigator_opened', workspacePath, {
                  targetKind: targetKind.slice(0, 40),
                  targetLabel: targetLabel.slice(0, 180),
                  ...(targetSymbol ? { targetSymbol: targetSymbol.slice(0, 180) } : {}),
                });
              }
            }
            break;
          case 'runIncidentInlineCommand':
            {
              const inlineCommand =
                typeof message.data?.command === 'string' ? message.data.command.trim() : '';
              const explicitWorkspacePath =
                typeof message.data?.workspacePath === 'string' && message.data.workspacePath.trim()
                  ? message.data.workspacePath.trim()
                  : undefined;
              const selectedWorkspace = this._getSelectedWorkspaceInfo();
              const workspacePath = explicitWorkspacePath || selectedWorkspace?.path;
              const selectedProjectPath = WelcomePanel._selectedProject?.path;
              const selectedProjectBelongsToWorkspace = isWorkspacePathAncestor(
                workspacePath,
                selectedProjectPath
              );

              if (!inlineCommand) {
                vscode.window.showWarningMessage('No command provided to run.');
                break;
              }
              if (!workspacePath) {
                this._panel.webview.postMessage({
                  command: 'runIncidentInlineCommandDone',
                  data: {
                    command: inlineCommand,
                    success: false,
                    error: 'No workspace selected. Open a workspace first.',
                  },
                  meta: { requestId: protocolRequestId, version: 'v1' },
                });
                break;
              }

              // Execute command and capture output for feedback loop
              (async () => {
                try {
                  let finalCommand = inlineCommand;
                  const normalizedCommand = inlineCommand.replace(/\s+/g, ' ').trim();
                  const isWorkspaceScopedRapidkitCommand =
                    /^(?:npx\s+rapidkit|rapidkit|poetry\s+run\s+rapidkit|\.\/\.venv\/bin\/rapidkit|\.\/rapidkit)\s+(?:create(?:\s+workspace|\s+project)?|bootstrap\b|setup\b|workspace\b|cache\b|mirror\b|doctor\s+workspace\b)/.test(
                      normalizedCommand
                    );
                  const effectiveCwd =
                    !isWorkspaceScopedRapidkitCommand &&
                    selectedProjectPath &&
                    selectedProjectBelongsToWorkspace
                      ? selectedProjectPath
                      : workspacePath;

                  // Resolve rapidkit → project launcher or workspace venv binary when available
                  const isRapidkitCmd = /^rapidkit\b/.test(inlineCommand);
                  if (isRapidkitCmd) {
                    const projectLauncher =
                      effectiveCwd && (await fs.pathExists(path.join(effectiveCwd, 'rapidkit')))
                        ? path.join(effectiveCwd, 'rapidkit')
                        : undefined;
                    const venvRapidkit = path.join(workspacePath, '.venv', 'bin', 'rapidkit');
                    const hasVenvBin = await fs.pathExists(venvRapidkit);
                    if (projectLauncher && effectiveCwd === selectedProjectPath) {
                      finalCommand = './rapidkit' + inlineCommand.slice('rapidkit'.length);
                    } else if (hasVenvBin) {
                      finalCommand = venvRapidkit + inlineCommand.slice('rapidkit'.length);
                    } else {
                      const poetryLock = effectiveCwd
                        ? await fs.pathExists(path.join(effectiveCwd, 'pyproject.toml'))
                        : false;
                      if (poetryLock) {
                        finalCommand = 'poetry run ' + inlineCommand;
                      }
                    }
                  }

                  // Run via shell so quotes/pipes/redirects are handled natively
                  const result = await run('sh', ['-c', finalCommand], {
                    cwd: effectiveCwd,
                    shell: false,
                    timeout: 60_000,
                    reject: false,
                  });

                  const combinedOutput = [result.stdout, result.stderr]
                    .filter(Boolean)
                    .join('\n')
                    .trim();
                  const output = combinedOutput || 'Command completed with no output.';
                  const truncatedOutput = output.split('\n').slice(0, 30).join('\n');

                  // exitCode 0 → success; non-zero → treat as failure with output
                  const success = result.exitCode === 0;

                  this._trackStudioEvent('workspai.studio.action_executed', workspacePath, {
                    actionType: 'inline-command',
                    command: inlineCommand.slice(0, 180),
                    projectScoped:
                      !!selectedProjectPath &&
                      selectedProjectBelongsToWorkspace &&
                      effectiveCwd === selectedProjectPath,
                    success,
                    exitCode: result.exitCode,
                  });

                  this._trackStudioEvent(
                    success ? 'workspai.studio.verify_passed' : 'workspai.studio.verify_failed',
                    workspacePath,
                    {
                      actionType: 'inline-command',
                      command: inlineCommand.slice(0, 180),
                      exitCode: result.exitCode,
                    }
                  );

                  this._panel.webview.postMessage({
                    command: 'runIncidentInlineCommandDone',
                    data: {
                      command: inlineCommand,
                      success,
                      output: success ? truncatedOutput : undefined,
                      error: !success ? `Exit ${result.exitCode}: ${truncatedOutput}` : undefined,
                    },
                    meta: { requestId: protocolRequestId, version: 'v1' },
                  });
                } catch (error) {
                  const errorMsg = error instanceof Error ? error.message : String(error);
                  this._trackStudioEvent('workspai.studio.action_executed', workspacePath, {
                    actionType: 'inline-command',
                    command: inlineCommand.slice(0, 180),
                    success: false,
                    error: String(errorMsg).slice(0, 180),
                  });
                  this._trackStudioEvent('workspai.studio.verify_failed', workspacePath, {
                    actionType: 'inline-command',
                    command: inlineCommand.slice(0, 180),
                    error: String(errorMsg).slice(0, 180),
                  });
                  this._panel.webview.postMessage({
                    command: 'runIncidentInlineCommandDone',
                    data: {
                      command: inlineCommand,
                      success: false,
                      error: errorMsg,
                    },
                    meta: { requestId: protocolRequestId, version: 'v1' },
                  });
                }
              })();
            }
            break;
          case 'projectTerminal':
            if (WelcomePanel._selectedProject) {
              await vscode.commands.executeCommand('workspai.projectTerminal', {
                projectPath: WelcomePanel._selectedProject.path,
              });
            }
            break;
          case 'projectInit':
            if (WelcomePanel._selectedProject) {
              await vscode.commands.executeCommand('workspai.projectInit', {
                projectPath: WelcomePanel._selectedProject.path,
              });
            }
            break;
          case 'projectDev':
            if (WelcomePanel._selectedProject) {
              await vscode.commands.executeCommand('workspai.projectDev', {
                projectPath: WelcomePanel._selectedProject.path,
              });
            }
            break;
          case 'projectStop':
            if (WelcomePanel._selectedProject) {
              await vscode.commands.executeCommand('workspai.projectStop', {
                projectPath: WelcomePanel._selectedProject.path,
              });
            }
            break;
          case 'projectTest':
            if (WelcomePanel._selectedProject) {
              await vscode.commands.executeCommand('workspai.projectTest', {
                projectPath: WelcomePanel._selectedProject.path,
              });
            }
            break;
          case 'projectBrowser':
            if (WelcomePanel._selectedProject) {
              await vscode.commands.executeCommand('workspai.projectBrowser', {
                projectPath: WelcomePanel._selectedProject.path,
              });
            }
            break;
          case 'projectBuild':
            if (WelcomePanel._selectedProject) {
              runRapidkitCommandsInTerminal({
                name: `Build ${WelcomePanel._selectedProject.name}`,
                cwd: WelcomePanel._selectedProject.path,
                commands: [['build']],
              });
              vscode.window.showInformationMessage(
                `Building ${WelcomePanel._selectedProject.name}...`,
                'OK'
              );
            }
            break;
        }
      },
      null,
      this._disposables
    );

    // Clean up when panel is closed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private _registerDoctorEvidenceWatcher() {
    const watcher = vscode.workspace.createFileSystemWatcher(
      '**/.rapidkit/reports/doctor-last-run.json',
      false,
      false,
      true
    );

    const scheduleRefresh = (uri?: vscode.Uri) => {
      this._doctorTelemetryRefreshController.schedule(uri?.fsPath);
    };

    watcher.onDidCreate((uri) => scheduleRefresh(uri));
    watcher.onDidChange((uri) => scheduleRefresh(uri));
    watcher.onDidDelete((uri) => scheduleRefresh(uri));

    this._disposables.push(watcher);
  }

  public static createOrShow(context: vscode.ExtensionContext) {
    // If panel exists, show it
    if (WelcomePanel.currentPanel) {
      WelcomePanel.currentPanel._panel.reveal();
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'rapidkitWelcomeReact',
      'Workspai Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
          vscode.Uri.joinPath(context.extensionUri, 'media'),
        ],
      }
    );

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'workspai.svg');

    WelcomePanel.currentPanel = new WelcomePanel(panel, context);
  }

  private _sendInitialData() {
    this._sendVersion();
    this._sendRecentWorkspaces();
    this._sendExampleWorkspaces();
    this._sendAvailableKits();
    this._sendModulesCatalog();
    this._sendWorkspaceStatus();
    this._sendWorkspaceToolStatus();
    this._sendUiPreferences();
  }

  private async _sendWorkspaceToolStatus() {
    const python = await checkPythonEnvironmentCached();
    const poetryAvailable = await isPoetryInstalledCached();

    let pipxAvailable = false;
    const pipxCandidates: Array<{ command: string; args: string[] }> =
      process.platform === 'win32'
        ? [
            { command: 'python', args: ['-m', 'pipx', '--version'] },
            { command: 'py', args: ['-m', 'pipx', '--version'] },
            { command: 'pipx', args: ['--version'] },
          ]
        : [
            { command: 'pipx', args: ['--version'] },
            { command: 'python3', args: ['-m', 'pipx', '--version'] },
            { command: 'python', args: ['-m', 'pipx', '--version'] },
          ];

    for (const candidate of pipxCandidates) {
      try {
        const result = await run(candidate.command, candidate.args, {
          timeout: 3000,
          stdio: 'pipe',
        });
        if (result.exitCode === 0) {
          pipxAvailable = true;
          break;
        }
      } catch {
        continue;
      }
    }

    const venvAvailable = python.available && python.venvSupport;
    const preferredInstallMethod = poetryAvailable ? 'poetry' : pipxAvailable ? 'pipx' : 'venv';

    const probeBinaryWithFallbacks = async (
      primaryCmd: string,
      args: string[],
      fallbacks: string[] = []
    ): Promise<{ available: boolean; version: string | null; resolvedPath: string | null }> => {
      const candidates = [primaryCmd, ...fallbacks];
      for (const cmd of candidates) {
        try {
          const result = await run(cmd, args, { timeout: 4000, stdio: 'pipe' });
          if (result.exitCode === 0) {
            const raw = (result.stdout || result.stderr || '').trim();
            const versionMatch = raw.match(/(\d+[.\d]*)/);
            return {
              available: true,
              version: versionMatch?.[0] || null,
              resolvedPath: cmd,
            };
          }
        } catch {
          // try next
        }
      }
      return { available: false, version: null, resolvedPath: null };
    };

    const javaHome = process.env.JAVA_HOME?.trim();
    const mavenHome = (process.env.MAVEN_HOME || process.env.M2_HOME)?.trim();
    const gradleHome = process.env.GRADLE_HOME?.trim();
    const sdkmanBase = `${process.env.HOME || '~'}/.sdkman/candidates`;
    const sep = process.platform === 'win32' ? '\\' : '/';

    const javaFallbacks = [
      ...(javaHome ? [`${javaHome}${sep}bin${sep}java`] : []),
      '/usr/lib/jvm/temurin-21/bin/java',
      '/usr/lib/jvm/java-21-openjdk-amd64/bin/java',
      '/usr/lib/jvm/java-17-openjdk-amd64/bin/java',
      `${sdkmanBase}/java/current/bin/java`,
    ].filter(Boolean);

    const mavenFallbacks = [
      ...(mavenHome ? [`${mavenHome}${sep}bin${sep}mvn`] : []),
      `${sdkmanBase}/maven/current/bin/mvn`,
      '/usr/local/maven/bin/mvn',
    ].filter(Boolean);

    const gradleFallbacks = [
      ...(gradleHome ? [`${gradleHome}${sep}bin${sep}gradle`] : []),
      `${sdkmanBase}/gradle/current/bin/gradle`,
      '/usr/local/gradle/bin/gradle',
    ].filter(Boolean);

    const [javaResult, mavenResult, gradleResult] = await Promise.all([
      probeBinaryWithFallbacks('java', ['-version'], javaFallbacks),
      probeBinaryWithFallbacks('mvn', ['--version'], mavenFallbacks),
      probeBinaryWithFallbacks('gradle', ['--version'], gradleFallbacks),
    ]);

    const javaAvailable = javaResult.available;
    const mavenAvailable = mavenResult.available;
    const gradleAvailable = gradleResult.available;

    this._panel.webview.postMessage({
      command: 'workspaceToolStatus',
      data: {
        pythonAvailable: python.available,
        venvAvailable,
        poetryAvailable,
        pipxAvailable,
        javaAvailable,
        mavenAvailable,
        gradleAvailable,
        preferredInstallMethod,
      },
    });
  }

  private _resolveTelemetryWorkspacePath(): string | undefined {
    if (WelcomePanel._selectedProject) {
      return path.dirname(WelcomePanel._selectedProject.path);
    }
    if (WelcomePanel._workspaceExplorer) {
      return WelcomePanel._workspaceExplorer.getSelectedWorkspace()?.path;
    }
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    return undefined;
  }

  private _hashSeedToNumber(seed: string): number {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
  }

  private _getIncidentPrimaryCtaExperimentVariant(workspacePath?: string): 'single' | 'multi' {
    const seed = workspacePath || this._resolveTelemetryWorkspacePath() || 'global';
    return this._hashSeedToNumber(seed) % 2 === 0 ? 'single' : 'multi';
  }

  private _trackStudioEvent(
    command: string,
    workspacePath?: string,
    properties?: Record<string, unknown>
  ) {
    const resolvedWorkspacePath = workspacePath || this._resolveTelemetryWorkspacePath();
    void WorkspaceUsageTracker.getInstance().trackCommandEvent(command, resolvedWorkspacePath, {
      source: 'incident_studio',
      ctaVariant: this._getIncidentPrimaryCtaExperimentVariant(resolvedWorkspacePath),
      ...(properties || {}),
    });
  }

  private _emitArchitectureReasoningRuntimeEvents(input: {
    conversationId: string;
    actionId: string;
    actionType: string;
    workspacePath: string;
    framework?: string;
    wave2Contracts: {
      impactAssessment: {
        confidence: number;
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
      };
      releaseGateEvidence: {
        scopeKnown: boolean;
        verifyPathPresent: boolean;
        rollbackPathPresent: boolean;
        blockedReasons: string[];
      };
      architectureTelemetry: {
        warningCount: number;
        warnings: string[];
        unknownScopeBlocked: boolean;
      };
    };
    verifySuccess: boolean;
  }) {
    const { wave2Contracts } = input;
    const warningCount = wave2Contracts.architectureTelemetry.warningCount;
    const unknownScopeBlocked = wave2Contracts.architectureTelemetry.unknownScopeBlocked;

    if (warningCount <= 0 && !unknownScopeBlocked) {
      return;
    }

    const commonProps = {
      conversationId: input.conversationId,
      actionId: input.actionId,
      actionType: input.actionType,
      framework: input.framework ?? 'unknown',
      riskLevel: wave2Contracts.impactAssessment.riskLevel,
      confidence: wave2Contracts.impactAssessment.confidence,
      warningCount,
      scopeKnown: wave2Contracts.releaseGateEvidence.scopeKnown,
      verifyPathPresent: wave2Contracts.releaseGateEvidence.verifyPathPresent,
      rollbackPathPresent: wave2Contracts.releaseGateEvidence.rollbackPathPresent,
      blockedReasonCount: wave2Contracts.releaseGateEvidence.blockedReasons.length,
    };

    if (warningCount > 0) {
      const warningSample = wave2Contracts.architectureTelemetry.warnings.slice(0, 2).join(' | ');

      this._trackStudioEvent('workspai.studio.architecture_warning_shown', input.workspacePath, {
        ...commonProps,
        warnings: warningSample,
      });

      this._trackStudioEvent('workspai.studio.architecture_warning_accepted', input.workspacePath, {
        ...commonProps,
        warnings: warningSample,
      });

      this._trackStudioEvent(
        input.verifySuccess
          ? 'workspai.studio.architecture_warning_falsified'
          : 'workspai.studio.architecture_breakage_prevented',
        input.workspacePath,
        {
          ...commonProps,
          warnings: warningSample,
          verifySuccess: input.verifySuccess,
        }
      );
    }

    if (unknownScopeBlocked) {
      const blockedReasonSample = wave2Contracts.releaseGateEvidence.blockedReasons
        .filter((reason) => /scope is unknown/i.test(reason))
        .slice(0, 2)
        .join(' | ');

      this._trackStudioEvent(
        'workspai.studio.architecture_unknown_scope_blocked',
        input.workspacePath,
        {
          ...commonProps,
          blockedReasons: blockedReasonSample,
        }
      );
    }
  }

  private async _inferFrameworkFromWorkspace(workspacePath: string): Promise<string> {
    const checks: Array<{ framework: string; file: string }> = [
      { framework: 'fastapi', file: path.join(workspacePath, 'src', 'main.py') },
      { framework: 'nestjs', file: path.join(workspacePath, 'src', 'main.ts') },
      { framework: 'go', file: path.join(workspacePath, 'go.mod') },
      { framework: 'springboot', file: path.join(workspacePath, 'pom.xml') },
    ];

    for (const check of checks) {
      if (await fs.pathExists(check.file)) {
        return check.framework;
      }
    }

    return 'unknown';
  }

  private async _getWorkspaceGraphSnapshot(
    workspacePath?: string
  ): Promise<IncidentWorkspaceGraphSnapshot> {
    const resolvedWorkspacePath = workspacePath || this._resolveTelemetryWorkspacePath();
    const tracker = WorkspaceUsageTracker.getInstance();
    const memoryService = WorkspaceMemoryService.getInstance();

    const selectedProject =
      WelcomePanel._selectedProject &&
      isWorkspacePathAncestor(resolvedWorkspacePath, WelcomePanel._selectedProject.path)
        ? WelcomePanel._selectedProject
        : null;
    const graphScanPath = selectedProject?.path || resolvedWorkspacePath;

    const [
      commandSummary,
      onboardingSummary,
      framework,
      doctorSnapshot,
      workspaceMemory,
      gitDiffStat,
      installedModules,
    ] = await Promise.all([
      tracker.getCommandTelemetrySummary(resolvedWorkspacePath, 'last7d'),
      tracker.getOnboardingExperimentStats(resolvedWorkspacePath, 'last7d'),
      resolvedWorkspacePath
        ? this._inferFrameworkFromWorkspace(resolvedWorkspacePath)
        : Promise.resolve('unknown'),
      this._readDoctorEvidenceSnapshot(resolvedWorkspacePath),
      resolvedWorkspacePath
        ? memoryService.readNearest(resolvedWorkspacePath)
        : Promise.resolve(undefined),
      graphScanPath ? getGitDiffStat(graphScanPath, 1500) : Promise.resolve(null),
      selectedProject
        ? WelcomePanel._readInstalledModules(selectedProject.path)
        : Promise.resolve([]),
    ] as const);

    const hasWorkspaceMemory = Boolean(
      workspaceMemory?.context ||
      workspaceMemory?.conventions?.length ||
      workspaceMemory?.decisions?.length
    );
    const hasDoctorEvidence = Boolean(doctorSnapshot);
    const hasGitDiff = Boolean(gitDiffStat && !gitDiffStat.includes('unavailable'));
    const hasProjectScope = Boolean(selectedProject);
    const doctorGeneratedAt =
      doctorSnapshot && typeof doctorSnapshot.generatedAt === 'string'
        ? doctorSnapshot.generatedAt
        : undefined;

    const doctorHealth = (() => {
      if (!doctorSnapshot) {
        return undefined;
      }

      const doctorRecord = doctorSnapshot as Record<string, unknown>;
      const healthRecord =
        doctorRecord.health && typeof doctorRecord.health === 'object'
          ? (doctorRecord.health as Record<string, unknown>)
          : undefined;

      const passed = Number(healthRecord?.passed ?? doctorRecord.passed ?? 0);
      const warnings = Number(healthRecord?.warnings ?? doctorRecord.warnings ?? 0);
      const errors = Number(healthRecord?.errors ?? doctorRecord.errors ?? 0);
      const total = passed + warnings + errors;
      const percent = Number(
        healthRecord?.percent ?? (total > 0 ? Math.round((passed / total) * 100) : 0)
      );

      return {
        passed,
        warnings,
        errors,
        total,
        percent,
      };
    })();

    return {
      snapshotVersion: 'v1',
      workspace: {
        path: resolvedWorkspacePath,
        name: resolvedWorkspacePath ? path.basename(resolvedWorkspacePath) : undefined,
      },
      project: {
        framework,
        kit: selectedProject?.type || 'unknown',
        selectedProject,
      },
      topology: {
        modulesCount: installedModules.length,
        topModules: installedModules.map((module) => module.slug).slice(0, 5),
      },
      doctor: {
        hasEvidence: hasDoctorEvidence,
        generatedAt: doctorGeneratedAt,
        health: doctorHealth,
      },
      git: {
        diffStat:
          gitDiffStat || 'Git context unavailable (not a repository or git is not installed).',
        hasDiffContext: hasGitDiff,
      },
      memory: {
        context: workspaceMemory?.context,
        conventionsCount: workspaceMemory?.conventions?.length || 0,
        decisionsCount: workspaceMemory?.decisions?.length || 0,
        hasMemory: hasWorkspaceMemory,
      },
      telemetry: {
        totalEvents: commandSummary?.totalEvents || 0,
        lastCommand: commandSummary?.lastCommand || null,
        onboardingFollowupClickThroughRate: onboardingSummary?.overallFollowupClickThroughRate || 0,
      },
      evidence: {
        hasDoctorEvidence,
        hasGitDiff,
        hasWorkspaceMemory,
        projectScoped: hasProjectScope,
      },
      completeness: hasDoctorEvidence && hasGitDiff ? 'fresh' : 'partial',
      lastUpdatedAt: Date.now(),
    };
  }

  private async _handleAiChatStart(data: any, requestId?: string) {
    const resumeConversationId =
      typeof data?.resumeConversationId === 'string' ? data.resumeConversationId : undefined;
    const conversationId = resumeConversationId || `conv-${Date.now()}`;

    const workspacePath = typeof data?.workspacePath === 'string' ? data.workspacePath : undefined;
    const projectPath =
      typeof data?.projectPath === 'string' && data.projectPath.trim()
        ? data.projectPath.trim()
        : undefined;
    const projectName =
      typeof data?.projectName === 'string' && data.projectName.trim()
        ? data.projectName.trim()
        : undefined;
    const projectType =
      typeof data?.projectType === 'string' && data.projectType.trim()
        ? data.projectType.trim()
        : undefined;
    const existingConversation = resumeConversationId
      ? this._chatBrainConversations.get(resumeConversationId)
      : undefined;

    const framework =
      existingConversation?.framework ||
      (projectPath
        ? await this._inferFrameworkFromWorkspace(projectPath)
        : workspacePath
          ? await this._inferFrameworkFromWorkspace(workspacePath)
          : undefined);

    const conversation = existingConversation || {
      workspacePath,
      projectPath,
      projectName,
      projectType,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      phase: 'detect' as const,
      history: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
      queryCount: 0,
      actionCount: 0,
      framework,
      importedIncidentReplay: undefined,
    };

    conversation.workspacePath = workspacePath || conversation.workspacePath;
    conversation.projectPath = projectPath || conversation.projectPath;
    conversation.projectName = projectName || conversation.projectName;
    conversation.projectType = projectType || conversation.projectType;
    conversation.framework = framework;
    if (workspacePath) {
      const pendingImportedReplay =
        this._pendingImportedIncidentReplayByWorkspace.get(workspacePath);
      if (pendingImportedReplay) {
        conversation.importedIncidentReplay = pendingImportedReplay;
        this._pendingImportedIncidentReplayByWorkspace.delete(workspacePath);
      }
    }
    this._chatBrainConversations.set(conversationId, conversation);

    const inlineResumeSnapshot = buildIncidentResumeSnapshot(conversation);
    if (inlineResumeSnapshot) {
      this._incidentResumeByWorkspace.set(inlineResumeSnapshot.workspacePath, inlineResumeSnapshot);
    }

    const cachedResumeSnapshot = workspacePath
      ? this._incidentResumeByWorkspace.get(workspacePath)
      : undefined;
    const resumeSnapshot = inlineResumeSnapshot || cachedResumeSnapshot;
    const resumed = Boolean(existingConversation || (resumeConversationId && resumeSnapshot));

    // ── Analytics: incident_loop_started ─────────────────────────────────────
    this._trackStudioEvent('workspai.studio.loop_started', workspacePath, {
      framework: framework ?? 'unknown',
      resumed,
    });

    this._panel.webview.postMessage({
      command: 'aiChatStarted',
      data: {
        conversationId,
        phase: conversation.phase,
        resumed,
        resumeSnapshot,
      },
      meta: { requestId, version: 'v1' },
    });
  }

  private async _handleAiChatSyncWorkspace(data: any, requestId?: string) {
    const workspacePath = typeof data?.workspacePath === 'string' ? data.workspacePath : undefined;

    // If a stream is active for another workspace, cancel it before applying sync.
    const activeConversationId = this._activeChatBrainConversationId;
    const activeConversation = activeConversationId
      ? this._chatBrainConversations.get(activeConversationId)
      : undefined;
    if (
      this._chatBrainQueryTokenSource &&
      activeConversation?.workspacePath &&
      workspacePath &&
      activeConversation.workspacePath !== workspacePath
    ) {
      this._chatBrainQueryTokenSource.cancel();
      this._chatBrainQueryTokenSource.dispose();
      this._chatBrainQueryTokenSource = undefined;
      this._activeChatBrainRequestId = undefined;
      this._activeChatBrainConversationId = undefined;
    }

    const selectedProjectPath =
      WelcomePanel._selectedProject &&
      isWorkspacePathAncestor(workspacePath, WelcomePanel._selectedProject.path)
        ? WelcomePanel._selectedProject.path
        : 'none';
    const cacheKey = `chat-brain-workspace-graph-${workspacePath || 'default'}-${selectedProjectPath}`;
    const now = Date.now();
    const cacheTtl = 2 * 60 * 1000;
    const forceRefresh = data?.forceRefresh === true;

    const cached = this._context.globalState.get<{ graph: any; timestamp: number }>(cacheKey);
    if (!forceRefresh && cached && now - cached.timestamp < cacheTtl) {
      this._panel.webview.postMessage({
        command: 'aiChatWorkspaceSynced',
        data: {
          workspacePath,
          selectedProjectPath: selectedProjectPath !== 'none' ? selectedProjectPath : undefined,
          snapshotVersion: String(cached.timestamp),
          graph: cached.graph,
          cacheHit: true,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    // Ensure a watcher is running for this workspace so file changes invalidate the cache.
    void this._ensureSystemGraphWatcher(workspacePath, cacheKey);

    const graph = await this._getWorkspaceGraphSnapshot(workspacePath);
    await this._context.globalState.update(cacheKey, { graph, timestamp: now });

    this._panel.webview.postMessage({
      command: 'aiChatWorkspaceSynced',
      data: {
        workspacePath,
        selectedProjectPath: selectedProjectPath !== 'none' ? selectedProjectPath : undefined,
        snapshotVersion: String(now),
        graph,
        cacheHit: false,
      },
      meta: { requestId, version: 'v1' },
    });
  }

  private _ensureSystemGraphWatcher(workspacePath: string | undefined, cacheKey: string): void {
    if (!workspacePath) {
      return;
    }
    if (this._systemGraphWatcherByPath.has(workspacePath)) {
      return;
    }
    // Start watcher in background; on any update, bust the globalState cache so
    // the next sync request re-indexes rather than serving a stale snapshot.
    void createProjectSystemGraphWatcher({
      workspacePath,
      useIncrementalCache: true,
      debounceMs: 300,
      onUpdate: (update) => {
        if (update.reason === 'initial') {
          return;
        }
        void this._context.globalState.update(cacheKey, undefined);
      },
    })
      .then((handle) => {
        if (!this._systemGraphWatcherByPath.has(workspacePath)) {
          this._systemGraphWatcherByPath.set(workspacePath, handle);
        } else {
          // Another call already registered a watcher while we were awaiting — dispose the duplicate.
          handle.dispose();
        }
      })
      .catch(() => {
        // Watcher creation is best-effort; panel remains functional without it.
      });
  }

  private _routeActionTypeFromMessage(
    message: string
  ):
    | 'terminal-bridge'
    | 'change-impact-lite'
    | 'fix-preview-lite'
    | 'workspace-memory-wizard'
    | 'doctor-fix'
    | 'recipe-pack'
    | 'incident-repro-pack'
    | 'orchestrate' {
    const normalized = message.toLowerCase();
    if (
      normalized.includes('error') ||
      normalized.includes('terminal') ||
      normalized.includes('timeout')
    ) {
      return 'terminal-bridge';
    }
    if (normalized.includes('impact') || normalized.includes('risk')) {
      return 'change-impact-lite';
    }
    if (
      normalized.includes('preview') ||
      normalized.includes('patch') ||
      normalized.includes('fix')
    ) {
      return 'fix-preview-lite';
    }
    if (normalized.includes('memory') || normalized.includes('convention')) {
      return 'workspace-memory-wizard';
    }
    if (
      normalized.includes('repro') ||
      normalized.includes('replay') ||
      normalized.includes('incident pack') ||
      normalized.includes('share incident')
    ) {
      return 'incident-repro-pack';
    }
    return 'orchestrate';
  }

  private async _buildChatBrainAIContext(options?: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
  }): Promise<import('../../core/aiService').AIModalContext> {
    const resolvedWorkspacePath = options?.workspacePath || this._resolveTelemetryWorkspacePath();
    const explicitProject =
      options?.projectPath &&
      (!resolvedWorkspacePath ||
        isWorkspacePathAncestor(resolvedWorkspacePath, options.projectPath))
        ? {
            path: options.projectPath,
            name: options.projectName,
            type: options.projectType,
          }
        : undefined;
    const selectedProject = explicitProject || WelcomePanel._selectedProject;
    const selectedProjectBelongsToWorkspace = isWorkspacePathAncestor(
      resolvedWorkspacePath,
      selectedProject?.path
    );
    const effectiveContextPath =
      selectedProjectBelongsToWorkspace && selectedProject
        ? selectedProject.path
        : resolvedWorkspacePath;
    const framework = effectiveContextPath
      ? await this._inferFrameworkFromWorkspace(effectiveContextPath)
      : 'unknown';

    return {
      type: selectedProjectBelongsToWorkspace ? 'project' : 'workspace',
      name:
        selectedProjectBelongsToWorkspace && selectedProject
          ? selectedProject.name || path.basename(selectedProject.path)
          : resolvedWorkspacePath
            ? path.basename(resolvedWorkspacePath)
            : 'Workspace',
      path: effectiveContextPath,
      framework:
        selectedProjectBelongsToWorkspace && selectedProject?.type
          ? selectedProject.type
          : framework,
      workspaceRootPath: resolvedWorkspacePath,
      projectRootPath:
        selectedProjectBelongsToWorkspace && selectedProject ? selectedProject.path : undefined,
    };
  }

  private async _buildProjectExecutionBlock(options: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
  }): Promise<string | undefined> {
    if (!options.projectPath) {
      return undefined;
    }

    const projectPath = options.projectPath;
    const framework = options.projectType || (await this._inferFrameworkFromWorkspace(projectPath));
    const lines: string[] = ['PROJECT EXECUTION STATE:'];

    lines.push(`- Selected project: ${options.projectName || path.basename(projectPath)}`);
    lines.push(`- Project path: ${projectPath}`);
    lines.push(`- Framework: ${framework || 'unknown'}`);

    if (framework === 'springboot') {
      const hasPom = await fs.pathExists(path.join(projectPath, 'pom.xml'));
      const hasGradle =
        (await fs.pathExists(path.join(projectPath, 'build.gradle'))) ||
        (await fs.pathExists(path.join(projectPath, 'build.gradle.kts')));
      const hasMavenWrapper =
        (await fs.pathExists(path.join(projectPath, 'mvnw'))) ||
        (await fs.pathExists(path.join(projectPath, 'mvnw.cmd')));
      const hasGradleWrapper =
        (await fs.pathExists(path.join(projectPath, 'gradlew'))) ||
        (await fs.pathExists(path.join(projectPath, 'gradlew.bat')));

      lines.push(
        `- Build files: ${hasPom ? 'pom.xml ' : ''}${hasGradle ? 'gradle ' : ''}`.trim() ||
          '- Build files: none detected'
      );
      lines.push(
        `- Wrappers present: maven=${hasMavenWrapper ? 'yes' : 'no'}, gradle=${hasGradleWrapper ? 'yes' : 'no'}`
      );

      if (!hasMavenWrapper && !hasGradleWrapper) {
        lines.push(
          '- Launch blocker: no Maven Wrapper or Gradle Wrapper is present. `rapidkit dev` will require system Maven or Gradle.'
        );
        lines.push(
          '- If `rapidkit init` is quiet, treat it as a warm-up step and explicitly re-check wrappers/build-tool readiness before recommending `rapidkit dev`.'
        );
        lines.push(
          '- The next step is usually to install Maven 3.9+ or Gradle 8+, or generate and commit the wrapper in the selected project root.'
        );
      } else {
        lines.push(
          '- Expected launch flow: rapidkit init -> rapidkit dev -> verify startup logs or the service health endpoint.'
        );
      }
    }

    if (framework === 'fastapi') {
      const hasVenv = await fs.pathExists(path.join(projectPath, '.venv'));
      lines.push(`- Python environment present: ${hasVenv ? 'yes' : 'no'}`);
      if (!hasVenv) {
        lines.push(
          '- Launch blocker: no project virtual environment detected yet. Prioritize `rapidkit init` before `rapidkit dev`.'
        );
      }
    }

    if (framework === 'nestjs') {
      const hasNodeModules = await fs.pathExists(path.join(projectPath, 'node_modules'));
      lines.push(`- node_modules present: ${hasNodeModules ? 'yes' : 'no'}`);
      if (!hasNodeModules) {
        lines.push(
          '- Launch blocker: dependencies not installed yet. Prioritize `rapidkit init` or package-manager install before `rapidkit dev`.'
        );
      }
    }

    if (framework === 'go') {
      const hasGoMod = await fs.pathExists(path.join(projectPath, 'go.mod'));
      const hasGoSum = await fs.pathExists(path.join(projectPath, 'go.sum'));
      lines.push(`- go.mod present: ${hasGoMod ? 'yes' : 'no'}`);
      lines.push(`- go.sum present: ${hasGoSum ? 'yes' : 'no'}`);
      if (hasGoMod && !hasGoSum) {
        lines.push(
          '- Launch blocker: dependencies likely not downloaded yet. Prioritize `rapidkit init` or `go mod tidy` before `rapidkit dev`.'
        );
      }
    }

    lines.push(
      '- Optimize for the path to a running service: install deps -> init -> dev -> verify.'
    );
    lines.push('- `Verify command` must be an actual shell command or file check, never prose.');

    return lines.join('\n');
  }

  private _buildSuggestedQuestions(actionType: string, message: string): string[] {
    if (actionType === 'terminal-bridge' || /error|traceback|failed/i.test(message)) {
      return [
        'Show me which files I need to change to fix this',
        'Run impact analysis before applying the fix',
        'Add this issue to workspace memory so it never happens again',
      ];
    }
    if (actionType === 'fix-preview-lite' || /fix|patch|bug/i.test(message)) {
      return [
        'What tests should I add to cover this fix?',
        'Check if this fix could break anything else',
        'Apply this fix and verify with doctor checks',
      ];
    }
    if (actionType === 'change-impact-lite' || /impact|risk|refactor/i.test(message)) {
      return [
        'Show me the safest order to make these changes',
        'What rollback plan should I have?',
        'Generate a test checklist for this change',
      ];
    }
    if (actionType === 'doctor-fix' || /doctor|health|issue/i.test(message)) {
      return [
        'Fix all remaining doctor issues automatically',
        'Explain why this issue happens in my project type',
        'Save this fix pattern to workspace memory',
      ];
    }
    if (/module|install|add service|database|auth/i.test(message)) {
      return [
        'What configuration do I need after adding this?',
        'Show me how to test this module is working',
        'What other modules pair well with this one?',
      ];
    }
    return [
      'Run a full workspace health check now',
      'Show me the next highest-priority action',
      'Save this analysis to workspace memory',
    ];
  }

  private async _buildStructuredIncidentPrompt(
    message: string,
    options?: {
      workspacePath?: string;
      projectPath?: string;
      projectName?: string;
      projectType?: string;
    }
  ): Promise<string> {
    const resolvedWorkspacePath = options?.workspacePath || this._resolveTelemetryWorkspacePath();
    const selectedProject = options?.projectPath
      ? {
          path: options.projectPath,
          name: options.projectName,
          type: options.projectType,
        }
      : WelcomePanel._selectedProject;
    const selectedProjectBelongsToWorkspace = isWorkspacePathAncestor(
      resolvedWorkspacePath,
      selectedProject?.path
    );

    const doctorSnapshot = await this._readDoctorEvidenceSnapshot(resolvedWorkspacePath);
    const workspaceArchitectureBlock = this._buildWorkspaceArchitectureBlock(
      doctorSnapshot,
      resolvedWorkspacePath
    );
    const projectExecutionBlock = await this._buildProjectExecutionBlock({
      workspacePath: resolvedWorkspacePath,
      projectPath: selectedProjectBelongsToWorkspace ? selectedProject?.path : undefined,
      projectName: selectedProjectBelongsToWorkspace ? selectedProject?.name : undefined,
      projectType: selectedProjectBelongsToWorkspace ? selectedProject?.type : undefined,
    });
    const responseRules = [
      'EVIDENCE INTEGRITY: Use only facts present in WORKSPACE ARCHITECTURE and PROJECT EXECUTION STATE blocks. Do not invent missing modules, unknown kit, or missing projects.',
      'If doctor evidence shows healthy projects with zero issues, do not recommend setup/reset commands unless the user explicitly asks for reconfiguration.',
      'Never claim `kit unknown` or `no modules installed` unless those exact conditions are explicitly listed in the evidence block.',
      ...(selectedProjectBelongsToWorkspace
        ? [
            'When a project is selected, answer as a launch/readiness assistant for that project first.',
            'Explain the current delivery stage in plain language before listing commands.',
            'If Java build wrappers or system build tools are missing, name that blocker explicitly and do not recommend `rapidkit dev` as the next successful step.',
            'If `rapidkit init` may be quiet, explain what it prepares and how the user can verify readiness for `rapidkit dev`.',
          ]
        : []),
      ...buildIncidentFirstResponseRules({
        projectScoped: selectedProjectBelongsToWorkspace,
        hasDoctorEvidence: Boolean(doctorSnapshot),
        framework: selectedProjectBelongsToWorkspace ? selectedProject?.type : undefined,
      }),
    ];

    return [
      message,
      '',
      ...(projectExecutionBlock ? [projectExecutionBlock, ''] : []),
      workspaceArchitectureBlock,
      '',
      ...responseRules,
      ...(responseRules.length ? [''] : []),
      'Respond using this exact structure and headings:',
      'What happened: <short diagnosis>',
      'Why: <root cause in 1-3 bullets>',
      'Next command: <single best next command or action>',
      'Verify command: <single command/check to confirm success>',
      '',
      'Keep it concise, specific to this workspace, and executable.',
    ].join('\n');
  }

  private _buildWorkspaceArchitectureBlock(
    snapshot: Awaited<ReturnType<typeof this._readDoctorEvidenceSnapshot>>,
    workspacePath?: string
  ): string {
    const lines: string[] = ['WORKSPACE ARCHITECTURE (from doctor evidence):'];

    if (!snapshot) {
      lines.push(
        '- No doctor evidence available yet. Do not assume workspace doctor is the immediate next step unless the user asked for a workspace-wide audit.'
      );
      lines.push(`- Workspace path: ${workspacePath ?? 'unknown'}`);
      lines.push(
        '- Use the selected project path, framework files, dependency state, and launch blockers to guide the next action.'
      );
      lines.push(
        '- Doctor evidence, when present, is stored at .rapidkit/reports/doctor-last-run.json.'
      );
      return lines.join('\n');
    }

    const workspaceName =
      snapshot.workspaceName ?? (workspacePath ? path.basename(workspacePath) : 'unknown');
    lines.push(`- Workspace name: ${workspaceName}`);
    lines.push(`- Workspace path: ${workspacePath ?? 'unknown'}`);
    lines.push(
      `- Health: ${snapshot.health.percent}% (${snapshot.health.passed} passed, ${snapshot.health.warnings} warnings, ${snapshot.health.errors} errors)`
    );
    lines.push(`- Total projects: ${snapshot.projectCount}`);

    if (snapshot.projects.length === 0) {
      lines.push('- Projects: none found');
    } else {
      lines.push('- Projects in this workspace:');
      for (const project of snapshot.projects) {
        const issueText = project.issues > 0 ? ` [${project.issues} issue(s)]` : ' [healthy]';
        const depsText = project.depsInstalled === false ? ' [deps missing]' : '';
        const framework = project.framework ?? 'unknown framework';
        const kitText = project.kit ? ` | kit: ${project.kit}` : '';
        const modulesText =
          typeof project.modulesCount === 'number' && Number.isFinite(project.modulesCount)
            ? ` | modules: ${project.modulesCount}`
            : '';
        const modulesHealthText =
          typeof project.modulesHealthy === 'boolean'
            ? ` | modulesHealthy: ${project.modulesHealthy ? 'yes' : 'no'}`
            : '';
        const vulnText =
          typeof project.vulnerabilities === 'number' && project.vulnerabilities > 0
            ? ` | vulnerabilities: ${project.vulnerabilities}`
            : '';
        lines.push(
          `    • ${project.name} (${framework}) — path: ${project.path || `${workspacePath}/${project.name}`}${issueText}${depsText}${kitText}${modulesText}${modulesHealthText}${vulnText}`
        );
      }
    }

    if (snapshot.fixCommands.length > 0) {
      lines.push(`- Suggested fix commands: ${snapshot.fixCommands.slice(0, 3).join(' | ')}`);
    }

    lines.push('');
    if (
      snapshot.health.errors === 0 &&
      snapshot.health.warnings === 0 &&
      snapshot.projects.length > 0 &&
      snapshot.projects.every((project) => project.issues === 0)
    ) {
      lines.push(
        'EVIDENCE NOTE: Workspace baseline is healthy. Prefer targeted verification commands over setup/reset flows.'
      );
    }
    if (
      snapshot.projects.length > 0 &&
      snapshot.projects.every((project) =>
        typeof project.modulesHealthy === 'boolean' ? project.modulesHealthy : true
      )
    ) {
      lines.push(
        'EVIDENCE NOTE: Doctor reports modulesHealthy=true for listed projects. Do NOT claim missing modules unless user provides contradictory evidence.'
      );
    }
    lines.push(
      'IMPORTANT: The workspace already has the projects listed above. Do NOT suggest creating a new project unless the user explicitly asks for one. Use the existing project paths for all commands.'
    );

    return lines.join('\n');
  }

  private async _readDoctorEvidenceSummary(workspacePath?: string): Promise<
    | {
        healthScoreText: string;
        generatedAt?: string;
        passed?: number;
        warnings?: number;
        errors?: number;
      }
    | undefined
  > {
    const snapshot = await this._readDoctorEvidenceSnapshot(workspacePath);
    if (!snapshot) {
      return undefined;
    }

    return {
      healthScoreText: `${snapshot.health.percent}% (${snapshot.health.passed} passed, ${snapshot.health.warnings} warnings, ${snapshot.health.errors} errors)`,
      generatedAt: snapshot.generatedAt,
      passed: snapshot.health.passed,
      warnings: snapshot.health.warnings,
      errors: snapshot.health.errors,
    };
  }

  private _derivePredictionConfidenceBand(confidence: number): 'low' | 'medium' | 'high' {
    if (confidence >= 75) {
      return 'high';
    }
    if (confidence >= 50) {
      return 'medium';
    }
    return 'low';
  }

  private _normalizeIncidentRollbackApprovalMode(
    value: unknown
  ): 'never' | 'high-risk-only' | 'mutating-only' | 'always' {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (
      normalized === 'never' ||
      normalized === 'high-risk-only' ||
      normalized === 'mutating-only' ||
      normalized === 'always'
    ) {
      return normalized;
    }

    return 'high-risk-only';
  }

  private _normalizeIncidentRollbackProtectedPaths(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const unique: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string') {
        continue;
      }

      const normalized = entry.trim().replace(/\\/g, '/').replace(/^\.\//, '');
      if (!normalized || unique.includes(normalized)) {
        continue;
      }
      unique.push(normalized);
      if (unique.length >= 32) {
        break;
      }
    }

    return unique;
  }

  private _resolveIncidentRollbackRuntimePolicy(input: {
    workspacePath?: string;
    actionPolicy: ReturnType<typeof classifyIncidentActionPolicy>;
    rollbackApprovalToken?: unknown;
  }): {
    approvalMode: 'never' | 'high-risk-only' | 'mutating-only' | 'always';
    requiresManualApproval: boolean;
    approvedByUser: boolean;
    protectedPathPrefixes: string[];
  } {
    const workspaceUri = input.workspacePath ? vscode.Uri.file(input.workspacePath) : undefined;
    const config = vscode.workspace.getConfiguration('workspai', workspaceUri);
    const uiPrefs = this._getUiPreferences();

    const approvalMode = this._normalizeIncidentRollbackApprovalMode(
      config.get('incidentStudio.rollbackApprovalMode') ?? uiPrefs.incidentRollbackApprovalMode
    );

    const configProtectedPaths = this._normalizeIncidentRollbackProtectedPaths(
      config.get('incidentStudio.rollbackProtectedPaths')
    );
    const protectedPathPrefixes =
      configProtectedPaths.length > 0
        ? configProtectedPaths
        : this._normalizeIncidentRollbackProtectedPaths(uiPrefs.incidentRollbackProtectedPaths);

    const requiresManualApproval =
      approvalMode === 'always' ||
      (approvalMode === 'high-risk-only' &&
        input.actionPolicy.riskClass === 'high-risk-mutating') ||
      (approvalMode === 'mutating-only' &&
        (input.actionPolicy.riskClass === 'guarded-mutating' ||
          input.actionPolicy.riskClass === 'high-risk-mutating'));

    const approvedByUser =
      input.rollbackApprovalToken === true ||
      (typeof input.rollbackApprovalToken === 'string' &&
        input.rollbackApprovalToken.trim().toLowerCase() === 'approved');

    return {
      approvalMode,
      requiresManualApproval,
      approvedByUser,
      protectedPathPrefixes,
    };
  }

  private _isIncidentRollbackProtectedPath(
    candidatePath: string,
    protectedPathPrefixes: string[]
  ): boolean {
    const normalizedCandidate = candidatePath
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .toLowerCase();

    for (const rawPrefix of protectedPathPrefixes) {
      const normalizedPrefix = rawPrefix.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();

      if (!normalizedPrefix) {
        continue;
      }

      const basePrefix = normalizedPrefix.endsWith('/')
        ? normalizedPrefix.slice(0, -1)
        : normalizedPrefix;

      if (normalizedCandidate === basePrefix || normalizedCandidate.startsWith(`${basePrefix}/`)) {
        return true;
      }
    }

    return false;
  }

  private _buildIncidentDiagnosisEvidence(input: {
    actionPolicy: ReturnType<typeof classifyIncidentActionPolicy>;
    verifyReady: boolean;
    verifySuccess: boolean;
    doctorEvidence?: {
      healthScoreText: string;
      generatedAt?: string;
      passed?: number;
      warnings?: number;
      errors?: number;
    };
    impactAssessment: {
      affectedFiles: string[];
      affectedModules: string[];
      likelyFailureMode?: string;
      verifyChecklist: string[];
    };
    predictiveWarning?: {
      warningId: string;
    };
    graphSnapshot: {
      nodes: Array<{ filePath?: string }>;
    };
  }): {
    confidence: number;
    confidenceBand: 'low' | 'medium' | 'high';
    signalSources: string[];
    relatedFiles: string[];
    recommendedFocus?: string;
  } {
    const signalSources: string[] = [];
    let confidenceScore = 25;

    if (input.doctorEvidence) {
      signalSources.push('doctor-evidence');
      confidenceScore += 25;
    }

    if (input.graphSnapshot.nodes.length > 0) {
      signalSources.push('system-graph');
      confidenceScore += 20;
    }

    if (
      input.impactAssessment.affectedFiles.length > 0 ||
      input.impactAssessment.affectedModules.length > 0
    ) {
      signalSources.push('impact-analysis');
      confidenceScore += 15;
    }

    if (input.predictiveWarning) {
      signalSources.push('predictive-warning');
      confidenceScore += 10;
    }

    if (input.verifyReady) {
      signalSources.push('verify-evidence-ready');
      confidenceScore += 8;
    }

    if (!input.verifySuccess) {
      signalSources.push('verify-failed');
      confidenceScore -= 12;
    }

    if (input.actionPolicy.requiresImpactReview) {
      confidenceScore += 5;
    }

    const confidence = Math.max(0, Math.min(100, confidenceScore));
    const confidenceBand = this._derivePredictionConfidenceBand(confidence);
    const relatedFiles = Array.from(
      new Set([
        ...input.impactAssessment.affectedFiles,
        ...input.graphSnapshot.nodes
          .map((node) => node.filePath)
          .filter((filePath): filePath is string => Boolean(filePath)),
      ])
    ).slice(0, 8);

    const recommendedFocus =
      input.impactAssessment.likelyFailureMode || input.impactAssessment.verifyChecklist[0];

    return {
      confidence,
      confidenceBand,
      signalSources,
      relatedFiles,
      recommendedFocus,
    };
  }

  private _buildIncidentReproPackEvidence(input: {
    actionType: string;
    actionId: string;
    conversationId: string;
    workspacePath?: string;
    verifySuccess: boolean;
    conversationHistoryTurns: number;
    doctorEvidence?: {
      healthScoreText: string;
      generatedAt?: string;
      passed?: number;
      warnings?: number;
      errors?: number;
    };
    rollbackEvidence?: {
      attempted: boolean;
    };
    sandboxEvidence?: {
      status: 'passed' | 'failed' | 'skipped';
    };
    impactAssessment: {
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      likelyFailureMode?: string;
      verifyChecklist: string[];
      affectedFiles: string[];
    };
    releaseGateEvidence: {
      blockedReasons: string[];
    };
    diagnosisEvidence: {
      relatedFiles: string[];
    };
  }):
    | {
        packId: string;
        status: 'captured' | 'failed' | 'skipped';
        capturedAt: string;
        schemaVersion: 'v1';
        workspacePath: string;
        conversationId: string;
        actionId: string;
        redaction: {
          policy: string;
          applied: boolean;
          redactedFields: string[];
        };
        summary: {
          historyTurns: number;
          hasDoctorEvidence: boolean;
          hasRollbackEvidence: boolean;
          hasSandboxEvidence: boolean;
          hasPredictiveWarning: boolean;
          verifySuccess: boolean;
          affectedFilesCount: number;
          blockedReasonCount: number;
        };
        replayPayload: {
          workspacePath: string;
          conversationId: string;
          actionType: string;
          riskLevel: 'low' | 'medium' | 'high' | 'critical';
          likelyFailureMode?: string;
          verifyChecklist: string[];
          blockedReasons: string[];
          relatedFiles: string[];
        };
        exportHint?: string;
      }
    | undefined {
    if (input.actionType !== 'incident-repro-pack' || !input.workspacePath) {
      return undefined;
    }

    const capturedAt = new Date().toISOString();
    const packId = `incident-repro-${input.actionId}-${Date.now().toString(36)}`;

    return {
      packId,
      status: 'captured',
      capturedAt,
      schemaVersion: 'v1',
      workspacePath: input.workspacePath,
      conversationId: input.conversationId,
      actionId: input.actionId,
      redaction: {
        policy: 'incident-studio-default',
        applied: true,
        redactedFields: ['authorization', 'token', 'password', 'secret', 'apiKey'],
      },
      summary: {
        historyTurns: input.conversationHistoryTurns,
        hasDoctorEvidence: Boolean(input.doctorEvidence),
        hasRollbackEvidence: Boolean(input.rollbackEvidence?.attempted),
        hasSandboxEvidence: Boolean(input.sandboxEvidence),
        hasPredictiveWarning: Boolean(input.impactAssessment.likelyFailureMode),
        verifySuccess: input.verifySuccess,
        affectedFilesCount: input.impactAssessment.affectedFiles.length,
        blockedReasonCount: input.releaseGateEvidence.blockedReasons.length,
      },
      replayPayload: {
        workspacePath: input.workspacePath,
        conversationId: input.conversationId,
        actionType: input.actionType,
        riskLevel: input.impactAssessment.riskLevel,
        likelyFailureMode: input.impactAssessment.likelyFailureMode,
        verifyChecklist: input.impactAssessment.verifyChecklist.slice(0, 8),
        blockedReasons: input.releaseGateEvidence.blockedReasons.slice(0, 8),
        relatedFiles: input.diagnosisEvidence.relatedFiles.slice(0, 10),
      },
      exportHint:
        'Use share/export flow for secure handoff: keep redaction enabled and include replay checklist + blocked reasons.',
    };
  }

  private async _resolveIncidentReplayWorkspacePath(
    preferredWorkspacePath?: string
  ): Promise<{ workspacePath: string; workspaceName: string } | null> {
    const candidatePaths: string[] = [];

    if (preferredWorkspacePath && preferredWorkspacePath.trim()) {
      candidatePaths.push(preferredWorkspacePath.trim());
    }

    const selectedWorkspace = this._getSelectedWorkspaceInfo();
    if (selectedWorkspace?.path) {
      candidatePaths.push(selectedWorkspace.path);
    }

    if (vscode.workspace.workspaceFolders?.length) {
      candidatePaths.push(vscode.workspace.workspaceFolders[0].uri.fsPath);
    }

    for (const candidate of candidatePaths) {
      if (!candidate) {
        continue;
      }
      if (await fs.pathExists(candidate)) {
        return {
          workspacePath: candidate,
          workspaceName:
            selectedWorkspace?.path === candidate
              ? selectedWorkspace.name
              : path.basename(candidate),
        };
      }
    }

    return null;
  }

  private async _handleExportIncidentReproPack(data: any, requestId?: string): Promise<void> {
    const reproPack =
      data &&
      typeof data === 'object' &&
      data.incidentReproPack &&
      typeof data.incidentReproPack === 'object'
        ? (data.incidentReproPack as {
            packId?: string;
            status?: string;
            capturedAt?: string;
            schemaVersion?: string;
            workspacePath?: string;
            conversationId?: string;
            actionId?: string;
            redaction?: {
              policy?: string;
              applied?: boolean;
              redactedFields?: string[];
            };
            summary?: {
              historyTurns?: number;
              hasDoctorEvidence?: boolean;
              hasRollbackEvidence?: boolean;
              hasSandboxEvidence?: boolean;
              hasPredictiveWarning?: boolean;
              verifySuccess?: boolean;
              affectedFilesCount?: number;
              blockedReasonCount?: number;
            };
            replayPayload?: {
              workspacePath?: string;
              conversationId?: string;
              actionType?: string;
              riskLevel?: 'low' | 'medium' | 'high' | 'critical';
              likelyFailureMode?: string;
              verifyChecklist?: string[];
              blockedReasons?: string[];
              relatedFiles?: string[];
            };
            exportHint?: string;
          })
        : undefined;

    if (!reproPack?.packId || !reproPack.replayPayload) {
      vscode.window.showWarningMessage('No incident repro pack is available to export.');
      return;
    }

    const workspacePathInput =
      typeof data?.workspacePath === 'string' && data.workspacePath.trim()
        ? data.workspacePath.trim()
        : typeof reproPack.workspacePath === 'string' && reproPack.workspacePath.trim()
          ? reproPack.workspacePath.trim()
          : undefined;

    const workspaceResolution = await this._resolveIncidentReplayWorkspacePath(workspacePathInput);
    const defaultFileName = `${reproPack.packId}-redacted-bundle.json`;
    const defaultUri = workspaceResolution
      ? vscode.Uri.file(
          path.join(workspaceResolution.workspacePath, '.rapidkit', 'reports', defaultFileName)
        )
      : undefined;

    const outputUri = await vscode.window.showSaveDialog({
      title: 'Export Incident Repro Pack (Redacted)',
      saveLabel: 'Export Redacted Bundle',
      defaultUri,
      filters: {
        JSON: ['json'],
      },
    });

    if (!outputUri) {
      return;
    }

    const redactedBundle = buildLinkSafeExportBundle(
      {
        ...reproPack,
        packId: reproPack.packId,
        replayPayload: {
          ...reproPack.replayPayload,
          riskLevel:
            reproPack.replayPayload.riskLevel === 'low' ||
            reproPack.replayPayload.riskLevel === 'medium' ||
            reproPack.replayPayload.riskLevel === 'high' ||
            reproPack.replayPayload.riskLevel === 'critical'
              ? reproPack.replayPayload.riskLevel
              : 'high',
        },
        redaction: reproPack.redaction ?? {},
        summary: reproPack.summary ?? {},
      },
      workspaceResolution?.workspaceName || path.basename(workspacePathInput || '') || 'workspace'
    );

    await vscode.workspace.fs.writeFile(
      outputUri,
      Buffer.from(JSON.stringify(redactedBundle, null, 2), 'utf8')
    );

    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.studio.incident_repro_pack_exported',
      workspaceResolution?.workspacePath || workspacePathInput,
      {
        packId: redactedBundle.incident_repro_pack.packId,
        redactionApplied: true,
        verifyChecklistCount:
          redactedBundle.incident_repro_pack.replayPayload.verifyChecklist.length,
        blockedReasonCount: redactedBundle.incident_repro_pack.replayPayload.blockedReasons.length,
      }
    );

    vscode.window.showInformationMessage(`Incident repro bundle exported: ${outputUri.fsPath}`);

    this._panel.webview.postMessage({
      command: 'aiChatActionProgress',
      data: {
        stage: 'repro-exported',
        progress: 100,
        note: `Redacted bundle exported: ${path.basename(outputUri.fsPath)}`,
      },
      meta: { requestId, version: 'v1' },
    });
  }

  private async _handleImportIncidentReproPack(requestId?: string): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: {
        JSON: ['json'],
        'All Files': ['*'],
      },
      openLabel: 'Import Incident Repro Bundle',
      title: 'Select incident repro bundle (JSON)',
    });

    const fileUri = picked?.[0];
    if (!fileUri) {
      return;
    }

    try {
      const rawBuffer = await vscode.workspace.fs.readFile(fileUri);
      const rawText = Buffer.from(rawBuffer).toString('utf8');
      const parsed = JSON.parse(rawText) as Record<string, unknown>;

      const normalizedReproPack = parseImportedReproBundle(parsed);
      const rawReplayWorkspacePath =
        typeof normalizedReproPack.replayPayload.workspacePath === 'string'
          ? normalizedReproPack.replayPayload.workspacePath.trim()
          : '';
      const workspaceResolution =
        await this._resolveIncidentReplayWorkspacePath(rawReplayWorkspacePath);

      if (!workspaceResolution) {
        throw new Error(
          'No local workspace is available for replay. Select or open a workspace first.'
        );
      }

      const initialQuery = buildIncidentReplayQuery(normalizedReproPack);
      this._pendingImportedIncidentReplayByWorkspace.set(workspaceResolution.workspacePath, {
        packId: normalizedReproPack.packId,
        actionType: normalizedReproPack.replayPayload.actionType,
        riskLevel: normalizedReproPack.replayPayload.riskLevel,
        likelyFailureMode: normalizedReproPack.replayPayload.likelyFailureMode,
        verifyChecklist: normalizedReproPack.replayPayload.verifyChecklist,
        blockedReasons: normalizedReproPack.replayPayload.blockedReasons,
        relatedFiles: normalizedReproPack.replayPayload.relatedFiles,
        importedFrom: path.basename(fileUri.fsPath),
      });

      this._panel.webview.postMessage({
        command: 'openIncidentStudio',
        data: {
          workspacePath: workspaceResolution.workspacePath,
          workspaceName: workspaceResolution.workspaceName,
          initialQuery,
        },
        meta: { requestId, version: 'v1' },
      });

      await WorkspaceUsageTracker.getInstance().trackCommandEvent(
        'workspai.studio.incident_repro_pack_imported',
        workspaceResolution.workspacePath,
        {
          packId: normalizedReproPack.packId,
          sourceFile: path.basename(fileUri.fsPath),
          verifyChecklistCount: normalizedReproPack.replayPayload.verifyChecklist.length,
          blockedReasonCount: normalizedReproPack.replayPayload.blockedReasons.length,
        }
      );

      this._trackStudioEvent(
        'workspai.studio.incident_replay_ready',
        workspaceResolution.workspacePath,
        {
          packId: normalizedReproPack.packId,
          actionType: normalizedReproPack.replayPayload.actionType,
          verifyChecklistCount: normalizedReproPack.replayPayload.verifyChecklist.length,
          blockedReasonCount: normalizedReproPack.replayPayload.blockedReasons.length,
        }
      );

      vscode.window.showInformationMessage(
        `Incident repro bundle imported and queued for replay: ${path.basename(fileUri.fsPath)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to import incident repro bundle: ${message}`);
    }
  }

  private async _buildIncidentWave2Contracts(input: {
    requestId?: string;
    conversationId?: string;
    actionId: string;
    actionType: string;
    actionQuery?: string;
    workspacePath?: string;
    actionPolicy: ReturnType<typeof classifyIncidentActionPolicy>;
    graphSnapshot: IncidentWorkspaceGraphSnapshot;
    doctorEvidence?: {
      healthScoreText: string;
      generatedAt?: string;
      passed?: number;
      warnings?: number;
      errors?: number;
    };
    verifyReady: boolean;
    verifySuccess: boolean;
    rollbackRuntimePolicy?: {
      approvalMode: 'never' | 'high-risk-only' | 'mutating-only' | 'always';
      requiresManualApproval: boolean;
      approvedByUser: boolean;
      protectedPathPrefixes: string[];
    };
  }): Promise<{
    systemGraphSnapshot: {
      requestId?: string;
      workspacePath: string;
      projectPath?: string;
      graphVersion: string;
      nodes: Array<{
        id: string;
        type:
          | 'route'
          | 'controller'
          | 'service'
          | 'model'
          | 'datastore'
          | 'test'
          | 'infra-service'
          | 'db-schema';
        label: string;
        filePath?: string;
        confidence: number;
      }>;
      edges: Array<{
        sourceId: string;
        targetId: string;
        relation: string;
      }>;
      summary: {
        nodeCount: number;
        edgeCount: number;
        supportedTopology: string;
      };
    };
    impactAssessment: {
      requestId?: string;
      source: string[];
      confidence: number;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      affectedFiles: string[];
      affectedModules: string[];
      affectedTests: string[];
      likelyFailureMode?: string;
      rationale: string[];
      verifyChecklist: string[];
      blockMutationWhenScopeUnknown: boolean;
    };
    predictiveWarning?: {
      requestId?: string;
      warningId: string;
      confidenceBand: 'low' | 'medium' | 'high';
      predictedFailure?: string;
      affectedScopeSummary?: string;
      nextSafeAction?: string;
      verifyChecklist: string[];
      telemetrySeed: {
        predictionKey: string;
        evidenceSources: string[];
      };
    };
    releaseGateEvidence: {
      requestId?: string;
      scopeKnown: boolean;
      verifyPathPresent: boolean;
      rollbackPathPresent: boolean;
      confidenceSufficient: boolean;
      blockedReasons: string[];
    };
    architectureTelemetry: {
      warningCount: number;
      warnings: string[];
      unknownScopeBlocked: boolean;
    };
  }> {
    const workspacePath =
      input.workspacePath ||
      input.graphSnapshot.workspace.path ||
      this._resolveTelemetryWorkspacePath() ||
      '';
    const selectedProjectPath = input.graphSnapshot.project.selectedProject?.path;
    const indexedGraph = await indexProjectSystemGraph({
      workspacePath,
      projectPath: selectedProjectPath || undefined,
      framework: input.graphSnapshot.project.framework,
      kit: input.graphSnapshot.project.kit,
    });
    const predictionKpiStatus = workspacePath
      ? await WorkspaceUsageTracker.getInstance().getStudioPredictionKpiStatus(workspacePath)
      : null;

    const moduleSeeds =
      indexedGraph.topModules.length > 0
        ? indexedGraph.topModules.slice(0, 4)
        : input.graphSnapshot.topology.topModules.slice(0, 4);
    const actionSeedTokens = input.actionType
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length >= 3)
      .slice(0, 3);
    const impactQuery = queryProjectSystemGraphImpact(indexedGraph, {
      seedFilePaths: selectedProjectPath ? [selectedProjectPath] : [],
      seedModules: Array.from(new Set([...moduleSeeds, ...actionSeedTokens])),
      maxDepth: 2,
      maxNodes: 36,
    });
    const deterministicScore = scoreSystemGraphImpactDeterministic({
      impactQuery,
      graphSnapshot: indexedGraph,
      doctorErrors: input.doctorEvidence?.errors ?? 0,
      doctorWarnings: input.doctorEvidence?.warnings ?? 0,
      requiresImpactReview: input.actionPolicy.requiresImpactReview,
      requiresVerifyPath: input.actionPolicy.requiresVerifyPath,
      riskClass: input.actionPolicy.riskClass,
    });

    const nodes: Array<{
      id: string;
      type:
        | 'route'
        | 'controller'
        | 'service'
        | 'model'
        | 'datastore'
        | 'test'
        | 'infra-service'
        | 'db-schema';
      label: string;
      filePath?: string;
      confidence: number;
      symbolName?: string;
      startLine?: number;
    }> =
      indexedGraph.nodes.length > 0
        ? indexedGraph.nodes.map((node) => ({
            id: node.id,
            type: node.type,
            label: node.label,
            filePath: node.filePath,
            confidence: node.confidence,
            symbolName: node.symbolName,
            startLine: node.startLine,
          }))
        : moduleSeeds.map((moduleName) => ({
            id: `service:${moduleName}`,
            type: 'service',
            label: `${moduleName} service`,
            filePath: `src/${moduleName}`,
            confidence: 70,
          }));

    const edges: Array<{
      sourceId: string;
      targetId: string;
      relation: string;
    }> =
      indexedGraph.edges.length > 0
        ? indexedGraph.edges.map((edge) => ({
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            relation: edge.relation,
          }))
        : [];

    if (
      selectedProjectPath &&
      nodes.length > 0 &&
      !nodes.some((node) => node.type === 'route' || node.type === 'controller')
    ) {
      nodes.unshift({
        id: 'route:entry',
        type: 'route',
        label: 'project entry route',
        filePath: selectedProjectPath,
        confidence: 65,
      });
      edges.push({
        sourceId: 'route:entry',
        targetId: nodes[1].id,
        relation: 'calls',
      });
    }

    if (edges.length === 0) {
      for (let index = 0; index < moduleSeeds.length - 1; index += 1) {
        edges.push({
          sourceId: `service:${moduleSeeds[index]}`,
          targetId: `service:${moduleSeeds[index + 1]}`,
          relation: 'depends-on',
        });
      }
    }

    const sources = ['graph'];
    if (input.graphSnapshot.evidence.hasDoctorEvidence) {
      sources.push('doctor');
    }
    if (input.graphSnapshot.evidence.hasGitDiff) {
      sources.push('runtime');
    }
    if (selectedProjectPath) {
      sources.push('selection');
    }

    const confidence = Math.max(0, Math.min(100, deterministicScore.confidence));

    const affectedModules =
      impactQuery.impactedModules.length > 0
        ? impactQuery.impactedModules.slice(0, 3)
        : moduleSeeds.slice(0, 3);
    const affectedFilesFromGraph =
      impactQuery.impactedNodes.length > 0
        ? impactQuery.impactedNodes
            .map((node) => node.filePath)
            .filter(
              (filePath): filePath is string => typeof filePath === 'string' && filePath.length > 0
            )
            .slice(0, 8)
        : nodes
            .map((node) => node.filePath)
            .filter(
              (filePath): filePath is string => typeof filePath === 'string' && filePath.length > 0
            )
            .slice(0, 8);
    const affectedFiles = Array.from(
      new Set([
        ...(selectedProjectPath ? [selectedProjectPath] : []),
        ...affectedFilesFromGraph,
        ...affectedModules.map((moduleName) => `src/${moduleName}`),
      ])
    );
    const affectedTests = Array.from(
      new Set([
        ...impactQuery.candidateTests.slice(0, 4),
        ...nodes
          .filter((node) => node.type === 'test' && typeof node.filePath === 'string')
          .map((node) => node.filePath as string)
          .slice(0, 4),
        ...affectedModules.map((moduleName) => `tests/${moduleName}.spec.ts`),
      ])
    );

    const likelyFailureMode =
      deterministicScore.likelyFailureMode ||
      ((input.doctorEvidence?.errors ?? 0) > 0
        ? `${input.doctorEvidence?.errors} doctor error(s) indicate unresolved runtime risk.`
        : input.actionPolicy.requiresImpactReview
          ? 'Mutation may break downstream modules if applied without impact review.'
          : undefined);

    const verifyChecklist: string[] = [];
    if (input.actionPolicy.requiresImpactReview) {
      verifyChecklist.push('Run change-impact-lite and review affected modules before apply.');
    }
    if (input.actionPolicy.requiresVerifyPath) {
      verifyChecklist.push('Run deterministic verify command and capture output evidence.');
    }
    if ((input.doctorEvidence?.errors ?? 0) > 0) {
      verifyChecklist.push(
        `Resolve ${input.doctorEvidence?.errors} doctor error(s) before completion claim.`
      );
    }
    if (verifyChecklist.length === 0) {
      verifyChecklist.push('No blocking verify checks detected for this action class.');
    }
    if (impactQuery.unknownScope && input.actionPolicy.requiresImpactReview) {
      verifyChecklist.push(
        'Scope is uncertain. Ask for clarification before mutation recommendation.'
      );
    }
    if (deterministicScore.architectureWarnings.length > 0) {
      verifyChecklist.push(
        `Architecture warning: ${deterministicScore.architectureWarnings[0]}. Run focused impact review before apply.`
      );
    }

    const scopeKnown =
      deterministicScore.scopeKnown &&
      (affectedFiles.length > 0 || affectedModules.length > 0 || affectedTests.length > 0);
    const verifyPathPresent = !input.actionPolicy.requiresVerifyPath || verifyChecklist.length > 0;
    const rollbackPathPresent =
      (input.actionPolicy.riskClass === 'informational' ||
        input.actionPolicy.riskClass === 'non-mutating-executable' ||
        input.verifyReady) &&
      (!input.rollbackRuntimePolicy?.requiresManualApproval ||
        input.rollbackRuntimePolicy.approvedByUser);
    const confidenceSufficient = confidence >= (input.actionPolicy.requiresImpactReview ? 60 : 50);

    const blockedReasons: string[] = [];
    if (input.actionPolicy.requiresImpactReview && !scopeKnown) {
      blockedReasons.push('Affected scope is unknown while impact review is required.');
    }
    if (input.actionPolicy.requiresVerifyPath && !input.verifyReady) {
      blockedReasons.push('Verification evidence is missing for a verify-first action.');
    }
    if (!rollbackPathPresent) {
      if (
        input.rollbackRuntimePolicy?.requiresManualApproval &&
        !input.rollbackRuntimePolicy.approvedByUser
      ) {
        blockedReasons.push(
          `Rollback policy (${input.rollbackRuntimePolicy.approvalMode}) requires manual approval before auto-restore can run.`
        );
      } else {
        blockedReasons.push('Rollback path is unavailable for this risk class.');
      }
    }
    if (!confidenceSufficient) {
      blockedReasons.push('Impact confidence is below release-safe threshold.');
    }
    if (!input.verifySuccess && (input.doctorEvidence?.errors ?? 0) > 0) {
      blockedReasons.push(`${input.doctorEvidence?.errors} doctor error(s) remain unresolved.`);
    }
    blockedReasons.push(...deterministicScore.blockedReasons);

    const architectureWarnings = Array.from(
      new Set(
        deterministicScore.architectureWarnings
          .filter((warning) => typeof warning === 'string' && warning.trim().length > 0)
          .map((warning) => warning.trim())
      )
    );
    const unknownScopeBlocked = blockedReasons.some((reason) => /scope is unknown/i.test(reason));

    const predictiveWarningNeeded =
      input.actionPolicy.requiresImpactReview || (input.doctorEvidence?.errors ?? 0) > 0;
    const warningId = `${input.conversationId || 'conv'}:${input.actionId}:prediction`;
    const predictionKey = `${input.actionType}:${warningId}`;
    const predictiveWarning = predictiveWarningNeeded
      ? buildIncidentPredictiveWarning({
          impactAssessment: {
            confidence,
            riskLevel: deterministicScore.riskLevel,
            affectedFiles,
            affectedModules,
            affectedTests,
            likelyFailureMode,
            rationale: [
              'Impact is derived from workspace graph topology and doctor/runtime evidence.',
              input.actionPolicy.requiresImpactReview
                ? 'Action policy requires impact review before completion claim.'
                : 'Action policy allows lower-risk execution path.',
              ...deterministicScore.architectureWarnings.slice(0, 2),
              ...deterministicScore.rationale.slice(0, 3),
            ],
            verifyChecklist,
          },
          actionPolicy: input.actionPolicy,
          doctorEvidence: input.doctorEvidence,
          graphSummary: {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            supportedTopology:
              indexedGraph.supportedTopology ||
              input.graphSnapshot.project.kit ||
              input.graphSnapshot.project.framework,
          },
          evidenceSources: sources,
          telemetryStatus: predictionKpiStatus,
          verifyReady: input.verifyReady,
          verifySuccess: input.verifySuccess,
          signalContext: {
            actionType: input.actionType,
            queryText: input.actionQuery,
          },
        })
      : null;

    return {
      systemGraphSnapshot: {
        requestId: input.requestId,
        workspacePath,
        projectPath: selectedProjectPath,
        graphVersion: input.graphSnapshot.snapshotVersion || 'v1',
        nodes,
        edges,
        summary: {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          supportedTopology:
            indexedGraph.supportedTopology ||
            input.graphSnapshot.project.kit ||
            input.graphSnapshot.project.framework,
        },
      },
      impactAssessment: {
        requestId: input.requestId,
        source: sources,
        confidence,
        riskLevel: deterministicScore.riskLevel,
        affectedFiles,
        affectedModules,
        affectedTests,
        likelyFailureMode,
        rationale: [
          'Impact is derived from workspace graph topology and doctor/runtime evidence.',
          input.actionPolicy.requiresImpactReview
            ? 'Action policy requires impact review before completion claim.'
            : 'Action policy allows lower-risk execution path.',
          ...deterministicScore.architectureWarnings.slice(0, 2),
          ...deterministicScore.rationale.slice(0, 3),
        ],
        verifyChecklist,
        blockMutationWhenScopeUnknown:
          input.actionPolicy.requiresImpactReview || input.actionPolicy.requiresVerifyPath,
      },
      predictiveWarning: predictiveWarning
        ? {
            requestId: input.requestId,
            warningId,
            confidenceBand: predictiveWarning.confidenceBand,
            predictedFailure: predictiveWarning.predictedFailure,
            affectedScopeSummary: predictiveWarning.affectedScopeSummary,
            nextSafeAction: predictiveWarning.nextSafeAction,
            verifyChecklist: predictiveWarning.verifyChecklist,
            telemetrySeed: {
              predictionKey,
              evidenceSources: predictiveWarning.evidenceSources,
            },
          }
        : undefined,
      releaseGateEvidence: {
        requestId: input.requestId,
        scopeKnown,
        verifyPathPresent,
        rollbackPathPresent,
        confidenceSufficient,
        blockedReasons: Array.from(new Set(blockedReasons)),
      },
      architectureTelemetry: {
        warningCount: architectureWarnings.length,
        warnings: architectureWarnings.slice(0, 4),
        unknownScopeBlocked,
      },
    };
  }

  private async _readDoctorEvidenceSnapshot(workspacePath?: string): Promise<
    | {
        workspaceName?: string;
        generatedAt?: string;
        health: {
          total: number;
          passed: number;
          warnings: number;
          errors: number;
          percent: number;
        };
        projectCount: number;
        projectsWithIssues: number;
        issueCount: number;
        frameworks: Array<{ name: string; count: number }>;
        projects: Array<{
          name: string;
          path?: string;
          framework?: string;
          kit?: string;
          issues: number;
          modulesCount?: number;
          modulesHealthy?: boolean;
          vulnerabilities?: number;
          depsInstalled?: boolean;
        }>;
        fixCommands: string[];
      }
    | undefined
  > {
    if (!workspacePath) {
      return undefined;
    }

    const evidencePath = path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json');
    try {
      if (!(await fs.pathExists(evidencePath))) {
        return undefined;
      }

      const raw = await fs.readJSON(evidencePath);

      const total = Number(raw?.healthScore?.total ?? 0);
      const passed = Number(raw?.healthScore?.passed ?? 0);
      const warnings = Number(raw?.healthScore?.warnings ?? 0);
      const errors = Number(raw?.healthScore?.errors ?? 0);
      const percent = total > 0 ? Math.round((passed / total) * 100) : 0;

      type ParsedDoctorProject = {
        name: string;
        path?: string;
        framework?: string;
        kit?: string;
        issues: number;
        modulesCount?: number;
        modulesHealthy?: boolean;
        vulnerabilities?: number;
        depsInstalled?: boolean;
        fixCommands: string[];
      };

      const projectsRaw = Array.isArray(raw?.projects) ? raw.projects : [];
      const projects: ParsedDoctorProject[] = projectsRaw
        .map((project: any) => {
          const issues = Array.isArray(project?.issues) ? project.issues.length : 0;
          const modulesCountRaw = Number(project?.stats?.modules);
          const modulesCount = Number.isFinite(modulesCountRaw) ? modulesCountRaw : undefined;
          const vulnerabilitiesRaw = Number(project?.vulnerabilities);
          const vulnerabilities = Number.isFinite(vulnerabilitiesRaw)
            ? vulnerabilitiesRaw
            : undefined;
          return {
            name: typeof project?.name === 'string' ? project.name : 'unknown',
            path: typeof project?.path === 'string' ? project.path : undefined,
            framework: typeof project?.framework === 'string' ? project.framework : undefined,
            kit: typeof project?.kit === 'string' ? project.kit : undefined,
            issues,
            modulesCount,
            modulesHealthy:
              typeof project?.modulesHealthy === 'boolean' ? project.modulesHealthy : undefined,
            vulnerabilities,
            depsInstalled:
              typeof project?.depsInstalled === 'boolean' ? project.depsInstalled : undefined,
            fixCommands: Array.isArray(project?.fixCommands)
              ? project.fixCommands.filter((cmd: unknown) => typeof cmd === 'string')
              : [],
          };
        })
        .filter((project: ParsedDoctorProject) => project.name.length > 0);

      const frameworkMap = new Map<string, number>();
      for (const project of projects) {
        const key = project.framework?.trim() || 'unknown';
        frameworkMap.set(key, (frameworkMap.get(key) ?? 0) + 1);
      }

      const frameworks = [...frameworkMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

      const fixCommands = projects
        .flatMap((project: ParsedDoctorProject) => project.fixCommands)
        .slice(0, 8);

      const issueCount = projects.reduce(
        (acc: number, project: ParsedDoctorProject) => acc + project.issues,
        0
      );
      const projectsWithIssues = projects.filter(
        (project: ParsedDoctorProject) => project.issues > 0
      ).length;

      return {
        workspaceName: typeof raw?.workspaceName === 'string' ? raw.workspaceName : undefined,
        generatedAt: typeof raw?.generatedAt === 'string' ? raw.generatedAt : undefined,
        health: {
          total,
          passed,
          warnings,
          errors,
          percent,
        },
        projectCount: projects.length,
        projectsWithIssues,
        issueCount,
        frameworks,
        projects: projects.map(
          ({
            name,
            path,
            framework,
            kit,
            issues,
            modulesCount,
            modulesHealthy,
            vulnerabilities,
            depsInstalled,
          }: ParsedDoctorProject) => ({
            name,
            path,
            framework,
            kit,
            issues,
            modulesCount,
            modulesHealthy,
            vulnerabilities,
            depsInstalled,
          })
        ),
        fixCommands,
      };
    } catch {
      return undefined;
    }
  }

  private async _buildIncidentMemoryReuseSnapshot(workspacePath?: string) {
    if (!workspacePath) {
      return null;
    }

    try {
      const memoryService = WorkspaceMemoryService.getInstance();
      const [memory, doctorSummary] = await Promise.all([
        memoryService.readNearest(workspacePath),
        this._readDoctorEvidenceSnapshot(workspacePath),
      ]);

      return buildIncidentMemoryReuseSnapshot({
        workspaceMemoryContext: memory.context,
        conventions: memory.conventions,
        decisions: memory.decisions,
        doctorFixCommands: doctorSummary?.fixCommands,
      });
    } catch {
      return null;
    }
  }

  private async _persistIncidentReplayLearning(input: {
    workspacePath: string;
    packId: string;
    actionType: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    likelyFailureMode?: string;
    verifyChecklist: string[];
    blockedReasons: string[];
    relatedFiles: string[];
  }): Promise<boolean> {
    try {
      const memoryService = WorkspaceMemoryService.getInstance();
      const currentMemory = await memoryService.read(input.workspacePath);
      const nextMemory = mergeIncidentReplayLearningIntoMemory(currentMemory, {
        packId: input.packId,
        actionType: input.actionType,
        riskLevel: input.riskLevel,
        likelyFailureMode: input.likelyFailureMode,
        verifyChecklist: input.verifyChecklist,
        blockedReasons: input.blockedReasons,
        relatedFiles: input.relatedFiles,
      });

      if (JSON.stringify(nextMemory) === JSON.stringify(currentMemory)) {
        return false;
      }

      await memoryService.write(input.workspacePath, nextMemory);
      return true;
    } catch {
      return false;
    }
  }

  private _trackChatBrainRequestStart(requestId?: string): boolean {
    if (!requestId) {
      return true;
    }
    if (
      this._chatBrainInFlightRequestIds.has(requestId) ||
      this._chatBrainCompletedRequestIds.includes(requestId)
    ) {
      return false;
    }

    this._chatBrainInFlightRequestIds.add(requestId);
    return true;
  }

  private _trackChatBrainRequestComplete(requestId?: string): void {
    if (!requestId) {
      return;
    }

    this._chatBrainInFlightRequestIds.delete(requestId);
    if (!this._chatBrainCompletedRequestIds.includes(requestId)) {
      this._chatBrainCompletedRequestIds.push(requestId);
      if (this._chatBrainCompletedRequestIds.length > 240) {
        this._chatBrainCompletedRequestIds.splice(
          0,
          this._chatBrainCompletedRequestIds.length - 240
        );
      }
    }
  }

  private _isRetryableChatBrainError(err: unknown): boolean {
    const raw = err instanceof Error ? err.message : String(err ?? '');
    if (!raw) {
      return true;
    }

    if (/cancel|aborted|scope_violation|invalid_input/i.test(raw)) {
      return false;
    }

    return /timeout|timed out|network|socket|econnreset|etimedout|enotfound|429|5\d\d/i.test(raw);
  }

  private _deriveChatBrainFailureCode(err: unknown): string {
    const raw = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
    if (raw.includes('scope_violation')) {
      return 'WORKSPACE_SCOPE_VIOLATION';
    }
    if (raw.includes('timeout') || raw.includes('timed out')) {
      return 'TIMEOUT';
    }
    if (raw.includes('network') || raw.includes('socket') || raw.includes('enotfound')) {
      return 'NETWORK_INTERRUPTION';
    }
    return 'PARTIAL_FAILURE';
  }

  private _buildChatBrainFallbackBoard(
    actionType: string,
    projectName?: string
  ): {
    id: string;
    type: string;
    title: string;
    summary: string;
    actions: Array<{
      id: string;
      label: string;
      actionType: string;
      riskLevel: 'low' | 'medium';
      requiresImpactReview?: boolean;
      requiresVerifyPath?: boolean;
    }>;
  } {
    const safeActionType = actionType === 'orchestrate' ? 'terminal-bridge' : actionType;
    const summary = projectName
      ? `${projectName}: connection was interrupted. Continue with deterministic checks and retry.`
      : 'Connection was interrupted. Continue with deterministic checks and retry.';

    return {
      id: `fallback-board-${Date.now()}`,
      type: 'fallback',
      title: 'Partial response received - continue safely',
      summary,
      actions: [
        {
          id: `fallback-retry-${Date.now()}`,
          label: 'Retry diagnosis route',
          actionType: safeActionType,
          riskLevel: 'low',
        },
        {
          id: `fallback-doctor-${Date.now()}`,
          label: 'Run doctor verification',
          actionType: 'doctor-fix',
          riskLevel: 'medium',
          requiresVerifyPath: true,
        },
        {
          id: `fallback-impact-${Date.now()}`,
          label: 'Run impact check before mutation',
          actionType: 'change-impact-lite',
          riskLevel: 'low',
          requiresImpactReview: true,
        },
      ],
    };
  }

  private async _handleAiChatQuery(data: any, requestId?: string) {
    const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : '';
    const message = typeof data?.message === 'string' ? data.message.trim() : '';
    const normalizedRequestId =
      typeof requestId === 'string' && requestId.trim() ? requestId.trim() : undefined;
    const requestedModelId =
      typeof data?.modelId === 'string' && data.modelId.trim() ? data.modelId.trim() : undefined;

    if (!conversationId || !message) {
      this._panel.webview.postMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'INVALID_INPUT',
          message: 'conversationId and message are required.',
          retryable: true,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    if (!this._trackChatBrainRequestStart(normalizedRequestId)) {
      this._panel.webview.postMessage({
        command: 'aiChatPartialFailure',
        data: {
          conversationId,
          code: 'DUPLICATE_REQUEST',
          message: 'Duplicate requestId detected. Ignoring replayed chat query.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });

      this._panel.webview.postMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'DUPLICATE_REQUEST',
          message: 'Duplicate requestId detected. Ignoring replayed chat query.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    const existingConversation = this._chatBrainConversations.get(conversationId);
    const current = existingConversation || {
      workspacePath: typeof data?.workspacePath === 'string' ? data.workspacePath : undefined,
      projectPath:
        typeof data?.projectPath === 'string' && data.projectPath.trim()
          ? data.projectPath.trim()
          : undefined,
      projectName:
        typeof data?.projectName === 'string' && data.projectName.trim()
          ? data.projectName.trim()
          : undefined,
      projectType:
        typeof data?.projectType === 'string' && data.projectType.trim()
          ? data.projectType.trim()
          : undefined,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      phase: 'detect' as const,
      history: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
      queryCount: 0,
      actionCount: 0,
      framework: undefined as string | undefined,
    };

    current.workspacePath =
      (typeof data?.workspacePath === 'string' && data.workspacePath.trim()) ||
      current.workspacePath;
    current.projectPath =
      (typeof data?.projectPath === 'string' && data.projectPath.trim()) || current.projectPath;
    current.projectName =
      (typeof data?.projectName === 'string' && data.projectName.trim()) || current.projectName;
    current.projectType =
      (typeof data?.projectType === 'string' && data.projectType.trim()) || current.projectType;

    if (!current.framework) {
      current.framework = current.projectPath
        ? await this._inferFrameworkFromWorkspace(current.projectPath)
        : current.workspacePath
          ? await this._inferFrameworkFromWorkspace(current.workspacePath)
          : undefined;
    }

    current.lastActivityAt = Date.now();
    current.phase = 'diagnose';
    current.queryCount += 1;
    current.history = [...current.history, { role: 'user' as const, content: message }].slice(-12);
    this._chatBrainConversations.set(conversationId, current);

    this._trackStudioEvent('workspai.studio.next_action_clicked', current.workspacePath, {
      framework: current.framework ?? 'unknown',
      conversationId,
      queryCount: current.queryCount,
      actionType: this._routeActionTypeFromMessage(message),
      timeToFirstActionMs: Date.now() - current.startedAt,
    });

    this._chatBrainQueryTokenSource?.cancel();
    this._chatBrainQueryTokenSource?.dispose();
    const tokenSource = new vscode.CancellationTokenSource();
    this._chatBrainQueryTokenSource = tokenSource;
    this._activeChatBrainRequestId = requestId;
    this._activeChatBrainConversationId = conversationId;

    const messageId = `msg-${Date.now()}`;
    const actionType = this._routeActionTypeFromMessage(message);
    const actionPolicy = classifyIncidentActionPolicy(actionType);
    const isFirstQuery = current.queryCount === 1;
    const memoryReuseSnapshot = isFirstQuery
      ? await this._buildIncidentMemoryReuseSnapshot(current.workspacePath)
      : null;
    const memoryPromptHint = buildIncidentMemoryPromptHint(memoryReuseSnapshot);
    let assistantText = '';
    let responseModelId: string | undefined;
    const expectedWorkspacePath = current.workspacePath;

    try {
      const { prepareAIConversation, streamAIResponse } = await import('../../core/aiService.js');
      const aiContext = await this._buildChatBrainAIContext({
        workspacePath: current.workspacePath,
        projectPath: current.projectPath,
        projectName: current.projectName,
        projectType: current.projectType,
      });
      const history = current.history.slice(-8);
      const structuredPrompt = await this._buildStructuredIncidentPrompt(message, {
        workspacePath: current.workspacePath,
        projectPath: current.projectPath,
        projectName: current.projectName,
        projectType: current.projectType,
      });

      // Doctor snapshot is already read inside _buildStructuredIncidentPrompt;
      // reuse it here for the contract rather than reading again.
      const chatDoctorSnapshot = await this._readDoctorEvidenceSnapshot(
        current.workspacePath
      ).catch(() => undefined);

      const prepared = await prepareAIConversation(
        'ask',
        memoryPromptHint ? `${structuredPrompt}\n\n${memoryPromptHint}` : structuredPrompt,
        aiContext,
        history,
        chatDoctorSnapshot ?? undefined
      );

      const maxAttempts = 2;
      let streamSucceeded = false;
      let lastStreamError: unknown;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (tokenSource.token.isCancellationRequested) {
          break;
        }

        let chunkBuffer = '';
        let attemptReceivedChunk = false;
        let flushTimer: ReturnType<typeof setInterval> | null = null;
        const attemptTokenSource = new vscode.CancellationTokenSource();
        const cancelSubscription = tokenSource.token.onCancellationRequested(() => {
          attemptTokenSource.cancel();
        });
        const firstChunkTimeout = setTimeout(() => {
          if (!attemptReceivedChunk && !attemptTokenSource.token.isCancellationRequested) {
            attemptTokenSource.cancel();
          }
        }, 20_000);

        try {
          flushTimer = setInterval(() => {
            const staleRequest =
              this._activeChatBrainRequestId !== requestId ||
              this._activeChatBrainConversationId !== conversationId ||
              (expectedWorkspacePath &&
                this._chatBrainConversations.get(conversationId)?.workspacePath !==
                  expectedWorkspacePath);

            if (staleRequest && !attemptTokenSource.token.isCancellationRequested) {
              attemptTokenSource.cancel();
              return;
            }

            if (!chunkBuffer || attemptTokenSource.token.isCancellationRequested) {
              return;
            }
            this._panel.webview.postMessage({
              command: 'aiChatChunk',
              data: {
                conversationId,
                messageId,
                chunk: chunkBuffer,
              },
              meta: { requestId, version: 'v1' },
            });
            chunkBuffer = '';
          }, 50);

          const streamResult = await streamAIResponse(
            prepared.messages,
            (chunk) => {
              const staleRequest =
                this._activeChatBrainRequestId !== requestId ||
                this._activeChatBrainConversationId !== conversationId ||
                (expectedWorkspacePath &&
                  this._chatBrainConversations.get(conversationId)?.workspacePath !==
                    expectedWorkspacePath);

              if (staleRequest && !attemptTokenSource.token.isCancellationRequested) {
                attemptTokenSource.cancel();
                return;
              }

              if (chunk.text) {
                attemptReceivedChunk = true;
                assistantText += chunk.text;
                chunkBuffer += chunk.text;
              }
              if (!chunk.done) {
                return;
              }
              if (flushTimer) {
                clearInterval(flushTimer);
                flushTimer = null;
              }
              if (chunkBuffer && !attemptTokenSource.token.isCancellationRequested) {
                this._panel.webview.postMessage({
                  command: 'aiChatChunk',
                  data: {
                    conversationId,
                    messageId,
                    chunk: chunkBuffer,
                  },
                  meta: { requestId, version: 'v1' },
                });
                chunkBuffer = '';
              }
            },
            attemptTokenSource.token,
            requestedModelId
          );

          if (
            attemptTokenSource.token.isCancellationRequested &&
            !tokenSource.token.isCancellationRequested &&
            !attemptReceivedChunk
          ) {
            throw new Error('First chunk timeout while streaming response.');
          }

          responseModelId = streamResult.modelId;
          streamSucceeded = true;
          break;
        } catch (streamErr) {
          lastStreamError = streamErr;
          const retryable = !attemptReceivedChunk && this._isRetryableChatBrainError(streamErr);
          const canRetry =
            attempt < maxAttempts && retryable && !tokenSource.token.isCancellationRequested;

          if (canRetry) {
            this._panel.webview.postMessage({
              command: 'aiChatActionProgress',
              data: {
                conversationId,
                actionId: messageId,
                stage: 'retrying',
                progress: 45,
                note: `Transient stream interruption detected. Retrying (${attempt + 1}/${maxAttempts})...`,
              },
              meta: { requestId, version: 'v1' },
            });
            continue;
          }

          throw streamErr;
        } finally {
          if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
          }
          clearTimeout(firstChunkTimeout);
          cancelSubscription.dispose();
          attemptTokenSource.dispose();
        }
      }

      if (!streamSucceeded) {
        throw lastStreamError instanceof Error
          ? lastStreamError
          : new Error('Chat stream failed before completion.');
      }

      if (tokenSource.token.isCancellationRequested) {
        return;
      }

      const nextConversation = this._chatBrainConversations.get(conversationId);
      const baseAssistantText = assistantText.trim() || 'No response generated.';
      const finalAssistantText = shouldAttachIncidentMemoryReuse(
        current.queryCount,
        memoryReuseSnapshot
      )
        ? prependIncidentMemoryReuseBlock(baseAssistantText, memoryReuseSnapshot)
        : baseAssistantText;

      if (nextConversation) {
        nextConversation.history = [
          ...nextConversation.history,
          {
            role: 'assistant' as const,
            content: finalAssistantText,
          },
        ].slice(-12);
        nextConversation.lastActionResponseText = finalAssistantText;
        this._chatBrainConversations.set(conversationId, nextConversation);
      }

      this._panel.webview.postMessage({
        command: 'aiChatActionBoard',
        data: {
          conversationId,
          messageId,
          board: {
            id: `board-${Date.now()}`,
            type: actionType === 'terminal-bridge' ? 'error' : 'solution',
            title: 'Recommended Next Action',
            summary: current.projectName
              ? `Selected project: ${current.projectName} • route: ${actionType}`
              : `Selected route: ${actionType}`,
            data: {
              route: actionType,
              confidence: 80,
              actionPolicy,
            },
            actions: [
              {
                id: `action-${Date.now()}`,
                label:
                  actionType === 'orchestrate'
                    ? current.projectName
                      ? `Inspect launch blockers for ${current.projectName}`
                      : 'Inspect launch blockers'
                    : `Run ${actionType}`,
                actionType: actionType === 'orchestrate' ? 'terminal-bridge' : actionType,
                riskLevel: actionPolicy.riskLevel,
                riskClass: actionPolicy.riskClass,
                requiresImpactReview: actionPolicy.requiresImpactReview,
                requiresVerifyPath: actionPolicy.requiresVerifyPath,
              },
              ...(actionType === 'terminal-bridge'
                ? [
                    {
                      id: `action-followup-${Date.now()}`,
                      label: 'Preview safe patch from this error',
                      actionType: 'fix-preview-lite',
                      riskLevel: 'low',
                    },
                  ]
                : []),
            ],
          },
        },
        meta: { requestId, version: 'v1' },
      });

      this._panel.webview.postMessage({
        command: 'aiChatSuggestedQuestions',
        data: {
          conversationId,
          messageId,
          questions: this._buildSuggestedQuestions(actionType, message),
        },
        meta: { requestId, version: 'v1' },
      });

      this._panel.webview.postMessage({
        command: 'aiChatDone',
        data: {
          conversationId,
          messageId,
          modelId: responseModelId,
          finalText: finalAssistantText,
          phase: 'diagnose',
          confidence: 80,
          nextActions: ['Run suggested action', 'Request verification', 'Ask follow-up'],
        },
        meta: { requestId, version: 'v1' },
      });
    } catch (err) {
      if (!tokenSource.token.isCancellationRequested) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const failureCode = this._deriveChatBrainFailureCode(err);
        const retryable = this._isRetryableChatBrainError(err);
        this._panel.webview.postMessage({
          command: 'aiChatPartialFailure',
          data: {
            conversationId,
            code: failureCode,
            message: errMsg,
            retryable,
            board: this._buildChatBrainFallbackBoard(actionType, current.projectName),
          },
          meta: { requestId, version: 'v1' },
        });

        this._panel.webview.postMessage({
          command: 'aiChatError',
          data: {
            conversationId,
            code: failureCode,
            message: errMsg,
            retryable,
          },
          meta: { requestId, version: 'v1' },
        });
      }
    } finally {
      if (this._chatBrainQueryTokenSource === tokenSource) {
        this._chatBrainQueryTokenSource = undefined;
      }
      if (this._activeChatBrainRequestId === requestId) {
        this._activeChatBrainRequestId = undefined;
      }
      if (this._activeChatBrainConversationId === conversationId) {
        this._activeChatBrainConversationId = undefined;
      }
      this._trackChatBrainRequestComplete(normalizedRequestId);
      tokenSource.dispose();
    }
  }

  /**
   * Build a natural-language query from an action type + optional payload.
   * Lets every action stream its answer INTO the Studio thread instead of
   * opening a separate modal.
   */
  private async _buildInlineQueryFromAction(
    actionType: string,
    payload?: Record<string, unknown>
  ): Promise<string> {
    // ── terminal-bridge ──────────────────────────────────────────────────────
    if (actionType === 'terminal-bridge') {
      let terminalOutput = '';
      try {
        const clip = (await vscode.env.clipboard.readText()).trim();
        if (clip && /\n|Error:|error:|Traceback|FAILED|npm ERR|❌/.test(clip)) {
          terminalOutput = clip.slice(0, 5000);
        }
      } catch {
        // clipboard unavailable — fall through to selection
      }
      if (!terminalOutput) {
        const editor = vscode.window.activeTextEditor;
        terminalOutput = editor?.document.getText(editor.selection).trim() ?? '';
      }
      if (terminalOutput) {
        return [
          'Analyze this terminal output and guide me to the fastest, safest fix.',
          '```\n' + terminalOutput + '\n```',
          'Respond with: root cause, immediate fix steps, any code-level follow-up, and a prevention tip.',
        ].join('\n\n');
      }
      return 'Analyze my workspace for runtime errors, check logs and recent terminal output, then suggest the highest-priority fix.';
    }

    // ── fix-preview-lite ─────────────────────────────────────────────────────
    if (actionType === 'fix-preview-lite') {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.document.getText(editor.selection).trim();
      const fileName = editor?.document.fileName
        ? path.basename(editor.document.fileName)
        : 'current file';
      if (selection) {
        return [
          `Preview a fix for this code in \`${fileName}\`:`,
          '```\n' + selection.slice(0, 3000) + '\n```',
          'Provide: what is wrong, the corrected code, and a one-sentence explanation of the change.',
        ].join('\n\n');
      }
      const issueSummary = typeof payload?.issueSummary === 'string' ? payload.issueSummary : '';
      if (issueSummary) {
        return `Preview the safest fix for this issue: ${issueSummary}\n\nShow the corrected code and explain why the change is safe.`;
      }
      return 'Scan my project for the most impactful bug or code smell and show a concrete fix preview with before/after code.';
    }

    // ── change-impact-lite ───────────────────────────────────────────────────
    if (actionType === 'change-impact-lite') {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.document.getText(editor.selection).trim();
      const fileName = editor?.document.fileName
        ? path.basename(editor.document.fileName)
        : 'current file';
      if (selection) {
        return [
          `Analyze the blast radius of changing this code in \`${fileName}\`:`,
          '```\n' + selection.slice(0, 3000) + '\n```',
          'List: affected modules/files, risk level (low/medium/high/critical), required test updates, and a safe rollout checklist.',
        ].join('\n\n');
      }
      return 'Analyze the current workspace for the highest-risk pending change or tech debt and estimate its impact on the rest of the project.';
    }

    // ── doctor-fix ───────────────────────────────────────────────────────────
    if (actionType === 'doctor-fix') {
      const issueSummary = typeof payload?.issueSummary === 'string' ? payload.issueSummary : '';
      const projectName = typeof payload?.projectName === 'string' ? payload.projectName : '';
      const issueType = typeof payload?.issueType === 'string' ? payload.issueType : '';
      if (issueSummary) {
        return [
          `Doctor detected an issue in project "${projectName || 'unknown'}":`,
          `Type: ${issueType || 'unknown'}`,
          `Detail: ${issueSummary}`,
          '',
          'Give me the exact fix commands or code changes to resolve this. Be direct and specific.',
        ].join('\n');
      }
      return 'Run a full workspace doctor check and explain the top issues with their exact fix steps.';
    }

    // ── workspace-memory-wizard ───────────────────────────────────────────────
    if (actionType === 'workspace-memory-wizard') {
      return [
        'Help me capture the key architecture decisions and conventions from this workspace into memory.',
        'Ask me the most important questions to build a complete workspace memory profile.',
        'After my answers, generate a structured memory summary I can save.',
      ].join('\n');
    }

    // ── recipe-pack ───────────────────────────────────────────────────────────
    if (actionType === 'recipe-pack') {
      const recipeId = typeof payload?.recipeId === 'string' ? payload.recipeId : '';
      if (recipeId) {
        return `Run the AI recipe "${recipeId}" for this workspace. Provide a step-by-step analysis and actionable output.`;
      }
      return 'List the 5 most relevant AI recipe workflows for my current workspace and project type, then run the top one.';
    }

    // ── incident-repro-pack (KF5) ─────────────────────────────────────────────
    if (actionType === 'incident-repro-pack') {
      const incidentScope =
        typeof payload?.incidentScope === 'string' ? payload.incidentScope.trim() : '';
      const incidentSummary =
        typeof payload?.incidentSummary === 'string' ? payload.incidentSummary.trim() : '';
      return [
        'Prepare a reproducible incident pack and replay brief from the current Incident Studio context.',
        incidentScope ? `Scope: ${incidentScope}` : '',
        incidentSummary ? `Incident summary: ${incidentSummary}` : '',
        '',
        'Return exactly these sections:',
        '1) Incident reproduction checklist (deterministic, step-by-step)',
        '2) Minimal evidence bundle (logs, diff, commands, environment)',
        '3) Sanitized share payload (what is safe to share and what must be redacted)',
        '4) Replay procedure for another developer and expected pass/fail signals',
      ]
        .filter(Boolean)
        .join('\n');
    }

    // ── apply-module-gen (A02) ────────────────────────────────────────────────
    if (actionType === 'apply-module-gen') {
      const featureIntent =
        typeof payload?.featureIntent === 'string' ? payload.featureIntent.trim() : '';
      const moduleName = typeof payload?.moduleName === 'string' ? payload.moduleName.trim() : '';
      const targetPath = typeof payload?.targetPath === 'string' ? payload.targetPath.trim() : '';
      return [
        featureIntent
          ? `Generate a complete, production-ready module for this feature: ${featureIntent}`
          : `Generate a complete module${moduleName ? ` named "${moduleName}"` : ''} for this workspace.`,
        targetPath ? `Target directory: ${targetPath}` : '',
        '',
        'IMPORTANT: For every file you create or modify, output it as a fenced code block with this format:',
        '```<language> path: <relative/path/to/file>',
        '// file content here',
        '```',
        '',
        'Include: all required source files, tests, and any configuration changes needed.',
        'After the code blocks, provide a brief summary of what was generated and verification steps.',
      ]
        .filter(Boolean)
        .join('\n');
    }

    // ── apply-debug-patch (A03) ───────────────────────────────────────────────
    if (actionType === 'apply-debug-patch') {
      const traceText = typeof payload?.traceText === 'string' ? payload.traceText.trim() : '';
      const logContext = typeof payload?.logContext === 'string' ? payload.logContext.trim() : '';
      const issueSummary =
        typeof payload?.issueSummary === 'string' ? payload.issueSummary.trim() : '';
      const parts: string[] = [];
      if (traceText) {
        parts.push(`Stack trace / error:\n\`\`\`\n${traceText.slice(0, 4000)}\n\`\`\``);
      }
      if (logContext) {
        parts.push(`Relevant log context:\n\`\`\`\n${logContext.slice(0, 2000)}\n\`\`\``);
      }
      if (issueSummary) {
        parts.push(`Issue description: ${issueSummary}`);
      }
      parts.push(
        '',
        'Provide a concrete patch to fix this issue.',
        'IMPORTANT: For every file you create or modify, output it as a fenced code block with this format:',
        '```<language> path: <relative/path/to/file>',
        '// patched content here',
        '```',
        '',
        'After the code blocks: explain the root cause, why this patch fixes it, and any required verification commands.'
      );
      if (!traceText && !issueSummary) {
        return 'Scan my workspace for the most likely active bug or error, then generate a targeted patch with before/after code blocks per file.';
      }
      return parts.filter(Boolean).join('\n');
    }

    // ── generic/orchestrate fallback ──────────────────────────────────────────
    const label = typeof payload?.label === 'string' ? payload.label : actionType;
    return `Perform the following action for my workspace: ${label}. Analyze the current state and provide specific, actionable guidance.`;
  }

  private async _handleAiChatExecuteAction(data: any, requestId?: string) {
    const conversationId = data?.conversationId;
    const actionId = typeof data?.actionId === 'string' ? data.actionId : `action-${Date.now()}`;
    const actionType = typeof data?.actionType === 'string' ? data.actionType : '';
    const conv =
      typeof conversationId === 'string'
        ? this._chatBrainConversations.get(conversationId)
        : undefined;

    if (!actionType) {
      this._panel.webview.postMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'INVALID_INPUT',
          message: 'Action type is required.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    if (!isIncidentActionAllowlisted(actionType)) {
      if (conv) {
        this._trackStudioEvent('workspai.studio.abandoned', conv.workspacePath, {
          conversationId,
          actionId,
          actionType,
          reason: 'action_not_allowlisted',
          framework: conv.framework ?? 'unknown',
        });
      }

      this._panel.webview.postMessage({
        command: 'aiChatActionResult',
        data: {
          conversationId,
          actionId,
          success: false,
          outputSummary: `${actionType} blocked by action allowlist policy`,
          verificationRequired: false,
          verifyPolicy: {
            requiresVerifyPath: true,
            requiresImpactReview: true,
            allowCompletionClaimWithoutVerify: false,
          },
        },
        meta: { requestId, version: 'v1' },
      });

      this._panel.webview.postMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'ACTION_NOT_ALLOWED',
          message: `Action type "${actionType}" is not in the approved allowlist.`,
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    const explicitWorkspacePath =
      typeof data?.workspacePath === 'string' && data.workspacePath.trim()
        ? data.workspacePath.trim()
        : undefined;

    if (conv?.workspacePath && explicitWorkspacePath) {
      const sameWorkspace = conv.workspacePath === explicitWorkspacePath;
      const sameHierarchy =
        isWorkspacePathAncestor(conv.workspacePath, explicitWorkspacePath) ||
        isWorkspacePathAncestor(explicitWorkspacePath, conv.workspacePath);

      if (!sameWorkspace && !sameHierarchy) {
        this._panel.webview.postMessage({
          command: 'aiChatError',
          data: {
            conversationId,
            code: 'WORKSPACE_SCOPE_VIOLATION',
            message: 'Action payload workspace does not match the active conversation workspace.',
            retryable: false,
          },
          meta: { requestId, version: 'v1' },
        });
        return;
      }
    }

    const projectPathInPayload =
      typeof data?.projectPath === 'string' && data.projectPath.trim()
        ? data.projectPath.trim()
        : undefined;

    if (conv?.workspacePath && projectPathInPayload) {
      if (!isWorkspacePathAncestor(conv.workspacePath, projectPathInPayload)) {
        this._panel.webview.postMessage({
          command: 'aiChatError',
          data: {
            conversationId,
            code: 'WORKSPACE_SCOPE_VIOLATION',
            message: 'Action project path is outside the active workspace scope.',
            retryable: false,
          },
          meta: { requestId, version: 'v1' },
        });
        return;
      }
    }

    const actionPolicy = classifyIncidentActionPolicy(actionType);
    const workspacePath = explicitWorkspacePath || conv?.workspacePath;
    const shouldAttemptAutoRollback =
      actionPolicy.riskClass === 'guarded-mutating' ||
      actionPolicy.riskClass === 'high-risk-mutating';
    const rollbackBaselineEntries =
      shouldAttemptAutoRollback && workspacePath
        ? await this._readGitDirtyEntries(workspacePath)
        : null;

    if (conv) {
      conv.actionCount += 1;
      conv.phase = 'verify';
      conv.lastActivityAt = Date.now();
      this._chatBrainConversations.set(conversationId, conv);

      this._trackStudioEvent('workspai.studio.action_executed', conv.workspacePath, {
        conversationId,
        actionId,
        actionType,
        actionRiskClass: actionPolicy.riskClass,
        actionRiskLevel: actionPolicy.riskLevel,
        framework: conv.framework ?? 'unknown',
        actionCount: conv.actionCount,
        timeToFirstActionMs: Date.now() - conv.startedAt,
      });
    }

    // Tell the Studio the action is starting
    this._panel.webview.postMessage({
      command: 'aiChatActionProgress',
      data: {
        conversationId,
        actionId,
        stage: 'gathering context',
        progress: 20,
        note: `Preparing ${actionType} analysis\u2026`,
      },
      meta: { requestId, version: 'v1' },
    });

    // Build the inline query — no modal opened
    const inlineQuery = await this._buildInlineQueryFromAction(
      actionType,
      data?.payload as Record<string, unknown> | undefined
    );

    this._panel.webview.postMessage({
      command: 'aiChatActionProgress',
      data: {
        conversationId,
        actionId,
        stage: 'streaming',
        progress: 40,
        note: 'Sending to AI\u2026',
      },
      meta: { requestId, version: 'v1' },
    });

    // Route through Chat Brain — answer streams into the Studio thread
    await this._handleAiChatQuery(
      {
        conversationId,
        message: inlineQuery,
        workspacePath,
        projectPath: data?.projectPath,
        projectName: data?.projectName,
        projectType: data?.projectType,
        modelId: data?.modelId,
      },
      requestId
    );

    const activeWorkspacePath =
      workspacePath || this._chatBrainConversations.get(conversationId)?.workspacePath;
    const graphSnapshot = await this._getWorkspaceGraphSnapshot(activeWorkspacePath);
    const doctorEvidence = await this._readDoctorEvidenceSummary(activeWorkspacePath);
    const verifyEvidenceAvailable = Boolean(doctorEvidence);
    const verifyReady = !actionPolicy.requiresVerifyPath || verifyEvidenceAvailable;
    const verifySuccess = verifyReady && (doctorEvidence?.errors ?? 0) === 0;
    const rollbackRuntimePolicy = this._resolveIncidentRollbackRuntimePolicy({
      workspacePath: activeWorkspacePath,
      actionPolicy,
      rollbackApprovalToken: data?.rollbackApproval,
    });
    const rollbackEvidence =
      !verifySuccess && shouldAttemptAutoRollback && activeWorkspacePath
        ? await this._attemptIncidentAutoRollback(
            activeWorkspacePath,
            rollbackBaselineEntries,
            rollbackRuntimePolicy
          )
        : undefined;
    const wave2Contracts = await this._buildIncidentWave2Contracts({
      requestId,
      conversationId,
      actionId,
      actionType,
      actionQuery: inlineQuery,
      workspacePath: activeWorkspacePath,
      actionPolicy,
      graphSnapshot,
      doctorEvidence,
      verifyReady,
      verifySuccess,
      rollbackRuntimePolicy,
    });
    const unknownScopeMutationBlocked =
      actionPolicy.requiresImpactReview &&
      wave2Contracts.impactAssessment.blockMutationWhenScopeUnknown &&
      !wave2Contracts.releaseGateEvidence.scopeKnown;
    const effectiveVerifySuccess = verifySuccess && !unknownScopeMutationBlocked;
    const sandboxEvidence =
      activeWorkspacePath &&
      (actionPolicy.riskClass === 'guarded-mutating' ||
        actionPolicy.riskClass === 'high-risk-mutating')
        ? await runSandboxSimulation({
            workspacePath: activeWorkspacePath,
            actionId,
            riskClass: actionPolicy.riskClass,
            verifyCommands: this._buildSandboxVerifyCommands({
              actionType,
              inlineQuery,
              impactVerifyChecklist: wave2Contracts.impactAssessment.verifyChecklist,
              conversationId,
            }),
            rollbackHint:
              rollbackEvidence?.suggestedNextStep ||
              'Keep apply blocked until simulation evidence and deterministic verification both pass.',
            defaultTimeoutMs: 20000,
          })
        : undefined;
    const diagnosisEvidence = this._buildIncidentDiagnosisEvidence({
      actionPolicy,
      verifyReady,
      verifySuccess: effectiveVerifySuccess,
      doctorEvidence,
      impactAssessment: wave2Contracts.impactAssessment,
      predictiveWarning: wave2Contracts.predictiveWarning,
      graphSnapshot: wave2Contracts.systemGraphSnapshot,
    });
    const incidentReproPackEvidence = this._buildIncidentReproPackEvidence({
      actionType,
      actionId,
      conversationId,
      workspacePath: activeWorkspacePath,
      verifySuccess: effectiveVerifySuccess,
      conversationHistoryTurns: conv?.history.length ?? 0,
      doctorEvidence,
      rollbackEvidence,
      sandboxEvidence,
      impactAssessment: wave2Contracts.impactAssessment,
      releaseGateEvidence: wave2Contracts.releaseGateEvidence,
      diagnosisEvidence,
    });

    if (conv && wave2Contracts.predictiveWarning) {
      this._trackStudioEvent('workspai.studio.prediction_shown', conv.workspacePath, {
        conversationId,
        actionId,
        actionType,
        predictionKey: wave2Contracts.predictiveWarning.telemetrySeed.predictionKey,
        confidenceBand: wave2Contracts.predictiveWarning.confidenceBand,
        riskLevel: wave2Contracts.impactAssessment.riskLevel,
        framework: conv.framework ?? 'unknown',
      });
    }

    if (conv) {
      if (effectiveVerifySuccess) {
        conv.verifyPassedAt = Date.now();
        conv.phase = 'learn';
      } else {
        conv.phase = 'verify';
      }
      conv.lastActivityAt = Date.now();
      this._chatBrainConversations.set(conversationId, conv);

      this._trackStudioEvent(
        effectiveVerifySuccess ? 'workspai.studio.verify_passed' : 'workspai.studio.verify_failed',
        conv.workspacePath,
        {
          conversationId,
          actionId,
          actionType,
          verifyReady,
          unknownScopeMutationBlocked,
          framework: conv.framework ?? 'unknown',
          errors: doctorEvidence?.errors ?? 0,
          warnings: doctorEvidence?.warnings ?? 0,
          passed: doctorEvidence?.passed ?? 0,
        }
      );

      if (wave2Contracts.predictiveWarning) {
        this._trackStudioEvent(
          effectiveVerifySuccess
            ? 'workspai.studio.prediction_falsified'
            : 'workspai.studio.prediction_verified',
          conv.workspacePath,
          {
            conversationId,
            actionId,
            actionType,
            predictionKey: wave2Contracts.predictiveWarning.telemetrySeed.predictionKey,
            warningId: wave2Contracts.predictiveWarning.warningId,
            verifySuccess: effectiveVerifySuccess,
            framework: conv.framework ?? 'unknown',
          }
        );
      }

      this._emitArchitectureReasoningRuntimeEvents({
        conversationId,
        actionId,
        actionType,
        workspacePath: conv.workspacePath ?? activeWorkspacePath ?? '',
        framework: conv.framework,
        wave2Contracts,
        verifySuccess: effectiveVerifySuccess,
      });

      if (incidentReproPackEvidence) {
        this._trackStudioEvent('workspai.studio.incident_repro_pack_captured', conv.workspacePath, {
          conversationId,
          actionId,
          actionType,
          packId: incidentReproPackEvidence.packId,
          redactionApplied: incidentReproPackEvidence.redaction.applied,
          verifySuccess,
          framework: conv.framework ?? 'unknown',
        });

        this._trackStudioEvent('workspai.studio.incident_replay_ready', conv.workspacePath, {
          conversationId,
          actionId,
          actionType,
          packId: incidentReproPackEvidence.packId,
          blockedReasonCount: incidentReproPackEvidence.summary.blockedReasonCount,
          verifyChecklistCount: incidentReproPackEvidence.replayPayload.verifyChecklist.length,
          framework: conv.framework ?? 'unknown',
        });
      }

      if (effectiveVerifySuccess && conv.importedIncidentReplay && conv.workspacePath) {
        const replayMemorySaved = await this._persistIncidentReplayLearning({
          workspacePath: conv.workspacePath,
          packId: conv.importedIncidentReplay.packId,
          actionType: conv.importedIncidentReplay.actionType,
          riskLevel: conv.importedIncidentReplay.riskLevel,
          likelyFailureMode:
            wave2Contracts.impactAssessment.likelyFailureMode ||
            conv.importedIncidentReplay.likelyFailureMode,
          verifyChecklist:
            wave2Contracts.impactAssessment.verifyChecklist.length > 0
              ? wave2Contracts.impactAssessment.verifyChecklist
              : conv.importedIncidentReplay.verifyChecklist,
          blockedReasons:
            wave2Contracts.releaseGateEvidence.blockedReasons.length > 0
              ? wave2Contracts.releaseGateEvidence.blockedReasons
              : conv.importedIncidentReplay.blockedReasons,
          relatedFiles:
            wave2Contracts.impactAssessment.affectedFiles.length > 0
              ? wave2Contracts.impactAssessment.affectedFiles
              : conv.importedIncidentReplay.relatedFiles,
        });

        if (replayMemorySaved) {
          this._trackStudioEvent(
            'workspai.studio.incident_replay_memory_enriched',
            conv.workspacePath,
            {
              conversationId,
              actionId,
              actionType,
              packId: conv.importedIncidentReplay.packId,
              framework: conv.framework ?? 'unknown',
            }
          );
        }

        delete conv.importedIncidentReplay;
        this._chatBrainConversations.set(conversationId, conv);
      }

      if (rollbackEvidence?.attempted) {
        this._trackStudioEvent('workspai.studio.rollback_attempted', conv.workspacePath, {
          conversationId,
          actionId,
          actionType,
          rollbackStatus: rollbackEvidence.status,
          restoredCount: rollbackEvidence.restoredFiles.length,
          failedCount: rollbackEvidence.failedFiles.length,
          framework: conv.framework ?? 'unknown',
        });

        this._trackStudioEvent(
          rollbackEvidence.status === 'succeeded'
            ? 'workspai.studio.rollback_succeeded'
            : 'workspai.studio.rollback_failed',
          conv.workspacePath,
          {
            conversationId,
            actionId,
            actionType,
            rollbackStatus: rollbackEvidence.status,
            restoredCount: rollbackEvidence.restoredFiles.length,
            failedCount: rollbackEvidence.failedFiles.length,
            framework: conv.framework ?? 'unknown',
          }
        );
      }

      const uiPrefs = this._getUiPreferences();
      if (effectiveVerifySuccess && uiPrefs.incidentAutoLearningPrompt) {
        this._panel.webview.postMessage({
          command: 'aiChatSuggestedQuestions',
          data: {
            conversationId,
            messageId: `learn-${Date.now()}`,
            questions: [
              'Capture this verified fix as reusable workspace memory.',
              'Summarize why this fix worked and save it as a team convention.',
              'Generate a memory entry with command + verification evidence.',
            ],
          },
          meta: { requestId, version: 'v1' },
        });

        this._panel.webview.postMessage({
          command: 'aiChatActionBoard',
          data: {
            conversationId,
            messageId: `learn-board-${Date.now()}`,
            board: {
              id: `learn-board-${Date.now()}`,
              type: 'learning',
              title: 'Verification passed - capture reusable memory',
              summary: 'Persist this fix pattern so the next similar incident resolves faster.',
              data: {
                route: 'workspace-memory-wizard',
                confidence: 90,
              },
              actions: [
                {
                  id: `learn-action-${Date.now()}`,
                  label: 'Capture workspace memory now',
                  actionType: 'workspace-memory-wizard',
                  riskLevel: 'low',
                },
              ],
            },
          },
          meta: { requestId, version: 'v1' },
        });
      }
    }

    // ── Multi-file patch extraction (A02 / A03) ────────────────────────────────
    let multiFilePatchResult: MultiFilePatchResult | undefined;
    const isPatchAction = actionType === 'apply-module-gen' || actionType === 'apply-debug-patch';
    if (isPatchAction && activeWorkspacePath) {
      const convAfterQuery = this._chatBrainConversations.get(conversationId);
      const lastResponseText = convAfterQuery?.lastActionResponseText ?? '';

      if (lastResponseText) {
        const rawPatches = extractPatchesFromAiResponse(lastResponseText, {
          actionId,
          workspacePath: activeWorkspacePath,
        });

        if (rawPatches.length > 0) {
          // For A03 (apply-debug-patch), only auto-apply when sandboxEvidence says safeToApply.
          // For A02 (apply-module-gen), send patches as 'pending' for user to review.
          const shouldAutoApply =
            actionType === 'apply-debug-patch' &&
            !unknownScopeMutationBlocked &&
            sandboxEvidence?.safeToApply === true &&
            actionPolicy.riskClass !== 'high-risk-mutating';

          if (shouldAutoApply) {
            multiFilePatchResult = await applyPatches({
              actionId,
              workspacePath: activeWorkspacePath,
              patches: rawPatches,
              branchSafeApply: true,
              verificationPassed: sandboxEvidence?.status === 'passed',
              verificationNote: sandboxEvidence?.reason,
            });
          } else {
            // Return patches as 'pending' — user applies/rejects via UI
            multiFilePatchResult = {
              patchId: `patch-${actionId}-${Date.now().toString(36)}`,
              generatedAt: new Date().toISOString(),
              actionId,
              patches: rawPatches.map((p) => ({ ...p, status: 'pending' as const })),
              appliedCount: 0,
              rejectedCount: 0,
              failedCount: 0,
            };
          }

          await WorkspaceUsageTracker.getInstance().trackCommandEvent(
            'workspai.patch.extracted',
            activeWorkspacePath,
            {
              actionId,
              actionType,
              patchCount: rawPatches.length,
              autoApplied: shouldAutoApply,
            }
          );
        }
      }
    }

    // Mark action resolved (stream already showed the result)
    this._panel.webview.postMessage({
      command: 'aiChatActionResult',
      data: {
        conversationId,
        actionId,
        success: effectiveVerifySuccess,
        outputSummary: unknownScopeMutationBlocked
          ? `${actionType} - blocked: affected scope is unknown for a mutating action`
          : effectiveVerifySuccess
            ? `${actionType} \u2014 result shown in conversation above`
            : rollbackEvidence
              ? `${actionType} \u2014 verification failed; rollback status: ${rollbackEvidence.status}`
              : verifyReady
                ? `${actionType} \u2014 verification failed; review output and retry safely`
                : `${actionType} \u2014 verification required before completion claim`,
        verificationRequired: !verifyReady,
        verifyPolicy: {
          requiresVerifyPath: actionPolicy.requiresVerifyPath,
          requiresImpactReview: actionPolicy.requiresImpactReview,
          allowCompletionClaimWithoutVerify: actionPolicy.allowCompletionClaimWithoutVerify,
        },
        evidence: doctorEvidence
          ? {
              source: 'doctor-last-run',
              ...doctorEvidence,
            }
          : undefined,
        diagnosis: diagnosisEvidence,
        rollback: rollbackEvidence,
        sandboxSimulation: sandboxEvidence,
        incidentReproPack: incidentReproPackEvidence,
        multiFilePatch: multiFilePatchResult,
        systemGraphSnapshot: wave2Contracts.systemGraphSnapshot,
        impactAssessment: wave2Contracts.impactAssessment,
        predictiveWarning: wave2Contracts.predictiveWarning,
        releaseGateEvidence: wave2Contracts.releaseGateEvidence,
      },
      meta: { requestId, version: 'v1' },
    });
  }

  /**
   * Handle the user applying or rejecting individual file patches from the
   * multi-file patch review card (A02 / A03 apply/reject workflow).
   *
   * Expected payload:
   *   { conversationId, patchId, acceptedPaths: string[], workspacePath, branchSafeApply?: boolean }
   */
  private async _handleApplyPatch(data: any, requestId?: string) {
    const conversationId =
      typeof data?.conversationId === 'string' ? data.conversationId : undefined;
    const patchId = typeof data?.patchId === 'string' ? data.patchId : `patch-${Date.now()}`;
    const acceptedPaths: string[] = Array.isArray(data?.acceptedPaths)
      ? data.acceptedPaths.filter((p: unknown) => typeof p === 'string')
      : [];
    const branchSafeApply = data?.branchSafeApply === true;

    const conv = conversationId ? this._chatBrainConversations.get(conversationId) : undefined;
    const workspacePath =
      (typeof data?.workspacePath === 'string' && data.workspacePath.trim()
        ? data.workspacePath.trim()
        : undefined) ?? conv?.workspacePath;

    if (!workspacePath) {
      this._panel.webview.postMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'INVALID_INPUT',
          message: 'workspacePath is required to apply patches.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    const lastResponse = conv?.lastActionResponseText ?? '';
    const rawPatches = lastResponse
      ? extractPatchesFromAiResponse(lastResponse, { actionId: patchId, workspacePath })
      : [];

    if (rawPatches.length === 0) {
      this._panel.webview.postMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'NO_PATCHES',
          message: 'No patches found to apply.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    const result = await applyPatches({
      actionId: patchId,
      workspacePath,
      patches: rawPatches,
      branchSafeApply,
      acceptedPaths: acceptedPaths.length > 0 ? acceptedPaths : undefined,
    });

    this._panel.webview.postMessage({
      command: 'aiChatPatchApplied',
      data: { conversationId, patchId, result },
      meta: { requestId, version: 'v1' },
    });
  }

  private async _handleExportSandboxSimulationEvidence(
    data: any,
    requestId?: string
  ): Promise<void> {
    const sandboxSimulation =
      data &&
      typeof data === 'object' &&
      data.sandboxSimulation &&
      typeof data.sandboxSimulation === 'object'
        ? (data.sandboxSimulation as {
            actionId?: string;
            workspacePath?: string;
            riskClass?:
              | 'informational'
              | 'non-mutating-executable'
              | 'guarded-mutating'
              | 'high-risk-mutating';
            mode?: 'verify-pack-simulation' | 'disposable-sandbox';
            status?: 'passed' | 'failed' | 'skipped';
            startedAt?: string;
            completedAt?: string;
            durationMs?: number;
            commandResults?: Array<{
              label?: string;
              command?: string;
              args?: string[];
              exitCode?: number;
              stdout?: string;
              stderr?: string;
              durationMs?: number;
            }>;
            recommendedRollbackPath?: string;
            safeToApply?: boolean;
            reason?: string;
          })
        : undefined;

    if (!sandboxSimulation?.actionId || !sandboxSimulation.workspacePath) {
      vscode.window.showWarningMessage('No sandbox simulation evidence is available to export.');
      return;
    }

    const workspacePathInput =
      typeof data?.workspacePath === 'string' && data.workspacePath.trim()
        ? data.workspacePath.trim()
        : sandboxSimulation.workspacePath;

    const defaultFileName = `${sandboxSimulation.actionId}-sandbox-simulation-evidence.json`;
    const defaultUri = vscode.Uri.file(
      path.join(workspacePathInput, '.rapidkit', 'reports', defaultFileName)
    );

    const outputUri = await vscode.window.showSaveDialog({
      title: 'Export Sandbox Simulation Evidence',
      saveLabel: 'Export Evidence',
      defaultUri,
      filters: {
        JSON: ['json'],
      },
    });

    if (!outputUri) {
      return;
    }

    const redactText = (value: string | undefined): string | undefined => {
      if (typeof value !== 'string' || value.length === 0) {
        return value;
      }

      return value
        .replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s\n\r"']+/gi, '$1[REDACTED]')
        .replace(/(token\s*[:=]\s*)[^\s\n\r"']+/gi, '$1[REDACTED]')
        .replace(/(password\s*[:=]\s*)[^\s\n\r"']+/gi, '$1[REDACTED]')
        .replace(/(api[_-]?key\s*[:=]\s*)[^\s\n\r"']+/gi, '$1[REDACTED]')
        .replace(/(secret\s*[:=]\s*)[^\s\n\r"']+/gi, '$1[REDACTED]');
    };

    const redactedCommandResults = Array.isArray(sandboxSimulation.commandResults)
      ? sandboxSimulation.commandResults.map((result) => ({
          label: typeof result?.label === 'string' ? result.label : 'verify command',
          command: typeof result?.command === 'string' ? result.command : '',
          args: Array.isArray(result?.args)
            ? result.args.filter((arg): arg is string => typeof arg === 'string').slice(0, 12)
            : [],
          exitCode: typeof result?.exitCode === 'number' ? result.exitCode : -1,
          stdout: redactText(
            typeof result?.stdout === 'string' ? result.stdout.slice(0, 4000) : ''
          ),
          stderr: redactText(
            typeof result?.stderr === 'string' ? result.stderr.slice(0, 4000) : ''
          ),
          durationMs:
            typeof result?.durationMs === 'number' && Number.isFinite(result.durationMs)
              ? Math.max(0, Math.round(result.durationMs))
              : 0,
        }))
      : [];

    const exportPayload = {
      sandbox_simulation_evidence: {
        schemaVersion: 'v1',
        exportedAt: new Date().toISOString(),
        actionId: sandboxSimulation.actionId,
        workspacePath: workspacePathInput,
        riskClass: sandboxSimulation.riskClass || 'guarded-mutating',
        mode: sandboxSimulation.mode || 'verify-pack-simulation',
        status: sandboxSimulation.status || 'skipped',
        startedAt: sandboxSimulation.startedAt,
        completedAt: sandboxSimulation.completedAt,
        durationMs:
          typeof sandboxSimulation.durationMs === 'number' &&
          Number.isFinite(sandboxSimulation.durationMs)
            ? Math.max(0, Math.round(sandboxSimulation.durationMs))
            : 0,
        safeToApply: sandboxSimulation.safeToApply === true,
        reason: redactText(sandboxSimulation.reason),
        recommendedRollbackPath: redactText(sandboxSimulation.recommendedRollbackPath),
        commandResults: redactedCommandResults,
        summary: {
          commandCount: redactedCommandResults.length,
          failedCommandCount: redactedCommandResults.filter((entry) => entry.exitCode !== 0).length,
          redactionApplied: true,
        },
      },
    };

    await vscode.workspace.fs.writeFile(
      outputUri,
      Buffer.from(JSON.stringify(exportPayload, null, 2), 'utf8')
    );

    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.studio.sandbox_simulation_evidence_exported',
      workspacePathInput,
      {
        actionId: sandboxSimulation.actionId,
        status: exportPayload.sandbox_simulation_evidence.status,
        mode: exportPayload.sandbox_simulation_evidence.mode,
        safeToApply: exportPayload.sandbox_simulation_evidence.safeToApply,
        commandCount: exportPayload.sandbox_simulation_evidence.summary.commandCount,
        failedCommandCount: exportPayload.sandbox_simulation_evidence.summary.failedCommandCount,
      }
    );

    vscode.window.showInformationMessage(
      `Sandbox simulation evidence exported: ${outputUri.fsPath}`
    );

    this._panel.webview.postMessage({
      command: 'aiChatActionProgress',
      data: {
        stage: 'simulation-exported',
        progress: 100,
        note: `Simulation evidence exported: ${path.basename(outputUri.fsPath)}`,
      },
      meta: { requestId, version: 'v1' },
    });
  }

  private async _sendIncidentStudioTelemetry(explicitWorkspacePath?: string, forceRefresh = false) {
    const workspacePath = explicitWorkspacePath || this._resolveTelemetryWorkspacePath();
    const tracker = WorkspaceUsageTracker.getInstance();
    const doctorSummary = await this._readDoctorEvidenceSnapshot(workspacePath);

    // Check cache first (5 minute TTL)
    const cacheKey = `incident-studio-telemetry-${workspacePath}`;
    const cachedData = this._context.globalState.get<{
      commandSummary: any;
      onboardingSummary: any;
      ctaVariantBreakdown?: any;
      studioHardGateStatus?: any;
      studioRollbackKpiStatus?: any;
      doctorSummary?: any;
      timestamp: number;
    }>(cacheKey);

    const now = Date.now();
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    if (
      !forceRefresh &&
      cachedData &&
      shouldUseIncidentStudioTelemetryCache(cachedData, now, CACHE_TTL)
    ) {
      // Use cached data
      console.log('[WelcomePanel] Using cached incident studio telemetry for:', workspacePath);
      this._panel.webview.postMessage({
        command: 'incidentStudioTelemetry',
        data: buildIncidentStudioTelemetryFromCache(cachedData, doctorSummary),
      });
      return;
    }

    // Fetch fresh data if cache miss or expired
    const [
      commandSummary,
      onboardingSummary,
      ctaVariantBreakdown,
      studioHardGateStatus,
      studioRollbackKpiStatus,
      studioReproPackKpiStatus,
    ] = await Promise.all([
      tracker.getCommandTelemetrySummary(workspacePath, 'last7d'),
      tracker.getOnboardingExperimentStats(workspacePath, 'last7d'),
      tracker.getStudioCtaVariantBreakdown(workspacePath, 'last7d'),
      tracker.getStudioHardGateStatus(workspacePath, 'last7d'),
      tracker.getStudioRollbackKpiStatus(workspacePath, 'last7d'),
      tracker.getStudioReproPackKpiStatus(workspacePath, 'last7d'),
    ]);

    const telemetryData = buildIncidentStudioTelemetryPayload(
      commandSummary,
      onboardingSummary,
      ctaVariantBreakdown,
      doctorSummary,
      studioHardGateStatus,
      studioRollbackKpiStatus,
      studioReproPackKpiStatus
    );

    // Store in cache
    await this._context.globalState.update(cacheKey, {
      ...telemetryData,
      timestamp: now,
    });

    this._panel.webview.postMessage({
      command: 'incidentStudioTelemetry',
      data: telemetryData,
    });
  }

  private _getUiPreferences(): {
    setupStatusCardHidden: boolean;
    incidentUserMode: 'guided' | 'standard' | 'expert';
    incidentAutoLearningPrompt: boolean;
    incidentPrimaryCtaExperimentVariant: 'single' | 'multi';
    incidentRollbackApprovalMode: 'never' | 'high-risk-only' | 'mutating-only' | 'always';
    incidentRollbackProtectedPaths: string[];
  } {
    const prefs = this._context.globalState.get<Record<string, unknown>>(
      WelcomePanel.UI_PREFS_KEY,
      {}
    );
    const incidentUserMode =
      prefs?.incidentUserMode === 'guided' ||
      prefs?.incidentUserMode === 'standard' ||
      prefs?.incidentUserMode === 'expert'
        ? (prefs.incidentUserMode as 'guided' | 'standard' | 'expert')
        : 'standard';
    return {
      setupStatusCardHidden: prefs?.setupStatusCardHidden === true,
      incidentUserMode,
      incidentAutoLearningPrompt: prefs?.incidentAutoLearningPrompt !== false,
      incidentPrimaryCtaExperimentVariant: this._getIncidentPrimaryCtaExperimentVariant(),
      incidentRollbackApprovalMode: this._normalizeIncidentRollbackApprovalMode(
        prefs?.incidentRollbackApprovalMode
      ),
      incidentRollbackProtectedPaths: this._normalizeIncidentRollbackProtectedPaths(
        prefs?.incidentRollbackProtectedPaths
      ),
    };
  }

  private _sendUiPreferences() {
    this._panel.webview.postMessage({
      command: 'uiPreferences',
      data: this._getUiPreferences(),
    });
  }

  private async _setUiPreference(key: string, value: unknown) {
    const current = this._context.globalState.get<Record<string, unknown>>(
      WelcomePanel.UI_PREFS_KEY,
      {}
    );
    const next = {
      ...current,
      [key]: value,
    };
    await this._context.globalState.update(WelcomePanel.UI_PREFS_KEY, next);
    this._sendUiPreferences();
  }

  private _sendVersion() {
    const version = this._context.extension.packageJSON.version || '0.0.0';
    this._panel.webview.postMessage({
      command: 'updateVersion',
      data: version,
    });
  }

  private async _sendRecentWorkspaces() {
    const workspaces = await this._getRecentWorkspaces();
    this._panel.webview.postMessage({
      command: 'updateRecentWorkspaces',
      data: workspaces,
    });
  }

  private async _sendExampleWorkspaces() {
    try {
      const examplesService = ExamplesService.getInstance();
      const examples = await examplesService.getExamples();

      // Enrich each example with clone status
      const enrichedExamples = await Promise.all(
        examples.map(async (example) => {
          const isCloned = await examplesService.isExampleCloned(example.id);
          let cloneStatus: 'not-cloned' | 'cloned' | 'update-available' = 'not-cloned';

          if (isCloned) {
            cloneStatus = 'cloned';

            // Check for updates
            const updateInfo = await examplesService.checkForUpdates(example.id);
            if (updateInfo.hasUpdate) {
              cloneStatus = 'update-available';
            }
          }

          // repoUrl: URL used by the UI "Open on GitHub" button (workspace subfolder when available).
          // cloneUrl: URL used by `git clone` and must always be repository root.
          const repoUrl = example.path
            ? `https://github.com/getrapidkit/rapidkit-examples/tree/main/${example.path}`
            : 'https://github.com/getrapidkit/rapidkit-examples';
          const cloneUrl = 'https://github.com/getrapidkit/rapidkit-examples';

          return {
            ...example,
            repoUrl,
            cloneUrl,
            cloneStatus,
          };
        })
      );

      this._panel.webview.postMessage({
        command: 'updateExampleWorkspaces',
        data: enrichedExamples,
      });
    } catch (error) {
      console.error('[WelcomePanel] Failed to send example workspaces:', error);
    }
  }

  private async _sendAvailableKits() {
    try {
      const kitsService = KitsService.getInstance();
      const kits = await kitsService.getKits();

      this._panel.webview.postMessage({
        command: 'updateAvailableKits',
        data: kits,
      });

      console.log('[WelcomePanel] ✅ Available kits sent to webview:', kits.length);
    } catch (error) {
      console.error('[WelcomePanel] Failed to send available kits:', error);
      // Send empty array on error
      this._panel.webview.postMessage({
        command: 'updateAvailableKits',
        data: [],
      });
    }
  }
  private async _cloneExample(example: any) {
    try {
      // Notify webview we're cloning
      this._panel.webview.postMessage({
        command: 'setCloning',
        data: { exampleName: example.name },
      });

      // Ask user where to clone
      const result = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Clone Location',
        title: `Clone ${example.title}`,
      });

      if (!result || result.length === 0) {
        // User cancelled
        this._panel.webview.postMessage({
          command: 'setCloning',
          data: { exampleName: null },
        });
        return;
      }

      const parentFolder = result[0].fsPath;
      const targetPath = path.join(parentFolder, example.name);

      // Check if already exists
      if (await fs.pathExists(targetPath)) {
        const overwrite = await vscode.window.showWarningMessage(
          `Folder "${example.name}" already exists at this location.`,
          'Cancel',
          'Open Existing'
        );

        if (overwrite === 'Open Existing') {
          // Import existing workspace
          const workspaceManager = WorkspaceManager.getInstance();
          await workspaceManager.addWorkspace(targetPath);
          await this._sendRecentWorkspaces();
          vscode.window.showInformationMessage(`✅ Imported existing workspace: ${example.name}`);
        }

        this._panel.webview.postMessage({
          command: 'setCloning',
          data: { exampleName: null },
        });
        return;
      }

      // Clone the repository
      vscode.window.showInformationMessage(`🔄 Cloning ${example.title}...`);
      const cloneSource = example.cloneUrl || 'https://github.com/getrapidkit/rapidkit-examples';

      const terminal = runShellCommandInTerminal({
        name: `Clone ${example.name}`,
        cwd: parentFolder,
        command: 'git',
        args: ['clone', cloneSource, 'rapidkit-examples-temp'],
      });

      // Wait for clone to complete
      await new Promise((resolve) => setTimeout(resolve, 8000));

      // Move the specific workspace out
      const tempRepoPath = path.join(parentFolder, 'rapidkit-examples-temp');
      const sourceWorkspacePath = path.join(tempRepoPath, example.name);

      // Check if workspace exists in cloned repo
      if (await fs.pathExists(sourceWorkspacePath)) {
        // Move workspace to target location
        await fs.move(sourceWorkspacePath, targetPath);

        // Clean up temp repo
        await fs.remove(tempRepoPath);

        // Get commit hash for tracking
        const examplesService = ExamplesService.getInstance();
        const commitHash = await examplesService.getRepoCommitHash(targetPath);

        // Track the cloned example
        await examplesService.trackClonedExample(
          example.id || example.name,
          example.name,
          targetPath,
          commitHash || undefined
        );

        // Import to workspace list
        const workspaceManager = WorkspaceManager.getInstance();
        await workspaceManager.addWorkspace(targetPath);
        await this._sendRecentWorkspaces();

        // Refresh examples list to show new clone status
        await this._sendExampleWorkspaces();

        vscode.window
          .showInformationMessage(
            `✅ Successfully cloned and imported: ${example.name}`,
            'Open Workspace'
          )
          .then((selection) => {
            if (selection === 'Open Workspace') {
              const uri = vscode.Uri.file(targetPath);
              vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
            }
          });

        terminal.dispose();
      } else {
        // Cleanup on failure
        if (await fs.pathExists(tempRepoPath)) {
          await fs.remove(tempRepoPath);
        }
        vscode.window.showWarningMessage(
          `Clone completed but workspace "${example.name}" not found in repository. Check the terminal for details.`,
          'OK'
        );
      }
    } catch (error: any) {
      console.error('[WelcomePanel] Error cloning example:', error);
      vscode.window.showErrorMessage(`Failed to clone example: ${error.message}`);
    } finally {
      // Reset cloning state
      this._panel.webview.postMessage({
        command: 'setCloning',
        data: { exampleName: null },
      });
    }
  }

  private async _updateExample(example: any) {
    try {
      const examplesService = ExamplesService.getInstance();
      const info = await examplesService.getClonedExampleInfo(example.id || example.name);

      if (!info || !info.clonedPath) {
        vscode.window.showWarningMessage('Example is not cloned yet.');
        return;
      }

      // Check if path exists
      if (!(await fs.pathExists(info.clonedPath))) {
        vscode.window
          .showWarningMessage(`Cloned example not found at: ${info.clonedPath}`, 'Untrack')
          .then(async (action) => {
            if (action === 'Untrack') {
              await examplesService.untrackExample(example.id || example.name);
              await this._sendExampleWorkspaces();
            }
          });
        return;
      }

      // Notify user
      this._panel.webview.postMessage({
        command: 'setUpdating',
        data: { exampleName: example.name },
      });

      // Check if workspace has uncommitted changes
      const hasChanges = await this._checkGitStatus(info.clonedPath);

      if (hasChanges) {
        const action = await vscode.window.showWarningMessage(
          `The workspace "${example.name}" has uncommitted changes. Updating may cause conflicts.`,
          'Continue Anyway',
          'Cancel'
        );

        if (action !== 'Continue Anyway') {
          this._panel.webview.postMessage({
            command: 'setUpdating',
            data: { exampleName: null },
          });
          return;
        }
      }

      // Create terminal and run git pull
      runCommandsInTerminal({
        name: `Update ${example.name}`,
        cwd: info.clonedPath,
        commands: ['git fetch origin main', 'git pull origin main'],
      });

      vscode.window.showInformationMessage(
        `🔄 Updating ${example.name}... Check terminal for details.`,
        'OK'
      );

      // Wait for update to complete
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Update tracking with new commit hash
      const newCommitHash = await examplesService.getRepoCommitHash(info.clonedPath);
      if (newCommitHash) {
        await examplesService.trackClonedExample(
          example.id || example.name,
          example.name,
          info.clonedPath,
          newCommitHash
        );
      }

      // Refresh examples list
      await this._sendExampleWorkspaces();

      vscode.window.showInformationMessage(`✅ ${example.name} updated successfully!`);
    } catch (error: any) {
      console.error('[WelcomePanel] Error updating example:', error);
      vscode.window.showErrorMessage(`Failed to update example: ${error.message}`);
    } finally {
      this._panel.webview.postMessage({
        command: 'setUpdating',
        data: { exampleName: null },
      });
    }
  }

  private async _checkGitStatus(repoPath: string): Promise<boolean> {
    try {
      const result = await run('git', ['status', '--porcelain'], { cwd: repoPath });
      if (result.exitCode !== 0) {
        return false;
      }
      return result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async _readGitDirtyEntries(
    workspacePath: string
  ): Promise<Array<{ path: string; untracked: boolean }> | null> {
    try {
      const result = await run('git', ['status', '--porcelain'], {
        cwd: workspacePath,
        timeout: 3000,
      });

      if (result.exitCode !== 0) {
        return null;
      }

      if (!result.stdout.trim()) {
        return [];
      }

      const entries: Array<{ path: string; untracked: boolean }> = [];
      for (const rawLine of result.stdout.split('\n')) {
        const line = rawLine.trimEnd();
        if (!line || line.length < 4) {
          continue;
        }

        const statusCode = line.slice(0, 2);
        const pathChunk = line.slice(3).trim();
        if (!pathChunk) {
          continue;
        }

        const normalizedPath = pathChunk.includes('->')
          ? pathChunk.split('->').pop()?.trim() || pathChunk
          : pathChunk;

        if (!normalizedPath) {
          continue;
        }

        entries.push({
          path: normalizedPath,
          untracked: statusCode === '??',
        });
      }

      return entries;
    } catch {
      return null;
    }
  }

  private async _attemptIncidentAutoRollback(
    workspacePath: string,
    baselineEntries: Array<{ path: string; untracked: boolean }> | null,
    runtimePolicy?: {
      approvalMode: 'never' | 'high-risk-only' | 'mutating-only' | 'always';
      requiresManualApproval: boolean;
      approvedByUser: boolean;
      protectedPathPrefixes: string[];
    }
  ): Promise<{
    attempted: boolean;
    status: 'succeeded' | 'failed' | 'partial' | 'skipped' | 'unavailable';
    reason?: string;
    attemptedAt: string;
    candidateFiles: string[];
    restoredFiles: string[];
    failedFiles: string[];
    suggestedNextStep?: string;
  }> {
    const attemptedAt = new Date().toISOString();
    const unavailableResult = {
      attempted: false,
      status: 'unavailable' as const,
      reason: 'Git rollback is unavailable for this workspace.',
      attemptedAt,
      candidateFiles: [] as string[],
      restoredFiles: [] as string[],
      failedFiles: [] as string[],
      suggestedNextStep: 'Run the verify path manually and inspect workspace state before retry.',
    };

    const afterEntries = await this._readGitDirtyEntries(workspacePath);
    if (!baselineEntries || !afterEntries) {
      return unavailableResult;
    }

    const baselineSet = new Set(baselineEntries.map((entry) => entry.path));
    const deltaEntries = afterEntries.filter((entry) => !baselineSet.has(entry.path));
    if (deltaEntries.length === 0) {
      return {
        attempted: false,
        status: 'skipped',
        reason: 'No new file mutations were detected for rollback.',
        attemptedAt,
        candidateFiles: [],
        restoredFiles: [],
        failedFiles: [],
      };
    }

    const allCandidateFiles = deltaEntries.map((entry) => entry.path);
    if (runtimePolicy?.requiresManualApproval && !runtimePolicy.approvedByUser) {
      return {
        attempted: false,
        status: 'skipped',
        reason: `Rollback policy (${runtimePolicy.approvalMode}) requires manual approval before auto-restore.`,
        attemptedAt,
        candidateFiles: allCandidateFiles,
        restoredFiles: [],
        failedFiles: allCandidateFiles,
        suggestedNextStep:
          'Approve rollback for this action in the UI or run manual `git restore` for affected files.',
      };
    }

    const trackedCandidates = deltaEntries
      .filter((entry) => !entry.untracked)
      .map((entry) => entry.path);
    const untrackedCandidates = deltaEntries
      .filter((entry) => entry.untracked)
      .map((entry) => entry.path);
    const protectedCandidates = trackedCandidates.filter((candidatePath) =>
      this._isIncidentRollbackProtectedPath(
        candidatePath,
        runtimePolicy?.protectedPathPrefixes ?? []
      )
    );
    const eligibleTrackedCandidates = trackedCandidates.filter(
      (candidatePath) => !protectedCandidates.includes(candidatePath)
    );

    if (eligibleTrackedCandidates.length === 0 && protectedCandidates.length > 0) {
      return {
        attempted: false,
        status: 'skipped',
        reason:
          'All tracked rollback candidates are protected by policy and require manual restore.',
        attemptedAt,
        candidateFiles: allCandidateFiles,
        restoredFiles: [],
        failedFiles: [...protectedCandidates, ...untrackedCandidates],
        suggestedNextStep:
          'Review protected files and run a manual rollback after explicit approval.',
      };
    }

    if (trackedCandidates.length === 0) {
      return {
        attempted: false,
        status: 'skipped',
        reason: 'Only untracked files changed; auto-rollback skipped for safety.',
        attemptedAt,
        candidateFiles: untrackedCandidates,
        restoredFiles: [],
        failedFiles: untrackedCandidates,
        suggestedNextStep:
          'Inspect untracked files and remove manually if safe, then rerun verification.',
      };
    }

    let restoreResult = await run(
      'git',
      ['restore', '--staged', '--worktree', '--', ...eligibleTrackedCandidates],
      {
        cwd: workspacePath,
        timeout: 6000,
      }
    );

    if (restoreResult.exitCode !== 0) {
      restoreResult = await run(
        'git',
        ['restore', '--worktree', '--', ...eligibleTrackedCandidates],
        {
          cwd: workspacePath,
          timeout: 6000,
        }
      );
    }

    const afterRestoreEntries = await this._readGitDirtyEntries(workspacePath);
    const afterRestoreSet = new Set((afterRestoreEntries || []).map((entry) => entry.path));
    const restoredFiles = eligibleTrackedCandidates.filter(
      (filePath) => !afterRestoreSet.has(filePath)
    );
    const failedTrackedFiles = eligibleTrackedCandidates.filter((filePath) =>
      afterRestoreSet.has(filePath)
    );
    const failedFiles = [...failedTrackedFiles, ...protectedCandidates, ...untrackedCandidates];

    const status: 'succeeded' | 'failed' | 'partial' =
      failedFiles.length === 0 ? 'succeeded' : restoredFiles.length > 0 ? 'partial' : 'failed';

    const reason =
      restoreResult.exitCode !== 0
        ? 'Auto-rollback command exited with errors; some files may need manual restore.'
        : protectedCandidates.length > 0
          ? 'Protected rollback files were skipped and need manual restore approval.'
          : undefined;

    return {
      attempted: true,
      status,
      reason,
      attemptedAt,
      candidateFiles: [
        ...eligibleTrackedCandidates,
        ...protectedCandidates,
        ...untrackedCandidates,
      ],
      restoredFiles,
      failedFiles,
      suggestedNextStep:
        failedFiles.length > 0
          ? 'Run `git status` and restore remaining files manually before retrying.'
          : undefined,
    };
  }

  private _tokenizeSandboxCommand(commandText: string): { command: string; args: string[] } | null {
    const trimmed = commandText.trim();
    if (!trimmed) {
      return null;
    }

    // Keep simulation command intake strict: reject shell chaining and interpolation.
    if (/[;&|><`$()]/.test(trimmed)) {
      return null;
    }

    const parts = trimmed.split(/\s+/).filter((part) => part.length > 0);
    if (parts.length === 0) {
      return null;
    }

    const command = parts[0];
    const args = parts.slice(1);
    const commandAllowlist = new Set([
      'rapidkit',
      'npm',
      'pnpm',
      'yarn',
      'poetry',
      'pytest',
      'python',
      'python3',
      'uv',
      'go',
      'mvn',
      'mvnw',
      './mvnw',
      'gradle',
      './gradlew',
    ]);

    if (!commandAllowlist.has(command)) {
      return null;
    }

    return { command, args };
  }

  private _extractVerifyCommandCandidatesFromText(text: string): string[] {
    const candidates: string[] = [];
    const verifyLineRegex = /^\s*verify command\s*:\s*(.+)$/gim;
    let lineMatch: RegExpExecArray | null = verifyLineRegex.exec(text);
    while (lineMatch) {
      const commandText = (lineMatch[1] || '').trim();
      if (commandText) {
        candidates.push(commandText);
      }
      lineMatch = verifyLineRegex.exec(text);
    }

    const fencedCodeRegex = /```(?:bash|sh|zsh)?\n([\s\S]*?)```/gim;
    let fencedMatch: RegExpExecArray | null = fencedCodeRegex.exec(text);
    while (fencedMatch) {
      const block = fencedMatch[1] || '';
      for (const line of block.split(/\r?\n/)) {
        const cleaned = line.replace(/^\s*\$\s*/, '').trim();
        if (cleaned) {
          candidates.push(cleaned);
        }
      }
      fencedMatch = fencedCodeRegex.exec(text);
    }

    return candidates;
  }

  private _toSandboxVerifyCommands(candidates: string[]): SandboxVerifyCommand[] {
    const results: SandboxVerifyCommand[] = [];
    const seen = new Set<string>();

    for (const rawCandidate of candidates) {
      const parsed = this._tokenizeSandboxCommand(rawCandidate);
      if (!parsed) {
        continue;
      }

      const key = `${parsed.command} ${parsed.args.join(' ')}`.trim().toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      results.push({
        command: parsed.command,
        args: parsed.args,
        label: `verify: ${parsed.command}`,
      });

      if (results.length >= 2) {
        break;
      }
    }

    return results;
  }

  private _buildSandboxVerifyCommands(input: {
    actionType: string;
    inlineQuery: string;
    impactVerifyChecklist: string[];
    conversationId?: string;
  }): SandboxVerifyCommand[] {
    const candidates: string[] = [];

    for (const checklistItem of input.impactVerifyChecklist) {
      const trimmed = checklistItem.trim();
      if (!trimmed) {
        continue;
      }

      const checklistCommandRegex = /`([^`]+)`/g;
      let match: RegExpExecArray | null = checklistCommandRegex.exec(trimmed);
      while (match) {
        const commandText = (match[1] || '').trim();
        if (commandText) {
          candidates.push(commandText);
        }
        match = checklistCommandRegex.exec(trimmed);
      }
    }

    const conversation =
      input.conversationId && this._chatBrainConversations.has(input.conversationId)
        ? this._chatBrainConversations.get(input.conversationId)
        : undefined;
    const assistantHistory = (conversation?.history || [])
      .filter((entry) => entry.role === 'assistant')
      .slice(-3);
    for (const entry of assistantHistory) {
      candidates.push(...this._extractVerifyCommandCandidatesFromText(entry.content));
    }

    candidates.push(...this._extractVerifyCommandCandidatesFromText(input.inlineQuery));

    const fallbackByActionType: Record<string, string> = {
      'doctor-fix': 'rapidkit doctor --fix',
      'change-impact-lite': 'rapidkit change-impact-lite',
      'fix-preview-lite': 'rapidkit fix-preview-lite',
    };
    if (fallbackByActionType[input.actionType]) {
      candidates.push(fallbackByActionType[input.actionType]);
    }

    return this._toSandboxVerifyCommands(candidates);
  }

  private async _sendModulesCatalog() {
    await this._refreshModulesCatalog();
  }

  private async _refreshModulesCatalog(): Promise<void> {
    try {
      const service = ModulesCatalogService.getInstance();
      // Get workspace path - use selected project's workspace or VS Code workspace folders
      let workspacePath: string | undefined;
      if (WelcomePanel._selectedProject) {
        // Extract workspace path from project path (project is inside workspace)
        const projectPath = WelcomePanel._selectedProject.path;
        // Workspace is parent of project (e.g., /path/to/my-wsps)
        workspacePath = path.dirname(projectPath);
      } else if (
        vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length > 0
      ) {
        workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
      }

      const result = await service.getModulesCatalog(workspacePath);
      if (result.modules.length) {
        this._modulesCatalog = result.modules;
      } else {
        this._modulesCatalog = MODULES;
      }

      this._panel.webview.postMessage({
        command: 'updateModulesCatalog',
        data: this._modulesCatalog,
      });
    } catch (error) {
      console.error('[WelcomePanel] Failed to load modules catalog:', error);
      this._modulesCatalog = MODULES;
    }
  }

  private async _sendWorkspaceStatus() {
    const selectedWorkspace = this._getSelectedWorkspaceInfo();
    const hasWorkspace = selectedWorkspace !== null;
    let hasProjectSelected = false;
    let installedModules: { slug: string; version: string; display_name: string }[] = [];
    let projectType: 'fastapi' | 'nestjs' | 'go' | 'springboot' | undefined;

    // Keep project-scoped details only when selected project belongs to selected workspace.
    if (
      WelcomePanel._selectedProject &&
      selectedWorkspace &&
      WelcomePanel._selectedProject.path.startsWith(`${selectedWorkspace.path}${path.sep}`)
    ) {
      hasProjectSelected = true;
      installedModules = await WelcomePanel._readInstalledModules(
        WelcomePanel._selectedProject.path
      );
      projectType =
        (await WelcomePanel._detectProjectTypeStatic(WelcomePanel._selectedProject.path)) ??
        undefined;
    }

    // If project selection is stale (from another workspace), clear project-scoped state.
    if (
      WelcomePanel._selectedProject &&
      selectedWorkspace &&
      !WelcomePanel._selectedProject.path.startsWith(`${selectedWorkspace.path}${path.sep}`)
    ) {
      WelcomePanel._selectedProject = null;
    }

    this._panel.webview.postMessage({
      command: 'updateWorkspaceStatus',
      data: {
        hasWorkspace,
        hasProjectSelected,
        workspaceName: selectedWorkspace?.name,
        workspacePath: selectedWorkspace?.path,
        projectName: hasProjectSelected ? WelcomePanel._selectedProject?.name : undefined,
        projectPath: hasProjectSelected ? WelcomePanel._selectedProject?.path : undefined,
        projectType,
        installedModules,
      },
    });
  }

  private _getRecentWorkspaces(): Promise<
    Array<{
      name: string;
      path: string;
      lastAccessed?: number;
      coreVersion?: string;
      coreStatus?:
        | 'ok'
        | 'outdated'
        | 'not-installed'
        | 'update-available'
        | 'up-to-date'
        | 'error'
        | 'deprecated';
      coreLocation?: 'workspace' | 'global' | 'pipx';
      lastModified?: number;
      projectCount?: number;
      projectStats?: {
        fastapi?: number;
        nestjs?: number;
        springboot?: number;
        go?: number;
      };
      bootstrapProfile?:
        | 'minimal'
        | 'python-only'
        | 'node-only'
        | 'go-only'
        | 'java-only'
        | 'polyglot'
        | 'enterprise';
      dependencySharingMode?: 'isolated' | 'shared-runtime-caches' | 'shared-node-deps';
      policyMode?: 'warn' | 'strict';
      complianceStatus?: 'passing' | 'failing' | 'unknown';
      mirrorStatus?: 'synced' | 'stale' | 'not-configured';
    }>
  > {
    try {
      const workspaceManager = WorkspaceManager.getInstance();
      const versionService = CoreVersionService.getInstance();
      const workspaces = workspaceManager.getWorkspaces();

      // Enrich workspaces with version info, last modified, and project info
      const enrichedWorkspaces = Promise.all(
        workspaces.map(async (ws) => {
          try {
            const versionInfo = await versionService.getVersionInfo(ws.path);

            // Get last modified time and project info
            let lastModified: number | undefined;
            let projectCount: number | undefined;
            let projectStats:
              | { fastapi?: number; nestjs?: number; springboot?: number; go?: number }
              | undefined;
            try {
              const stats = await fs.stat(ws.path);
              lastModified = stats.mtimeMs;

              // Detect projects in workspace root (not projects/ subfolder!)
              const entries = await fs.readdir(ws.path, { withFileTypes: true });
              const stats_counter = { fastapi: 0, nestjs: 0, springboot: 0, go: 0 };
              let count = 0;

              for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                  const projectPath = path.join(ws.path, entry.name);

                  // Check for RapidKit project markers
                  const hasRapidKitMarker =
                    (await fs.pathExists(path.join(projectPath, '.rapidkit', 'project.json'))) ||
                    (await fs.pathExists(path.join(projectPath, '.rapidkit', 'context.json')));

                  if (hasRapidKitMarker) {
                    count++;
                    // Detect project type
                    const type = await this._detectProjectType(projectPath);
                    if (type === 'fastapi') {
                      stats_counter.fastapi++;
                    } else if (type === 'nestjs') {
                      stats_counter.nestjs++;
                    } else if (type === 'springboot') {
                      stats_counter.springboot++;
                    } else if (type === 'go') {
                      stats_counter.go++;
                    }
                  }
                  // Fallback: Check for FastAPI project
                  else if (await fs.pathExists(path.join(projectPath, 'pyproject.toml'))) {
                    count++;
                    stats_counter.fastapi++;
                  }
                  // Fallback: Check for Spring Boot project
                  else if (
                    (await fs.pathExists(path.join(projectPath, 'pom.xml'))) ||
                    (await fs.pathExists(path.join(projectPath, 'build.gradle'))) ||
                    (await fs.pathExists(path.join(projectPath, 'build.gradle.kts')))
                  ) {
                    count++;
                    stats_counter.springboot++;
                  }
                  // Fallback: Check for Go project
                  else if (await fs.pathExists(path.join(projectPath, 'go.mod'))) {
                    count++;
                    stats_counter.go++;
                  }
                  // Fallback: Check for NestJS project
                  else if (await fs.pathExists(path.join(projectPath, 'package.json'))) {
                    try {
                      const pkg = await fs.readJSON(path.join(projectPath, 'package.json'));
                      if (pkg.dependencies?.['@nestjs/core']) {
                        count++;
                        stats_counter.nestjs++;
                      }
                    } catch {
                      // Ignore invalid package.json
                    }
                  }
                }
              }

              projectCount = count;
              projectStats =
                count > 0
                  ? {
                      fastapi: stats_counter.fastapi > 0 ? stats_counter.fastapi : undefined,
                      nestjs: stats_counter.nestjs > 0 ? stats_counter.nestjs : undefined,
                      springboot:
                        stats_counter.springboot > 0 ? stats_counter.springboot : undefined,
                      go: stats_counter.go > 0 ? stats_counter.go : undefined,
                    }
                  : undefined;
            } catch (err) {
              console.error(`Failed to get stats for ${ws.path}:`, err);
            }

            // --- Phase 4 enrichment ---
            let bootstrapProfile:
              | 'minimal'
              | 'python-only'
              | 'node-only'
              | 'go-only'
              | 'java-only'
              | 'polyglot'
              | 'enterprise'
              | undefined;
            let dependencySharingMode:
              | 'isolated'
              | 'shared-runtime-caches'
              | 'shared-node-deps'
              | undefined;
            let policyMode: 'warn' | 'strict' | undefined;
            let complianceStatus: 'passing' | 'failing' | 'unknown' | undefined;
            let mirrorStatus: 'synced' | 'stale' | 'not-configured' | undefined;
            try {
              const manifestPath = path.join(ws.path, '.rapidkit', 'workspace.json');
              if (await fs.pathExists(manifestPath)) {
                const manifest = await fs.readJSON(manifestPath).catch(() => null);
                if (manifest) {
                  bootstrapProfile = manifest.profile;
                }
              }

              const policiesPath = path.join(ws.path, '.rapidkit', 'policies.yml');
              if (await fs.pathExists(policiesPath)) {
                const policyContent = await fs.readFile(policiesPath, 'utf-8');

                const modeMatch = policyContent.match(/^\s*mode:\s*(warn|strict)\s*$/m);
                if (modeMatch && (modeMatch[1] === 'warn' || modeMatch[1] === 'strict')) {
                  policyMode = modeMatch[1];
                }

                const depModeMatch = policyContent.match(
                  /^\s*dependency_sharing_mode:\s*(isolated|shared-runtime-caches|shared-node-deps)\s*$/m
                );
                if (
                  depModeMatch &&
                  (depModeMatch[1] === 'isolated' ||
                    depModeMatch[1] === 'shared-runtime-caches' ||
                    depModeMatch[1] === 'shared-node-deps')
                ) {
                  dependencySharingMode = depModeMatch[1];
                }
              }

              const reportsDir = path.join(ws.path, '.rapidkit', 'reports');
              if (await fs.pathExists(reportsDir)) {
                const reportFiles = await fs.readdir(reportsDir);
                const latestCompliance = reportFiles
                  .filter((f) => f.startsWith('bootstrap-compliance'))
                  .sort()
                  .reverse()[0];
                if (latestCompliance) {
                  const report = await fs
                    .readJSON(path.join(reportsDir, latestCompliance))
                    .catch(() => null);
                  // result field: 'ok' | 'ok_with_warnings' | 'failed'
                  const rawResult = report?.result || report?.status;
                  complianceStatus =
                    rawResult === 'ok' || rawResult === 'ok_with_warnings'
                      ? 'passing'
                      : rawResult === 'failed'
                        ? 'failing'
                        : 'unknown';
                }
                const latestMirror = reportFiles
                  .filter((f) => f.startsWith('mirror-ops'))
                  .sort()
                  .reverse()[0];
                mirrorStatus = latestMirror
                  ? ((await fs.readJSON(path.join(reportsDir, latestMirror)).catch(() => null))
                      ?.status ?? 'not-configured')
                  : 'not-configured';
              }
            } catch {
              // Phase 4 data unavailable — leave as undefined
            }
            // --- End Phase 4 enrichment ---

            return {
              ...ws,
              coreVersion: versionInfo.installed,
              coreLatestVersion: versionInfo.latest,
              coreStatus: versionInfo.status,
              coreLocation: versionInfo.location as 'workspace' | 'global' | 'pipx' | undefined,
              lastModified,
              projectCount,
              projectStats,
              bootstrapProfile,
              dependencySharingMode,
              policyMode,
              complianceStatus,
              mirrorStatus,
            };
          } catch (error) {
            console.error(`Failed to get version info for ${ws.path}:`, error);
            return {
              ...ws,
              coreVersion: undefined,
              coreStatus: 'error' as const,
              coreLocation: undefined,
              bootstrapProfile: undefined,
              dependencySharingMode: undefined,
              policyMode: undefined,
              complianceStatus: undefined,
              mirrorStatus: undefined,
            };
          }
        })
      );

      return enrichedWorkspaces;
    } catch (error) {
      console.error('Failed to get recent workspaces:', error);
      return Promise.resolve([]);
    }
  }

  private async _detectProjectType(
    projectPath: string
  ): Promise<'fastapi' | 'nestjs' | 'go' | 'springboot' | null> {
    return WelcomePanel._detectProjectTypeStatic(projectPath);
  }

  static async _detectProjectTypeStatic(
    projectPath: string
  ): Promise<'fastapi' | 'nestjs' | 'go' | 'springboot' | null> {
    try {
      // Check for Go indicators
      const goModPath = path.join(projectPath, 'go.mod');
      if (await fs.pathExists(goModPath)) {
        return 'go';
      }

      // Check for Spring Boot / Java indicators
      const pomXmlPath = path.join(projectPath, 'pom.xml');
      const gradlePath = path.join(projectPath, 'build.gradle');
      const gradleKtsPath = path.join(projectPath, 'build.gradle.kts');
      if (
        (await fs.pathExists(pomXmlPath)) ||
        (await fs.pathExists(gradlePath)) ||
        (await fs.pathExists(gradleKtsPath))
      ) {
        return 'springboot';
      }

      // Check for FastAPI indicators
      const pyprojectPath = path.join(projectPath, 'pyproject.toml');
      if (await fs.pathExists(pyprojectPath)) {
        const content = await fs.readFile(pyprojectPath, 'utf8');
        if (content.includes('fastapi') || content.includes('uvicorn')) {
          return 'fastapi';
        }
      }

      // Check for NestJS indicators
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const content = await fs.readFile(packageJsonPath, 'utf8');
        if (content.includes('@nestjs/core') || content.includes('@nestjs/common')) {
          return 'nestjs';
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private _getHtmlContent(context: vscode.ExtensionContext): string {
    // Get URIs for webview resources
    const scriptUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js')
    );
    const cssUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.css')
    );
    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'workspai.svg')
    );
    const fontUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'fonts', 'MuseoModerno-Bold.ttf')
    );
    const fastapiIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'fastapi.svg')
    );
    const nestjsIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'nestjs.svg')
    );
    const goIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'go.svg')
    );
    const springbootIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'springboot.svg')
    );

    // Generate nonce for CSP
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; font-src ${this._panel.webview.cspSource}; img-src ${this._panel.webview.cspSource} https:; script-src 'nonce-${nonce}';">
    <title>Welcome to Workspai</title>
    <link rel="stylesheet" type="text/css" href="${cssUri}">
    <style>
        @font-face {
            font-family: 'MuseoModerno';
            src: url('${fontUri}') format('truetype');
            font-weight: bold;
            font-style: normal;
        }
        
        /* Inject icon URIs as CSS variables */
        :root {
            --icon-uri: url('${iconUri}');
            --fastapi-icon-uri: url('${fastapiIconUri}');
            --nestjs-icon-uri: url('${nestjsIconUri}');
            --go-icon-uri: url('${goIconUri}');
          --springboot-icon-uri: url('${springbootIconUri}');
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        // Inject URIs for React components to use
        window.ICON_URI = '${iconUri}';
        window.FASTAPI_ICON_URI = '${fastapiIconUri}';
        window.NESTJS_ICON_URI = '${nestjsIconUri}';
        window.GO_ICON_URI = '${goIconUri}';
        window.SPRINGBOOT_ICON_URI = '${springbootIconUri}';
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private async _showModuleDetails(moduleData: any): Promise<void> {
    try {
      let workspacePath: string | undefined;
      if (WelcomePanel._selectedProject) {
        workspacePath = WelcomePanel._selectedProject.path;
      } else if (
        vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length > 0
      ) {
        workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
      }

      const { run } = await import('../../utils/exec.js');

      let command = 'rapidkit';
      if (workspacePath) {
        const candidates = getWorkspaceVenvRapidkitCandidates(workspacePath);
        for (const candidate of candidates) {
          if (await fs.pathExists(candidate)) {
            command = candidate;
            break;
          }
        }
      }

      const candidates = [
        moduleData.slug,
        moduleData.id,
        moduleData.slug?.split('/').filter(Boolean).pop(),
      ].filter((value, index, self) => value && self.indexOf(value) === index) as string[];

      console.log('[WelcomePanel] Fetching module info for:', candidates);

      let moduleInfo: any = null;
      let foundMatch = false;

      for (const candidate of candidates) {
        try {
          // Try to get JSON output first
          const jsonResult = await run(command, ['modules', 'info', candidate, '--json'], {
            cwd: workspacePath,
            shell: false,
            timeout: 5000,
          });
          if (jsonResult.exitCode === 0 && jsonResult.stdout) {
            try {
              const parsed = JSON.parse(jsonResult.stdout);
              // Merge with moduleData but prefer fresh CLI data
              moduleInfo = { ...moduleData, ...parsed };
              foundMatch = true;
              console.log(
                '[WelcomePanel] Found module info (JSON) for:',
                candidate,
                'version:',
                parsed.version
              );
              console.log('[WelcomePanel] moduleInfo after merge:', {
                name: moduleInfo.display_name,
                version: moduleInfo.version,
                slug: moduleInfo.slug,
              });
              break;
            } catch {
              console.log('[WelcomePanel] Failed to parse JSON for:', candidate);
            }
          }
        } catch {
          console.log('[WelcomePanel] Failed to fetch JSON info for:', candidate);
        }
      }

      if (!foundMatch || !moduleInfo) {
        console.log('[WelcomePanel] Could not fetch module info from CLI, using card data');
        moduleInfo = { ...moduleData };
      }

      // Send module details to React webview for modal display
      console.log('[WelcomePanel] Sending showModuleDetailsModal message:', moduleInfo);
      WelcomePanel.currentPanel?._panel.webview.postMessage({
        command: 'showModuleDetailsModal',
        data: moduleInfo,
      });
    } catch (error) {
      console.error('[WelcomePanel] Error showing module details:', error);
      vscode.window.showErrorMessage('Failed to load module details');
    }
  }

  public dispose() {
    WelcomePanel.currentPanel = undefined;

    this._aiQueryTokenSource?.cancel();
    this._aiQueryTokenSource?.dispose();
    this._aiQueryTokenSource = undefined;
    this._activeAIQueryRequestId = undefined;

    for (const watcher of this._systemGraphWatcherByPath.values()) {
      watcher.dispose();
    }
    this._systemGraphWatcherByPath.clear();

    this._doctorTelemetryRefreshController.dispose();

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
