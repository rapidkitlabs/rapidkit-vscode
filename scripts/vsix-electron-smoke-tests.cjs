const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const vscode = require('vscode');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommand(command, args) {
  try {
    await vscode.commands.executeCommand(command, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${command} failed during VSIX Electron smoke: ${message}`);
  }
}

exports.run = async function run() {
  const extensionId = process.env.WORKSPAI_SMOKE_EXTENSION_ID || 'rapidkit.rapidkit-vscode';
  const extension = vscode.extensions.getExtension(extensionId);
  assert.ok(extension, `Expected packaged extension to be discoverable: ${extensionId}`);

  await extension.activate();
  assert.equal(extension.isActive, true, `Expected packaged extension to activate: ${extensionId}`);

  const runtimeRoot = path.join(extension.extensionPath, 'dist', 'workspai-runtime');
  const runtimeManifest = JSON.parse(
    fs.readFileSync(path.join(runtimeRoot, 'manifest.json'), 'utf8')
  );
  const runtimeEntry = path.join(runtimeRoot, runtimeManifest.entry);
  const runtimeProbe = spawnSync(process.execPath, [runtimeEntry, 'commands', '--json'], {
    cwd: extension.extensionPath,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      WORKSPAI_EXTENSION_RUNTIME: '1',
    },
  });
  assert.equal(
    runtimeProbe.status,
    0,
    `Expected embedded CLI to run under Electron: ${runtimeProbe.stderr || runtimeProbe.error?.message || 'unknown failure'}`
  );
  const runtimeCapabilities = JSON.parse(runtimeProbe.stdout);
  const doctorCapability = runtimeCapabilities.commandMap?.doctor;
  assert.ok(
    doctorCapability === true ||
      (doctorCapability?.command === 'doctor' && doctorCapability?.status === 'supported'),
    'Expected embedded CLI to advertise the Doctor capability under Electron.'
  );
  const terminalTemplateBin = path.join(runtimeRoot, runtimeManifest.terminal.bin);
  const terminalSmokeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-vsix-terminal-smoke-'));
  for (const launcherName of ['workspai', 'workspai.cmd']) {
    fs.copyFileSync(
      path.join(terminalTemplateBin, launcherName),
      path.join(terminalSmokeBin, launcherName)
    );
  }
  if (process.platform !== 'win32') {
    fs.chmodSync(path.join(terminalSmokeBin, 'workspai'), 0o700);
  }
  const terminalLauncher = path.join(
    terminalSmokeBin,
    process.platform === 'win32' ? 'workspai.cmd' : runtimeManifest.terminal.command
  );
  const terminalProbe = spawnSync(terminalLauncher, ['--version'], {
    cwd: extension.extensionPath,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 30_000,
    env: {
      ...process.env,
      WORKSPAI_EXTENSION_CLI_ENTRY: runtimeEntry,
      WORKSPAI_EXTENSION_NODE: process.execPath,
    },
  });
  fs.rmSync(terminalSmokeBin, { recursive: true, force: true });
  assert.equal(
    terminalProbe.status,
    0,
    `Expected terminal-scoped Workspai launcher to run under Electron: ${terminalProbe.stderr || terminalProbe.error?.message || 'unknown failure'}`
  );
  assert.ok(
    terminalProbe.stdout.includes(runtimeManifest.cli.version),
    'Expected terminal-scoped Workspai launcher to use the embedded CLI version.'
  );

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    'workspai.openDashboardSection',
    'workspai.openIncidentStudio',
    'workspai.workspaceModel',
    'workspai.workspaceExplain',
    'workspai.workspaceWhy',
    'workspai.workspaceTrace',
  ]) {
    assert.ok(commands.includes(command), `Expected packaged command to be registered: ${command}`);
  }

  await runCommand('workspai.openDashboardSection', {
    section: 'overview',
    source: 'vsix-electron-smoke',
    trigger: 'open-dashboard-overview',
  });
  await wait(500);

  await runCommand('workspai.openDashboardSection', {
    section: 'repair',
    source: 'vsix-electron-smoke',
    trigger: 'open-dashboard-repair',
  });
  await wait(500);

  await runCommand('workspai.openDashboardSection', {
    section: 'operate',
    operateZone: 'intelligence',
    source: 'vsix-electron-smoke',
    trigger: 'open-dashboard-intelligence',
  });
  await wait(700);

  await runCommand('workspai.openDashboardSection', {
    section: 'evidence',
    source: 'vsix-electron-smoke',
    trigger: 'open-dashboard-artifacts',
  });
  await wait(500);

  await runCommand('workspai.openIncidentStudio', {
    initialQuery: 'VSIX Electron smoke: verify Studio can open without runtime crash.',
    source: 'vsix-electron-smoke',
    trigger: 'open-studio',
  });
  await wait(500);
};
