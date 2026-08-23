/**
 * Create Workspace Command
 * Interactive wizard for creating a new Workspai workspace
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { WorkspaceWizard } from '../ui/wizards/workspaceWizard';
import { Logger } from '../utils/logger';
import { parseRapidKitError, formatErrorMessage, logDetailedError } from '../utils/errorParser';
import { CreateWorkspaceOptions, WorkspaiCLI } from '../core/rapidkitCLI';
import { WorkspaceManager } from '../core/workspaceManager';
import {
  isFirstTimeSetup,
  showFirstTimeSetupComplete,
  showFirstTimeSetupMessage,
} from '../utils/firstTimeSetup';
import { updateWorkspaceMetadata } from '../utils/workspaceMarker';
import { WelcomePanel } from '../ui/panels/welcomePanel';
import { isPoetryInstalledCached } from '../utils/poetryHelper';
import { checkPythonEnvironmentCached } from '../utils/pythonChecker';
import { runCommandsInTerminal } from '../utils/terminalExecutor';
import {
  isDefaultWorkspaceCreationPath,
  hasWorkspaceRootMarkers,
  resolveNewWorkspacePath,
} from '../core/workspacePaths';
import { profileInstallsPythonEngineAtCreate } from '../contracts/createPlannerCapabilities';

type InstallMethod = 'poetry' | 'venv' | 'pipx' | 'auto';
type BootstrapProfile = NonNullable<CreateWorkspaceOptions['profile']>;
type PolicyMode = 'warn' | 'strict' | 'disabled';
type DependencySharing = 'isolated' | 'shared';

type PythonEnvironmentCheck = {
  available: boolean;
  meetsMinimumVersion: boolean;
  venvSupport: boolean;
  version?: string;
  error?: string;
};

type WorkspaceModalConfig = {
  name: string;
  initGit?: boolean;
  profile?: BootstrapProfile;
  installMethod?: InstallMethod;
  skipPythonEngine?: boolean;
  policyMode?: PolicyMode;
  dependencySharing?: DependencySharing;
  /** Assist / chained flows: show toast without blocking on user dismissal. */
  suppressPostCreatePrompt?: boolean;
  /** Chat-first flows: keep VS Code notifications quiet and report progress in the caller UI. */
  silent?: boolean;
};

type WorkspaceCreationConfig = {
  name: string;
  path: string;
  initGit: boolean;
  profile?: BootstrapProfile;
  installMethod?: InstallMethod;
  skipPythonEngine?: boolean;
  policyMode?: PolicyMode;
  dependencySharing?: DependencySharing;
  suppressPostCreatePrompt?: boolean;
  silent?: boolean;
};

function isWorkspaceModalConfig(value: unknown): value is WorkspaceModalConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<WorkspaceModalConfig>;
  return typeof candidate.name === 'string' && candidate.name.trim().length > 0;
}

function defaultSkipPythonEngine(profile?: BootstrapProfile): boolean {
  return !profileInstallsPythonEngineAtCreate(profile ?? 'minimal');
}

export async function createWorkspaceCommand(workspaceName?: string | Record<string, unknown>) {
  const logger = Logger.getInstance();
  logger.info(
    'Create Workspace command initiated',
    workspaceName ? `with name: ${workspaceName}` : ''
  );

  try {
    let pythonCheck: PythonEnvironmentCheck = {
      available: false,
      meetsMinimumVersion: false,
      venvSupport: false,
    };
    const modalConfig = isWorkspaceModalConfig(workspaceName) ? workspaceName : null;
    const isModalFlow = Boolean(modalConfig?.name);

    // Check if this is first-time setup and show guidance (only if name not provided from modal)
    if (!workspaceName) {
      const isFirstTime = await isFirstTimeSetup();
      if (isFirstTime) {
        logger.info('First-time setup detected, showing guidance');
        const shouldContinue = await showFirstTimeSetupMessage();
        if (!shouldContinue) {
          logger.info('User cancelled first-time setup');
          return;
        }
      }
    }

    // Get workspace configuration
    let config: WorkspaceCreationConfig;

    if (workspaceName) {
      if (isWorkspaceModalConfig(workspaceName)) {
        // Full config object sent from the webview modal
        logger.info('Using full config from webview modal:', workspaceName.name);
        config = {
          name: workspaceName.name,
          path: resolveNewWorkspacePath(workspaceName.name),
          initGit: workspaceName.initGit !== undefined ? workspaceName.initGit : true,
          profile: workspaceName.profile || 'minimal',
          installMethod: workspaceName.installMethod || 'auto',
          skipPythonEngine:
            typeof workspaceName.skipPythonEngine === 'boolean'
              ? workspaceName.skipPythonEngine
              : defaultSkipPythonEngine(workspaceName.profile || 'minimal'),
          policyMode: workspaceName.policyMode || 'warn',
          dependencySharing: workspaceName.dependencySharing || 'isolated',
          suppressPostCreatePrompt: workspaceName.suppressPostCreatePrompt === true,
          silent: workspaceName.silent === true,
        };
      } else {
        // Legacy: plain name string (from command palette or internal calls)
        logger.info('Using provided workspace name:', workspaceName);
        config = {
          name: workspaceName as string,
          path: resolveNewWorkspacePath(workspaceName as string),
          initGit: true,
          profile: 'minimal',
          skipPythonEngine: true,
        };
      }
    } else {
      // Show wizard to collect user input
      const wizard = new WorkspaceWizard();
      const wizardConfig = await wizard.show();

      if (!wizardConfig) {
        logger.info('Workspace creation cancelled by user');
        return;
      }

      config = {
        name: wizardConfig.name,
        path: wizardConfig.path,
        initGit: wizardConfig.initGit,
        profile: wizardConfig.profile,
        installMethod: wizardConfig.installMethod,
        skipPythonEngine:
          typeof wizardConfig.skipPythonEngine === 'boolean'
            ? wizardConfig.skipPythonEngine
            : defaultSkipPythonEngine(wizardConfig.profile),
        policyMode: wizardConfig.policyMode,
        dependencySharing: wizardConfig.dependencySharing,
      };
    }

    let chosenInstallMethod: 'poetry' | 'venv' | 'pipx' | undefined = config.skipPythonEngine
      ? undefined
      : 'venv';

    if (config.skipPythonEngine) {
      logger.info('Skipping optional Python engine bootstrap for lightweight workspace creation');
    } else {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Preparing workspace creation',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 0, message: 'Checking system requirements...' });
          logger.info('Checking for Python 3.10+ installation...');

          const { requirementCache } = await import('../utils/requirementCache.js');
          const cacheStats = requirementCache.getStats();
          const pythonCached = cacheStats.pythonCached;

          progress.report({
            increment: 30,
            message: pythonCached
              ? 'Checking Python (cached)...'
              : 'Checking Python installation...',
          });

          pythonCheck = await checkPythonEnvironmentCached();

          if (!pythonCheck.available) {
            logger.error('Python not installed');
            progress.report({ increment: 100, message: 'Python not found' });
          }
        }
      );

      if (!pythonCheck.available) {
        logger.warn('Python not detected in pre-check; continuing with profile-aware flow');
      } else if (!pythonCheck.meetsMinimumVersion) {
        logger.warn(
          `Python version ${pythonCheck.version} is below minimum; continuing with profile-aware flow`
        );
      } else if (!pythonCheck.venvSupport) {
        logger.warn('Python venv support missing in pre-check; continuing with profile-aware flow');
      } else {
        logger.info(`Python ${pythonCheck.version} is available with venv support`);
      }

      let hasPoetry = false;
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Checking Poetry installation',
          cancellable: false,
        },
        async (progress) => {
          const { requirementCache } = await import('../utils/requirementCache.js');
          const cacheStats = requirementCache.getStats();
          const poetryCached = cacheStats.poetryCached;
          progress.report({
            increment: 0,
            message: poetryCached ? 'Verifying Poetry (cached)...' : 'Verifying Poetry...',
          });
          logger.info('Checking for Poetry installation...');
          hasPoetry = await isPoetryInstalledCached();
          progress.report({
            increment: 100,
            message: hasPoetry ? 'Poetry found' : 'Poetry not found - checking fallback options...',
          });
        }
      );

      if (hasPoetry) {
        chosenInstallMethod = 'poetry';
        logger.info('Poetry is installed - using poetry install method');
      } else {
        if (isModalFlow) {
          const modalInstallMethod = modalConfig?.installMethod as
            | 'poetry'
            | 'venv'
            | 'pipx'
            | 'auto'
            | undefined;
          if (modalInstallMethod && modalInstallMethod !== 'auto') {
            if (modalInstallMethod === 'poetry') {
              chosenInstallMethod = 'venv';
              logger.warn(
                'Modal requested poetry, but Poetry is not installed - using venv fallback without extra prompt'
              );
            } else {
              chosenInstallMethod = modalInstallMethod;
              logger.info(`Modal install method respected: ${modalInstallMethod}`);
            }
          } else {
            chosenInstallMethod = 'venv';
            logger.info('Modal auto install method with missing Poetry - using venv fallback');
          }
        } else {
          logger.warn('Poetry not installed - offering smart fallback');

          let hasPipx = false;
          try {
            const { execa } = await import('execa');
            await execa('pipx', ['--version'], { timeout: 3000 });
            hasPipx = true;
          } catch {
            try {
              const { execa } = await import('execa');
              await execa('python3', ['-m', 'pipx', '--version'], { timeout: 3000 });
              hasPipx = true;
            } catch {
              hasPipx = false;
            }
          }

          type PickItem = vscode.QuickPickItem & { value: string };

          const choices: PickItem[] = [
            ...(hasPipx
              ? [
                  {
                    label: '$(zap) Auto-install Poetry via pipx',
                    description: 'Recommended - installs Poetry globally then creates workspace',
                    detail: 'Runs: pipx install poetry',
                    value: 'auto-poetry',
                  },
                ]
              : []),
            {
              label: '$(package) Use Python venv instead',
              description: 'No extra tools needed - pip + venv (equivalent functionality)',
              detail: 'Workspace is fully functional without Poetry. You can add it later.',
              value: 'venv',
            },
            {
              label: '$(tools) Open Setup Panel',
              description: 'Guide me through manual Poetry / pipx installation',
              detail: 'Workspace creation will be cancelled. Opens the setup wizard.',
              value: 'setup',
            },
          ];

          const pick = await vscode.window.showQuickPick(choices, {
            placeHolder: 'Poetry is not installed. How would you like to proceed?',
            title: 'Workspace Install Method',
            ignoreFocusOut: true,
          });

          if (!pick) {
            logger.info('User cancelled workspace creation at install method selection');
            return;
          }

          if (pick.value === 'auto-poetry') {
            logger.info('Auto-installing Poetry via pipx...');
            const installCommands =
              process.platform === 'win32'
                ? ['python -m pipx install poetry', 'echo Poetry installed successfully']
                : ['pipx install poetry', 'echo "Poetry installed successfully"'];
            runCommandsInTerminal({
              name: 'Workspai: Install Poetry',
              commands: installCommands,
            });

            const confirm = await vscode.window.showInformationMessage(
              'Installing Poetry via pipx...\n\nWait until the terminal shows "Poetry installed successfully", then click Continue.',
              { modal: true },
              'Continue',
              'Skip - use venv instead'
            );

            if (!confirm || confirm === 'Skip - use venv instead') {
              chosenInstallMethod = 'venv';
              logger.info('User skipped Poetry auto-install - using venv fallback');
            } else {
              const { requirementCache } = await import('../utils/requirementCache.js');
              requirementCache.invalidateAll();
              hasPoetry = await isPoetryInstalledCached();
              chosenInstallMethod = hasPoetry ? 'poetry' : 'venv';
              logger.info(
                hasPoetry
                  ? 'Poetry confirmed after auto-install - using poetry'
                  : 'Poetry still not detected - falling back to venv'
              );
            }
          } else if (pick.value === 'venv') {
            chosenInstallMethod = 'venv';
            logger.info('User selected venv install method');
          } else {
            vscode.commands.executeCommand('workspai.openSetup');
            return;
          }
        }
      }
    }

    // Honour install method explicitly chosen in the wizard (overrides auto-detection)
    if (!config.skipPythonEngine && config.installMethod && config.installMethod !== 'auto') {
      logger.info(`Wizard override: install method -> ${config.installMethod}`);
      chosenInstallMethod = config.installMethod as 'poetry' | 'venv' | 'pipx';
    }

    // Profile-aware Python enforcement: only gate Python-required profiles.
    const selectedProfile = (config.profile || 'minimal') as BootstrapProfile;
    const requiresPython =
      !config.skipPythonEngine && profileInstallsPythonEngineAtCreate(selectedProfile);
    const pythonReady =
      !!pythonCheck?.available && !!pythonCheck?.meetsMinimumVersion && !!pythonCheck?.venvSupport;

    if (requiresPython && !pythonReady) {
      const issueDetails = !pythonCheck?.available
        ? 'Python 3.10+ was not detected on this system.'
        : !pythonCheck?.meetsMinimumVersion
          ? `Python ${pythonCheck?.version ?? 'unknown'} detected, but 3.10+ is required.`
          : pythonCheck?.error || 'Python venv support is missing.';

      // Chat/Create flows must fail before any workspace mutation and return
      // one actionable prerequisite result to their owning controller. A
      // nested modal would desynchronize the chat timeline and make a retry
      // look like a stalled creation.
      if (config.silent) {
        const prerequisite = new Error(
          !pythonCheck?.available
            ? 'Python 3.10+ is required for this workspace profile. Install Python, restart VS Code, and create a fresh plan.'
            : !pythonCheck?.meetsMinimumVersion
              ? `Python ${pythonCheck?.version ?? 'unknown'} is installed, but this workspace profile requires Python 3.10 or newer.`
              : `${issueDetails} Install the Python venv package for this interpreter, then create a fresh plan.`
        ) as Error & { code?: string };
        prerequisite.code = !pythonCheck?.available
          ? 'python-runtime-unavailable'
          : !pythonCheck?.meetsMinimumVersion
            ? 'python-version-unsupported'
            : 'python-venv-unavailable';
        throw prerequisite;
      }

      const choice = await vscode.window.showWarningMessage(
        `⚠️ Profile "${selectedProfile}" typically needs Python tooling.\n\n` +
          `${issueDetails}\n\n` +
          `Continue anyway? Workspai CLI can auto-fallback to a compatible profile if needed.`,
        { modal: true },
        'Continue',
        'Open Setup',
        'Cancel'
      );

      if (choice === 'Open Setup') {
        await vscode.commands.executeCommand('workspai.openSetup');
        return;
      }

      if (choice !== 'Continue') {
        logger.info('User cancelled workspace creation at Python profile confirmation');
        return;
      }

      logger.warn(
        `Proceeding with Python-required profile ${selectedProfile} despite missing prerequisites; npm CLI fallback may adjust profile.`
      );
    }

    const runCreateWorkspace = async (
      progress: Pick<vscode.Progress<{ increment?: number; message?: string }>, 'report'>
    ) => {
      progress.report({
        increment: 0,
        message: 'Initializing... (First time setup may take 30-60 seconds)',
      });

      try {
        const cli = new WorkspaiCLI();

        progress.report({ increment: 10, message: 'Preparing workspace directory...' });

        // The verified CLI runtime owns workspace creation. Only its parent is
        // prepared here so a failed run cannot be mistaken for a workspace.
        const parentDir = path.dirname(config.path);
        await fs.ensureDir(parentDir);
        logger.info('Parent directory ensured:', parentDir);

        // Pre-flight: detect partial/broken workspace (dir exists but no marker).
        // A partial workspace would cause the CLI to fail with "already exists" without
        // creating a valid workspace — give the user a clear choice.
        const dirAlreadyExists = await fs.pathExists(config.path);
        const markerAlreadyExists = hasWorkspaceRootMarkers(config.path);
        if (dirAlreadyExists && !markerAlreadyExists) {
          const choice = await vscode.window.showWarningMessage(
            `⚠️ Directory "${config.name}" already exists but is not a valid Workspai workspace.\n\n` +
              `This may be a partial or failed previous creation.\n\n` +
              `What would you like to do?`,
            { modal: true },
            'Replace (delete & recreate)',
            'Cancel'
          );
          if (choice === 'Replace (delete & recreate)') {
            await fs.remove(config.path);
            logger.info(`Removed partial directory: ${config.path}`);
          } else {
            logger.info('User cancelled workspace creation at partial-dir prompt');
            return;
          }
        }

        const isDefaultLocation = isDefaultWorkspaceCreationPath(config.path, config.name);

        if (isDefaultLocation) {
          // Use the extension's verified Workspai runtime for the default location.
          progress.report({
            increment: 20,
            message: 'Starting verified Workspai runtime...',
          });

          // Idempotency: if the workspace marker already exists (prior run or
          // Windows 'directory already exists' false-positive), skip the CLI
          // call entirely and treat this as a silent success.
          const workspacePreexists = hasWorkspaceRootMarkers(config.path);
          if (workspacePreexists) {
            logger.info(
              `Workspace "${config.name}" already exists — skipping CLI creation (idempotent)`
            );
          }
          const createResult = workspacePreexists
            ? { exitCode: 0, stdout: '', stderr: '' }
            : await cli.createWorkspace({
                name: config.name,
                parentPath: path.dirname(config.path),
                skipGit: !config.initGit,
                installMethod: config.skipPythonEngine ? undefined : chosenInstallMethod,
                skipPythonEngine: config.skipPythonEngine,
                profile: config.profile,
              });

          // Check if creation was successful
          if (createResult.exitCode !== 0) {
            // Log detailed error information
            logDetailedError(
              createResult.stderr || '',
              createResult.stdout || '',
              createResult.exitCode
            );

            // Parse error for user-friendly message
            const parsedError = parseRapidKitError(
              createResult.stderr || '',
              createResult.stdout || ''
            );

            // Chat and AI flows own their recovery UI. Never open a nested
            // modal or synthesize a fallback workspace behind that controller.
            if (config.silent) {
              throw new Error(formatErrorMessage(parsedError));
            }

            if (parsedError.canFallback) {
              logger.warn(`Workspace creation failed: ${parsedError.type}`);

              const actions = ['Run System Check', 'View Details'];
              if (parsedError.canRetry) {
                actions.unshift('Retry');
              }
              actions.push('Cancel');

              const choice = await vscode.window.showWarningMessage(
                `⚠️ ${parsedError.title}\n\n${parsedError.message}\n\n` +
                  'No partial workspace will be accepted as successful.',
                { modal: true },
                ...actions
              );

              if (choice === 'Retry') {
                return createWorkspaceCommand(workspaceName);
              } else if (choice === 'Run System Check') {
                await vscode.commands.executeCommand('workspai.checkSystem');
                return;
              } else if (choice === 'View Details') {
                // Show detailed error in output panel
                const output = vscode.window.createOutputChannel('Workspai Error');
                output.clear();
                output.appendLine(`# ${parsedError.title}\n`);
                output.appendLine(parsedError.message);
                output.appendLine(`\n## Suggestions\n${parsedError.suggestion}`);
                output.appendLine(`\n## Technical Details\n`);
                output.appendLine(`Exit Code: ${createResult.exitCode}`);
                if (createResult.stderr) {
                  output.appendLine(`\nSTDERR:\n${createResult.stderr}`);
                }
                if (createResult.stdout) {
                  output.appendLine(`\nSTDOUT:\n${createResult.stdout}`);
                }
                output.show();
                return;
              } else {
                throw new Error('Workspace creation cancelled');
              }
            } else {
              // Non-recoverable error
              throw new Error(formatErrorMessage(parsedError));
            }
          }
        } else {
          // For custom paths, create directly in the target directory
          // IMPORTANT: Don't create in default location and move - this breaks virtualenv shebangs!
          progress.report({
            increment: 20,
            message: 'Starting verified Workspai runtime...',
          });

          const createResult = await cli.createWorkspace({
            name: config.name,
            parentPath: path.dirname(config.path), // Use actual parent path, not default
            skipGit: !config.initGit,
            installMethod: config.skipPythonEngine ? undefined : chosenInstallMethod,
            skipPythonEngine: config.skipPythonEngine,
            profile: config.profile,
          });

          // Check if creation was successful
          if (createResult.exitCode !== 0) {
            // Idempotency: same pre-flight check for custom paths.
            if (hasWorkspaceRootMarkers(config.path)) {
              logger.info(
                `Workspace "${config.name}" already exists at custom path — idempotent success`
              );
            } else {
              const stderr = createResult.stderr || createResult.stdout || '';
              logger.error('Workspace creation failed', {
                exitCode: createResult.exitCode,
                stderr,
              });

              throw new Error(`Workspace creation failed: ${stderr || 'Unknown error'}`);
            }
          }

          logger.info('Workspace created directly at custom path (no move needed)');
        }

        logger.info('Workspace creation via verified CLI runtime completed');

        progress.report({ increment: 50, message: 'Finalizing workspace...' });

        // Note: We skip detailed validation here because:
        // 1. the verified CLI runtime validates during creation
        // 2. Poetry venvs may not be immediately ready for inspection
        // 3. The marker file existence is sufficient proof of successful creation

        logger.info('Workspace creation successful (validation skipped - npm handles it)');

        progress.report({ increment: 65, message: 'Verifying workspace...' });

        // Verify workspace was created
        const workspaceExists = await fs.pathExists(config.path);
        if (!workspaceExists) {
          throw new Error(`Workspace directory not created at ${config.path}`);
        }

        // Check for workspace marker (.rapidkit directory)
        const rapidkitDir = path.join(config.path, '.rapidkit');
        const rapidkitDirExists = await fs.pathExists(rapidkitDir);

        if (!rapidkitDirExists) {
          logger.warn('Workspace created but .rapidkit directory not found');
        }

        // Apply wizard-specified policy mode and dependency sharing to .rapidkit files
        // using canonical npm/CLI keys:
        // - mode
        // - dependency_sharing_mode
        if (rapidkitDirExists) {
          try {
            const policiesPath = path.join(rapidkitDir, 'policies.yml');
            const effectiveMode = config.policyMode === 'strict' ? 'strict' : 'warn';
            const effectiveDependencySharingMode =
              config.dependencySharing === 'shared' ? 'shared-runtime-caches' : 'isolated';

            if (await fs.pathExists(policiesPath)) {
              let content = await fs.readFile(policiesPath, 'utf-8');

              if (/^\s*mode:\s*(warn|strict)\s*$/m.test(content)) {
                content = content.replace(
                  /^\s*mode:\s*(warn|strict)\s*$/m,
                  `mode: ${effectiveMode}`
                );
              } else {
                content += `\nmode: ${effectiveMode}`;
              }

              if (/^\s*dependency_sharing_mode:\s*[a-zA-Z-]+\s*$/m.test(content)) {
                content = content.replace(
                  /^\s*dependency_sharing_mode:\s*[a-zA-Z-]+\s*$/m,
                  `dependency_sharing_mode: ${effectiveDependencySharingMode}`
                );
              } else {
                content += `\ndependency_sharing_mode: ${effectiveDependencySharingMode}`;
              }

              if (!content.endsWith('\n')) {
                content += '\n';
              }

              await fs.writeFile(policiesPath, content, 'utf-8');
            } else {
              await fs.writeFile(
                policiesPath,
                [
                  'version: "1.0"',
                  `mode: ${effectiveMode}`,
                  `dependency_sharing_mode: ${effectiveDependencySharingMode}`,
                  'rules:',
                  '  enforce_workspace_marker: true',
                  '  enforce_toolchain_lock: false',
                  '  disallow_untrusted_tool_sources: false',
                  '',
                ].join('\n'),
                'utf-8'
              );
            }

            logger.info(
              `Policy settings written: mode=${effectiveMode}, dependency_sharing_mode=${effectiveDependencySharingMode}`
            );
          } catch (writeErr) {
            logger.warn('Could not write extra wizard options to .rapidkit files', writeErr);
            // Non-fatal: workspace is still fully usable
          }
        }

        // Verify workspace marker exists (created by the verified CLI runtime)
        if (!hasWorkspaceRootMarkers(config.path)) {
          throw new Error('Workspace creation completed without canonical workspace markers.');
        } else {
          // Add VS Code metadata to the marker
          const { getExtensionVersion } = await import('../utils/constants.js');
          await updateWorkspaceMetadata(config.path, {
            vscode: {
              extensionVersion: getExtensionVersion(),
              createdViaExtension: true,
              lastOpenedAt: new Date().toISOString(),
              openCount: 1,
            },
          });
          logger.info('Workspace marker verified and VS Code metadata added');
        }

        progress.report({ increment: 80, message: 'Registering workspace...' });

        // Add workspace to manager
        const workspaceManager = WorkspaceManager.getInstance();
        await workspaceManager.addWorkspace(config.path);

        progress.report({ increment: 90, message: 'Refreshing views...' });

        // Wait for file system sync
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Refresh workspace explorer
        await vscode.commands.executeCommand('workspai.refreshWorkspaces');

        progress.report({ increment: 100, message: 'Complete!' });

        // Show success message with appropriate actions.
        const openAction = 'Open Workspace';
        const docsAction = 'View Docs';
        const actions = [openAction, docsAction];
        actions.push('Close');

        const message =
          `✅ Workspace "${config.name}" created successfully!\n\n` +
          `📁 Location: ${config.path}\n` +
          '💡 Tip: Add projects with `workspai create` or use Extension commands';

        const handlePostCreateSelection = async (selected: string | undefined) => {
          if (selected === openAction) {
            const workspaceUri = vscode.Uri.file(config.path);
            await vscode.commands.executeCommand('vscode.openFolder', workspaceUri, {
              forceNewWindow: false,
            });
          } else if (selected === docsAction) {
            await vscode.env.openExternal(vscode.Uri.parse('https://www.workspai.dev/learn'));
          }
        };

        const context = (globalThis as { extensionContext?: vscode.ExtensionContext })
          .extensionContext;
        const setupCompleteShown = context?.globalState.get<boolean>(
          'workspai.firstTimeSetupCompleteShown',
          false
        );

        if (!config.silent && context && !setupCompleteShown) {
          await context.globalState.update('workspai.firstTimeSetupCompleteShown', true);
          void showFirstTimeSetupComplete();
        }

        if (config.silent) {
          // Caller owns progress UX, for example the Workspai chat tab.
        } else if (config.suppressPostCreatePrompt) {
          void vscode.window
            .showInformationMessage(message, ...actions)
            .then((selected) => handlePostCreateSelection(selected));
        } else {
          const selected = await vscode.window.showInformationMessage(message, ...actions);
          await handlePostCreateSelection(selected);
        }

        // Refresh welcome page if it's open and start governance onboarding chain
        if (context) {
          void WelcomePanel.notifyWorkspaceGovernanceChain(
            config.path,
            config.name,
            'create',
            context
          );
        } else {
          WelcomePanel.refreshRecentWorkspaces();
        }
      } catch (error) {
        logger.error('Failed to create workspace', error);

        const errorMessage = error instanceof Error ? error.message : String(error);
        if (config.silent) {
          throw error instanceof Error ? error : new Error(errorMessage);
        }
        const helpAction = 'Get Help';
        const selected = await vscode.window.showErrorMessage(
          `Failed to create workspace: ${errorMessage}`,
          helpAction,
          'Close'
        );

        if (selected === helpAction) {
          await vscode.env.openExternal(
            vscode.Uri.parse('https://www.workspai.dev/learn/workspace-doctor')
          );
        }
      }
    };

    if (config.silent) {
      await runCreateWorkspace({ report: () => undefined });
    } else {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Creating Workspai workspace',
          cancellable: false,
        },
        runCreateWorkspace
      );
    }
  } catch (error) {
    logger.error('Error in createWorkspaceCommand', error);
    if (typeof workspaceName === 'object' && workspaceName?.silent === true) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    vscode.window.showErrorMessage(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
