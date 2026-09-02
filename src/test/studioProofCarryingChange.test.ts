import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  resolveStudioProofArtifactIdentity,
  studioProofEffectClassesForCommand,
  StudioProofCarryingChangeSession,
} from '../core/studioProofCarryingChange.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

function operation(operationName: string, state = 'executing') {
  return {
    schemaVersion: 'workspai.change-operation-result.v1',
    operation: operationName,
    changeId: 'change-extension01',
    state,
    capsule: {
      schemaVersion: 'workspai.proof-carrying-change-capsule.v1',
      status: state === 'committed' ? 'sealed' : 'open',
      remainingUncertainty: [],
    },
    artifacts: { capsule: '.workspai/changes/change-extension01/capsule.json' },
    nextActions: [],
  };
}

function successfulRun(result: unknown) {
  return {
    exitCode: 0,
    events: [],
    lastLifecycleEvent: null,
    result,
    stdout: JSON.stringify(result),
    stderr: '',
    failed: false,
  };
}

function failedOperationRun(message: string) {
  const result = {
    schemaVersion: 'workspai-cli-operation-result-v1',
    operation: 'change.begin',
    status: 'error',
    exitCode: 1,
    error: { code: 'change.begin.failed', message },
    context: { changeId: null },
  };
  return {
    exitCode: 1,
    events: [],
    lastLifecycleEvent: null,
    result,
    stdout: JSON.stringify(result),
    stderr: JSON.stringify({
      schemaVersion: 'cli-log-event-v1',
      event: 'run.failed',
      message: 'CLI run failed',
    }),
    failed: true,
  };
}

describe('Studio Proof-Carrying Change session', () => {
  it('classifies only declared command effects and keeps read-only commands out of PCC', () => {
    expect(
      studioProofEffectClassesForCommand({
        mutatesSource: false,
        purpose: 'test',
        externalSideEffects: false,
        repositoryMetadataEffects: false,
      })
    ).toEqual([]);
    expect(
      studioProofEffectClassesForCommand({
        mutatesSource: true,
        purpose: 'dependency',
        externalSideEffects: false,
        repositoryMetadataEffects: false,
      })
    ).toEqual(['dependency']);
    expect(
      studioProofEffectClassesForCommand({
        mutatesSource: false,
        purpose: 'build',
        externalSideEffects: true,
        repositoryMetadataEffects: false,
      })
    ).toEqual(['external']);
  });

  it('maps linked-project source through the canonical external project identity', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-pcc-workspace-'));
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-pcc-project-'));
    roots.push(workspace, project);
    await fs.ensureDir(path.join(workspace, '.workspai'));
    await fs.writeJson(path.join(workspace, '.workspai', 'workspace.contract.json'), {
      schemaVersion: 1,
      projects: [
        {
          slug: 'demo',
          relativePath: 'external/demo',
          externalPath: project,
        },
      ],
    });
    await fs.ensureDir(path.join(project, 'src'));
    await fs.writeFile(path.join(project, 'src', 'index.ts'), 'export {}\n');

    await expect(
      resolveStudioProofArtifactIdentity({
        workspacePath: workspace,
        projectPath: project,
        relativePath: 'src/index.ts',
      })
    ).resolves.toEqual({
      artifact: 'external/demo/src/index.ts',
      absolutePath: path.join(project, 'src', 'index.ts'),
    });
  });

  it('begins and authorizes once, then records a hash-bound repair effect', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-pcc-effect-'));
    roots.push(workspace);
    await fs.writeFile(path.join(workspace, 'target.ts'), 'export const value = 2;\n');
    const afterHash = crypto
      .createHash('sha256')
      .update(await fs.readFile(path.join(workspace, 'target.ts')))
      .digest('hex');
    const run = vi
      .fn()
      .mockResolvedValueOnce(
        successfulRun({
          schemaVersion: 'workspai.proof-carrying-change-list.v1',
          changes: [],
        })
      )
      .mockResolvedValueOnce(successfulRun(operation('begin', 'evidence-ready')))
      .mockResolvedValueOnce(successfulRun(operation('authorize', 'authorized')))
      .mockImplementationOnce(async (input: { command: string[] }) => {
        const file = input.command[input.command.indexOf('--file') + 1];
        const receipt = await fs.readJson(file);
        expect(receipt).toMatchObject({
          effectClass: 'filesystem',
          status: 'succeeded',
          artifacts: [
            {
              artifact: 'target.ts',
              digest: { semantics: 'raw-bytes-v1', value: afterHash },
            },
          ],
        });
        return successfulRun(operation('effect-record'));
      });
    const session = new StudioProofCarryingChangeSession({
      workspacePath: workspace,
      goalId: 'goal-extension',
      actorId: 'vscode:test',
      run,
    });

    const result = await session.recordRepairEffect({
      result: {
        transaction: {
          schemaVersion: 'workspai.workspace-repair-transaction.v1',
          transactionId: 'repair-extension',
          state: 'closed',
          target: { cardId: 'test', scope: 'workspace', actionIds: [] },
          checkpoint: { status: 'captured', files: [] },
          stages: [],
          verification: {
            status: 'passed',
            targetStatus: 'passed',
            artifact: '.workspai/reports/workspace-intelligence-run-last-run.json',
            exitCode: 0,
            summary: 'passed',
          },
        },
        changedPaths: ['target.ts'],
        fileChanges: [
          {
            relativePath: 'target.ts',
            status: 'modified',
            beforeHash: null,
            afterHash,
            binary: false,
            stale: false,
            diffLines: [],
          },
        ],
      },
    });

    expect(result.operation).toBe('effect-record');
    expect(run).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ command: ['change', 'list', '--json'] })
    );
    expect(run).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        command: ['change', 'begin', '--goal', 'goal-extension', '--json'],
      })
    );
    expect(run).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        command: expect.arrayContaining([
          'change',
          'authorize',
          '--effects',
          'command,configuration,dependency,external,filesystem',
        ]),
      })
    );
  });

  it('records an explicitly approved external effect in the default PCC capability set', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(
        successfulRun({
          schemaVersion: 'workspai.proof-carrying-change-list.v1',
          changes: [],
        })
      )
      .mockResolvedValueOnce(successfulRun(operation('begin', 'evidence-ready')))
      .mockResolvedValueOnce(successfulRun(operation('authorize', 'authorized')));
    const session = new StudioProofCarryingChangeSession({
      workspacePath: '/workspace',
      goalId: 'goal-extension',
      actorId: 'vscode:test',
      run,
    });

    await expect(session.authorize(['external'])).resolves.toMatchObject({
      operation: 'authorize',
      state: 'authorized',
    });
    expect(run).toHaveBeenLastCalledWith(
      expect.objectContaining({
        command: expect.arrayContaining([
          '--effects',
          'command,configuration,dependency,external,filesystem',
        ]),
      })
    );
  });

  it('still honors an explicitly restricted PCC capability policy', async () => {
    const session = new StudioProofCarryingChangeSession({
      workspacePath: '/workspace',
      goalId: 'goal-extension',
      actorId: 'vscode:test',
      allowedEffects: ['filesystem', 'command'],
      run: vi.fn(),
    });

    await expect(session.authorize(['external'])).rejects.toThrow(
      'no PCC authorization for: external'
    );
  });

  it('surfaces the structured PCC error instead of the generic lifecycle event', async () => {
    const workspacePath = path.join(os.homedir(), '.workspai', 'workspaces', 'private');
    const run = vi
      .fn()
      .mockResolvedValueOnce(
        successfulRun({
          schemaVersion: 'workspai.proof-carrying-change-list.v1',
          changes: [],
        })
      )
      .mockResolvedValueOnce(
        failedOperationRun(
          `A current canonical Model and Graph are required (live-input-mismatch) at ${workspacePath}.`
        )
      );
    const session = new StudioProofCarryingChangeSession({
      workspacePath,
      goalId: 'goal-extension',
      actorId: 'vscode:test',
      run,
    });

    await expect(session.authorize(['dependency'])).rejects.toThrow(
      'A current canonical Model and Graph are required (live-input-mismatch) at $WORKSPACE.'
    );
  });

  it('resumes a blocked durable change only after a fresh human decision', async () => {
    const requestResume = vi.fn().mockResolvedValue({
      approved: true,
      approvedBy: 'vscode:test-human',
      reason: 'Reviewed the blocker and approved continuation.',
    });
    const run = vi
      .fn()
      .mockResolvedValueOnce(
        successfulRun({
          schemaVersion: 'workspai.proof-carrying-change-list.v1',
          changes: [
            {
              changeId: 'change-extension01',
              goalId: 'goal-extension',
              state: 'blocked',
              status: 'blocked',
              valid: true,
            },
          ],
        })
      )
      .mockResolvedValueOnce(successfulRun(operation('resume', 'authorized')));
    const session = new StudioProofCarryingChangeSession({
      workspacePath: '/workspace',
      goalId: 'goal-extension',
      actorId: 'vscode:test',
      requestResume,
      run,
    });

    await expect(session.authorize(['filesystem'])).resolves.toMatchObject({
      operation: 'resume',
      state: 'authorized',
    });
    expect(requestResume).toHaveBeenCalledWith({
      changeId: 'change-extension01',
      state: 'blocked',
    });
    expect(run).toHaveBeenLastCalledWith(
      expect.objectContaining({
        command: [
          'change',
          'resume',
          '--change',
          'change-extension01',
          '--to',
          'authorized',
          '--reason',
          'Reviewed the blocker and approved continuation.',
          '--actor',
          'vscode:test-human',
          '--json',
        ],
      })
    );
  });

  it('records a deletion as a first-class PCC tombstone', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-pcc-delete-'));
    roots.push(workspace);
    const run = vi
      .fn()
      .mockResolvedValueOnce(
        successfulRun({
          schemaVersion: 'workspai.proof-carrying-change-list.v1',
          changes: [],
        })
      )
      .mockResolvedValueOnce(successfulRun(operation('begin', 'evidence-ready')))
      .mockResolvedValueOnce(successfulRun(operation('authorize', 'authorized')))
      .mockImplementationOnce(async (input: { command: string[] }) => {
        const file = input.command[input.command.indexOf('--file') + 1];
        const receipt = await fs.readJson(file);
        expect(receipt.artifacts).toEqual([]);
        expect(receipt.deletedArtifacts).toEqual([
          {
            artifact: 'removed.ts',
            observedAt: receipt.observedAt,
          },
        ]);
        return successfulRun(operation('effect-record'));
      });
    const session = new StudioProofCarryingChangeSession({
      workspacePath: workspace,
      goalId: 'goal-extension',
      actorId: 'vscode:test',
      run,
    });

    await session.recordCommandEffect({
      transactionId: 'command-delete',
      command: ['node', 'delete-generated-file.mjs'],
      changedPaths: ['removed.ts'],
      succeeded: true,
      summary: 'Removed the obsolete generated source.',
    });

    expect(run).toHaveBeenCalledTimes(4);
  });

  it('does not fabricate an effect receipt for a proven rollback', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(
        successfulRun({
          schemaVersion: 'workspai.proof-carrying-change-list.v1',
          changes: [],
        })
      )
      .mockResolvedValueOnce(successfulRun(operation('begin', 'evidence-ready')))
      .mockResolvedValueOnce(successfulRun(operation('authorize', 'authorized')))
      .mockResolvedValueOnce(successfulRun(operation('status', 'authorized')));
    const session = new StudioProofCarryingChangeSession({
      workspacePath: '/workspace',
      goalId: 'goal-extension',
      actorId: 'vscode:test',
      run,
    });

    const result = await session.recordRepairEffect({
      result: {
        transaction: {
          schemaVersion: 'workspai.workspace-repair-transaction.v1',
          transactionId: 'repair-rolled-back',
          state: 'rolled-back',
          target: { cardId: 'test', scope: 'workspace', actionIds: [] },
          checkpoint: { status: 'captured', files: [] },
          stages: [],
          verification: {
            status: 'failed',
            targetStatus: 'failed',
            artifact: '.workspai/reports/workspace-verify-last-run.json',
            exitCode: 1,
            summary: 'failed and restored',
          },
        },
        changedPaths: ['target.ts'],
        fileChanges: [
          {
            relativePath: 'target.ts',
            status: 'modified',
            beforeHash: null,
            afterHash: null,
            binary: false,
            stale: false,
            diffLines: [],
          },
        ],
      },
    });

    expect(result.operation).toBe('status');
    expect(run).toHaveBeenCalledTimes(4);
    expect(run).not.toHaveBeenCalledWith(
      expect.objectContaining({ command: expect.arrayContaining(['effect', 'record']) })
    );
  });

  it('runs strict independent verification only after a change was started', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(
        successfulRun({
          schemaVersion: 'workspai.proof-carrying-change-list.v1',
          changes: [],
        })
      )
      .mockResolvedValueOnce(successfulRun(operation('begin', 'evidence-ready')))
      .mockResolvedValueOnce(successfulRun(operation('authorize', 'authorized')))
      .mockResolvedValueOnce(successfulRun(operation('verify', 'committed')));
    const session = new StudioProofCarryingChangeSession({
      workspacePath: '/workspace',
      goalId: 'goal-extension',
      actorId: 'vscode:test',
      run,
    });

    await expect(session.verifyIfStarted()).resolves.toBeNull();
    await session.authorize(['filesystem']);
    const verified = await session.verifyIfStarted();

    expect(verified?.capsule.status).toBe('sealed');
    expect(run).toHaveBeenLastCalledWith(
      expect.objectContaining({
        command: ['change', 'verify', '--change', 'change-extension01', '--strict', '--json'],
      })
    );
  });
});
