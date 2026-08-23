import * as vscode from 'vscode';

import { runRapidkitCommandsInTerminal } from '../utils/terminalExecutor';
import { gateRapidkitCliArgs } from './rapidkitEnterpriseCliGate';

export type GatedRapidkitTerminalOptions = {
  name: string;
  cwd?: string;
  env?: Record<string, string>;
  commands: string[][];
};

export async function runGatedRapidkitCommandsInTerminal(
  options: GatedRapidkitTerminalOptions
): Promise<boolean> {
  try {
    for (const args of options.commands) {
      const gate = await gateRapidkitCliArgs({
        args,
        cwd: options.cwd,
        featureLabel: options.name,
      });
      if (!gate.allowed) {
        const choice = await vscode.window.showWarningMessage(gate.error, 'Open Setup');
        if (choice === 'Open Setup') {
          await vscode.commands.executeCommand('workspai.openSetup');
        }
        return false;
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const choice = await vscode.window.showErrorMessage(
      `${options.name} is blocked because the active Workspai runtime could not be validated. ${detail}`,
      'Open Setup'
    );
    if (choice === 'Open Setup') {
      await vscode.commands.executeCommand('workspai.openSetup');
    }
    return false;
  }

  runRapidkitCommandsInTerminal(options);
  return true;
}
