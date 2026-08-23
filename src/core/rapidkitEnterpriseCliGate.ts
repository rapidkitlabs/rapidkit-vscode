import { parseRapidkitInlineCommand } from './incidentInlineCommandRunner';
import { gateCompatibleCliVersion } from './cliVersionGate';
import {
  gateProjectScopedRapidkitCli,
  gateRootRapidkitCli,
  gateTopLevelRapidkitCli,
  gateWorkspaceIntelligenceCli,
  gateWorkspaceSubcommandCli,
  REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS,
} from './rapidkitCliCapabilities';

const WORKSPACE_INTELLIGENCE_SUBCOMMANDS = new Set<string>(
  REQUIRED_WORKSPACE_INTELLIGENCE_SUBCOMMANDS
);

const PROJECT_SCOPED_COMMANDS = new Set([
  'init',
  'dev',
  'start',
  'build',
  'test',
  'lint',
  'format',
]);
const CORE_BACKED_COMMANDS = new Set([
  'add',
  'checkpoint',
  'diff',
  'frameworks',
  'info',
  'license',
  'list',
  'merge',
  'modules',
  'optimize',
  'reconcile',
  'rollback',
  'uninstall',
  'upgrade',
  'version',
]);

function isRapidkitCommand(command: string): boolean {
  return /(?:^|\s)(?:npx\s+(?:--yes\s+)?rapidkit|rapidkit)\b/i.test(command.trim());
}

export type EnterpriseCliGateResult =
  | { allowed: true }
  | {
      allowed: false;
      error: string;
    };

export async function gateIncidentStudioRapidkitCommand(input: {
  command: string;
  cwd: string;
  featureLabel: string;
}): Promise<EnterpriseCliGateResult> {
  const parsed = parseRapidkitInlineCommand(input.command);
  if ('error' in parsed) {
    return {
      allowed: false,
      error: parsed.error,
    };
  }
  if (parsed.rapidkitArgs.length === 0 && parsed.executable) {
    return { allowed: true };
  }

  const versionAllowed = await gateCompatibleCliVersion({
    cwd: input.cwd,
    featureLabel: input.featureLabel,
    presentError: false,
  });
  if (!versionAllowed) {
    return {
      allowed: false,
      error: `${input.featureLabel} is blocked until the active Workspai runtime is compatible.`,
    };
  }

  const [root, subcommand] = parsed.rapidkitArgs;
  if (root === 'workspace' && subcommand) {
    const capabilityAllowed = WORKSPACE_INTELLIGENCE_SUBCOMMANDS.has(subcommand)
      ? await gateWorkspaceIntelligenceCli(input.featureLabel, {
          cwd: input.cwd,
          presentError: false,
        })
      : await gateWorkspaceSubcommandCli(input.featureLabel, subcommand, {
          cwd: input.cwd,
          presentError: false,
        });
    if (!capabilityAllowed) {
      return {
        allowed: false,
        error: `${input.featureLabel} is blocked because the active Workspai runtime does not advertise workspace ${subcommand}.`,
      };
    }
    return { allowed: true };
  }

  if (PROJECT_SCOPED_COMMANDS.has(root)) {
    const capabilityAllowed = await gateProjectScopedRapidkitCli(input.featureLabel, root, {
      cwd: input.cwd,
      presentError: false,
    });
    if (!capabilityAllowed) {
      return {
        allowed: false,
        error: `${input.featureLabel} is blocked because the active Workspai runtime does not advertise project ${root}.`,
      };
    }
    return { allowed: true };
  }

  if (CORE_BACKED_COMMANDS.has(root)) {
    const capabilityAllowed = await gateRootRapidkitCli(input.featureLabel, root, {
      cwd: input.cwd,
      presentError: false,
    });
    if (!capabilityAllowed) {
      return {
        allowed: false,
        error: `${input.featureLabel} is blocked because the active Workspai runtime does not advertise ${root}.`,
      };
    }
    return { allowed: true };
  }

  const capabilityAllowed = await gateTopLevelRapidkitCli(input.featureLabel, root, {
    cwd: input.cwd,
    presentError: false,
  });
  if (!capabilityAllowed) {
    return {
      allowed: false,
      error: `${input.featureLabel} is blocked because the active Workspai runtime does not advertise ${root}.`,
    };
  }

  return { allowed: true };
}

export async function gateRapidkitCliArgs(input: {
  args: readonly string[];
  cwd?: string;
  featureLabel: string;
}): Promise<EnterpriseCliGateResult> {
  const [root, subcommand] = input.args;
  if (!root) {
    return {
      allowed: false,
      error: `${input.featureLabel} is blocked because no Workspai CLI command was provided.`,
    };
  }

  const versionAllowed = await gateCompatibleCliVersion({
    cwd: input.cwd,
    featureLabel: input.featureLabel,
    presentError: false,
  });
  if (!versionAllowed) {
    return {
      allowed: false,
      error: `${input.featureLabel} is blocked until the active Workspai runtime is compatible.`,
    };
  }

  if (root === 'workspace' && subcommand) {
    const capabilityAllowed = WORKSPACE_INTELLIGENCE_SUBCOMMANDS.has(subcommand)
      ? await gateWorkspaceIntelligenceCli(input.featureLabel, {
          cwd: input.cwd,
          presentError: false,
        })
      : await gateWorkspaceSubcommandCli(input.featureLabel, subcommand, {
          cwd: input.cwd,
          presentError: false,
        });
    if (!capabilityAllowed) {
      return {
        allowed: false,
        error: `${input.featureLabel} is blocked because the active Workspai runtime does not advertise workspace ${subcommand}.`,
      };
    }
    return { allowed: true };
  }

  if (PROJECT_SCOPED_COMMANDS.has(root)) {
    const capabilityAllowed = await gateProjectScopedRapidkitCli(input.featureLabel, root, {
      cwd: input.cwd,
      presentError: false,
    });
    if (!capabilityAllowed) {
      return {
        allowed: false,
        error: `${input.featureLabel} is blocked because the active Workspai runtime does not advertise project ${root}.`,
      };
    }
    return { allowed: true };
  }

  if (CORE_BACKED_COMMANDS.has(root)) {
    const capabilityAllowed = await gateRootRapidkitCli(input.featureLabel, root, {
      cwd: input.cwd,
      presentError: false,
    });
    if (!capabilityAllowed) {
      return {
        allowed: false,
        error: `${input.featureLabel} is blocked because the active Workspai runtime does not advertise ${root}.`,
      };
    }
    return { allowed: true };
  }

  const capabilityAllowed = await gateTopLevelRapidkitCli(input.featureLabel, root, {
    cwd: input.cwd,
    presentError: false,
  });
  if (!capabilityAllowed) {
    return {
      allowed: false,
      error: `${input.featureLabel} is blocked because the active Workspai runtime does not advertise ${root}.`,
    };
  }

  return { allowed: true };
}

export async function gateRapidkitCommandsInStudioAction(input: {
  commands: readonly string[];
  cwd: string;
  featureLabel: string;
}): Promise<EnterpriseCliGateResult> {
  for (const command of input.commands) {
    if (!isRapidkitCommand(command)) {
      continue;
    }
    const gate = await gateIncidentStudioRapidkitCommand({
      command,
      cwd: input.cwd,
      featureLabel: input.featureLabel,
    });
    if (!gate.allowed) {
      return gate;
    }
  }

  return { allowed: true };
}
