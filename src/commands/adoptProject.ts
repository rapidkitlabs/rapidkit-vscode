import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { getExtensionVersion } from '../utils/constants';
import { WorkspaceUsageTracker } from '../utils/workspaceUsageTracker';
import { detectProjectStackFromSignals } from './importProjectUtils';

type AdoptableProjectType = 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'unknown';

interface AdoptProjectInput {
  projectPath: string;
  projectName?: string;
  projectType?: string;
  workspacePath?: string;
}

function normalizeProjectType(projectType?: string): AdoptableProjectType {
  if (projectType === 'fastapi') {
    return 'fastapi';
  }
  if (projectType === 'nestjs') {
    return 'nestjs';
  }
  if (projectType === 'go') {
    return 'go';
  }
  if (projectType === 'springboot') {
    return 'springboot';
  }
  return 'unknown';
}

function runtimeForType(
  projectType: AdoptableProjectType
): 'python' | 'node' | 'go' | 'java' | 'unknown' {
  if (projectType === 'fastapi') {
    return 'python';
  }
  if (projectType === 'nestjs') {
    return 'node';
  }
  if (projectType === 'go') {
    return 'go';
  }
  if (projectType === 'springboot') {
    return 'java';
  }
  return 'unknown';
}

function kitForType(projectType: AdoptableProjectType): string {
  if (projectType === 'fastapi') {
    return 'fastapi.standard';
  }
  if (projectType === 'nestjs') {
    return 'nestjs.standard';
  }
  if (projectType === 'go') {
    return 'go.standard';
  }
  if (projectType === 'springboot') {
    return 'springboot.standard';
  }
  return 'generic.imported';
}

function engineForRuntime(runtime: 'python' | 'node' | 'go' | 'java' | 'unknown'): string {
  if (runtime === 'python') {
    return 'python';
  }
  if (runtime === 'node') {
    return 'npm';
  }
  if (runtime === 'go') {
    return 'go';
  }
  if (runtime === 'java') {
    return 'maven';
  }
  return 'unknown';
}

function moduleSupportForType(projectType: AdoptableProjectType): boolean {
  return projectType === 'fastapi' || projectType === 'nestjs';
}

function projectTypeLabel(projectType: AdoptableProjectType): string {
  if (projectType === 'fastapi') {
    return 'FastAPI';
  }
  if (projectType === 'nestjs') {
    return 'NestJS';
  }
  if (projectType === 'go') {
    return 'Go';
  }
  if (projectType === 'springboot') {
    return 'Spring Boot';
  }
  return 'Generic';
}

async function resolveWorkspacePath(inputWorkspacePath?: string): Promise<string | undefined> {
  if (inputWorkspacePath && inputWorkspacePath.length > 0) {
    return inputWorkspacePath;
  }

  const selectedWorkspace = (await vscode.commands.executeCommand(
    'workspai.getSelectedWorkspace'
  )) as { path?: string } | null;
  return selectedWorkspace?.path;
}

async function detectProjectType(
  projectPath: string,
  projectTypeHint?: string
): Promise<AdoptableProjectType> {
  const normalizedHint = normalizeProjectType(projectTypeHint);
  if (normalizedHint !== 'unknown') {
    return normalizedHint;
  }

  const packageJsonPath = path.join(projectPath, 'package.json');
  const hasPackageJson = await fs.pathExists(packageJsonPath);

  let hasNestDependency = false;
  if (hasPackageJson) {
    try {
      const packageJson = await fs.readJSON(packageJsonPath);
      hasNestDependency = Boolean(
        packageJson.dependencies?.['@nestjs/core'] || packageJson.devDependencies?.['@nestjs/core']
      );
    } catch {
      hasNestDependency = false;
    }
  }

  const detection = detectProjectStackFromSignals({
    hasPyProject: await fs.pathExists(path.join(projectPath, 'pyproject.toml')),
    hasGoMod: await fs.pathExists(path.join(projectPath, 'go.mod')),
    hasPomXml: await fs.pathExists(path.join(projectPath, 'pom.xml')),
    hasGradle: await fs.pathExists(path.join(projectPath, 'build.gradle')),
    hasGradleKts: await fs.pathExists(path.join(projectPath, 'build.gradle.kts')),
    hasPackageJson,
    hasNestDependency,
  });

  return detection.stack;
}

async function hasManagedMarker(projectPath: string): Promise<boolean> {
  const projectMarkerPath = path.join(projectPath, '.rapidkit', 'project.json');
  const contextMarkerPath = path.join(projectPath, '.rapidkit', 'context.json');
  return (await fs.pathExists(projectMarkerPath)) || (await fs.pathExists(contextMarkerPath));
}

export async function adoptProjectCommand(input: AdoptProjectInput): Promise<boolean> {
  const logger = Logger.getInstance();
  const workspacePath = await resolveWorkspacePath(input.workspacePath);

  if (!input.projectPath) {
    vscode.window.showWarningMessage('Select a project first.');
    return false;
  }

  const projectPath = input.projectPath;
  const projectName = input.projectName ?? path.basename(projectPath);

  try {
    const stat = await fs.stat(projectPath).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      vscode.window.showErrorMessage(`Project path is invalid: ${projectPath}`);
      return false;
    }

    if (await hasManagedMarker(projectPath)) {
      await WorkspaceUsageTracker.getInstance().trackCommandEvent(
        'workspai.convertProjectToManaged',
        workspacePath,
        {
          result: 'already-managed',
          projectName,
          intent: 'explicit-user-confirmation',
        }
      );
      vscode.window.showInformationMessage(
        `Project "${projectName}" is already managed by Workspai.`
      );
      return false;
    }

    const detectedType = await detectProjectType(projectPath, input.projectType);

    if (detectedType !== 'unknown') {
      await WorkspaceUsageTracker.getInstance().trackCommandEvent(
        'workspai.convertProjectToManaged',
        workspacePath,
        {
          result: 'skipped-non-generic',
          projectName,
          detectedType,
          intent: 'explicit-user-confirmation',
        }
      );

      vscode.window.showInformationMessage(
        `Project "${projectName}" is ${projectTypeLabel(detectedType)} and does not require generic adoption.`
      );
      return false;
    }

    const runtime = runtimeForType(detectedType);
    const kitName = kitForType(detectedType);

    const choice = await vscode.window.showWarningMessage(
      `Convert generic project "${projectName}" to managed Workspai format?\n\n` +
        `Detected type: ${projectTypeLabel(detectedType)}\n` +
        `This will create:\n` +
        `• .rapidkit/project.json\n` +
        `• .rapidkit/context.json`,
      { modal: true },
      'Convert',
      'Cancel'
    );

    if (choice !== 'Convert') {
      await WorkspaceUsageTracker.getInstance().trackCommandEvent(
        'workspai.convertProjectToManaged',
        workspacePath,
        {
          result: 'cancelled',
          projectName,
          detectedType,
          intent: 'explicit-user-confirmation',
        }
      );
      return false;
    }

    const adoptedAt = new Date().toISOString();

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Converting ${projectName} to managed Workspai project...`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 30, message: 'Preparing project markers...' });

        const rapidkitDir = path.join(projectPath, '.rapidkit');
        const projectJsonPath = path.join(rapidkitDir, 'project.json');
        const contextJsonPath = path.join(rapidkitDir, 'context.json');

        await fs.ensureDir(rapidkitDir);

        progress.report({ increment: 40, message: 'Writing project signature...' });
        await fs.writeJSON(
          projectJsonPath,
          {
            name: projectName,
            kit_name: kitName,
            runtime,
            module_support: moduleSupportForType(detectedType),
            managed_by: 'rapidkit-vscode',
            managed_version: getExtensionVersion(),
            managed_at: adoptedAt,
          },
          { spaces: 2 }
        );

        progress.report({ increment: 20, message: 'Writing project context...' });
        await fs.writeJSON(
          contextJsonPath,
          {
            engine: engineForRuntime(runtime),
            adopted_via: 'workspai.convertProjectToManaged',
            adopted_at: adoptedAt,
          },
          { spaces: 2 }
        );

        progress.report({ increment: 10, message: 'Refreshing project tree...' });
        await vscode.commands.executeCommand('workspai.refreshProjects');
      }
    );

    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.convertProjectToManaged',
      workspacePath,
      {
        result: 'success',
        projectName,
        detectedType,
        runtime,
        kitName,
        intent: 'explicit-user-confirmation',
      }
    );

    vscode.window.showInformationMessage(
      `Project "${projectName}" converted to managed Workspai format.`
    );

    logger.info('Project converted to managed format', {
      projectPath,
      projectName,
      detectedType,
      runtime,
      kitName,
    });

    return true;
  } catch (error) {
    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.convertProjectToManaged',
      workspacePath,
      {
        result: 'failed',
        projectName,
        intent: 'explicit-user-confirmation',
      }
    );

    logger.error('Failed to convert project to managed format', error);
    vscode.window.showErrorMessage(
      `Failed to convert project: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}
