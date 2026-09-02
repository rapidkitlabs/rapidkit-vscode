import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import fs from 'fs-extra';
import { describe, expect, it, vi } from 'vitest';

import {
  loadWorkspaceOperationsProjection,
  projectStudioActivity,
  WORKSPACE_INTELLIGENCE_BENCHMARK_REPORT_PATH,
} from '../core/workspaceOperationsProjection';

const generatedAt = '2026-08-29T12:00:00.000Z';

function activityBoard() {
  return {
    schemaVersion: 'workspace-activity-board.v1' as const,
    scopeLabel: 'demo',
    generatedAt,
    activeRunCount: 1,
    healthyRunCount: 0,
    warningRunCount: 0,
    failedRunCount: 0,
    selectedRunId: 'run-12345678',
    runs: [
      {
        run: {
          runId: 'run-12345678',
          status: 'running',
          startedAt: generatedAt,
          updatedAt: generatedAt,
          evidenceBindings: [
            {
              kind: 'artifact',
              ref: '.workspai/reports/workspace-model.json',
              role: 'output',
              provenance: 'authoritative',
            },
          ],
        },
        commandLabel: 'workspai workspace intelligence run',
        active: true,
        nodes: [],
        edges: [],
        activeBlockCount: 1,
        warningCount: 0,
        scope: { kind: 'workspace', label: 'demo' },
        locationLabel: 'demo',
      },
    ],
    diagnostics: [],
    global: false,
    scopeCount: 1,
  };
}

function benchmark() {
  return {
    schemaVersion: 'workspace-intelligence-benchmark.v1' as const,
    generatedAt,
    suite: { id: 'agent-core.v1' as const, title: 'Agent core' },
    graph: {
      sourceHash: 'a'.repeat(64),
      entityCount: 100,
      relationCount: 80,
      proofCount: 60,
    },
    retrievalSummary: {
      provenance: 'estimated' as const,
      scenarioCount: 5,
      matchedScenarioCount: 5,
      medianRetrievalEstimatedTokens: 800,
      p95RetrievalEstimatedTokens: 900,
      medianEstimatedReductionPercent: 91.2,
      status: 'passed' as const,
    },
    evaluation: {
      availability: 'unavailable' as const,
      provenance: 'unavailable' as const,
      trustedMeasuredReductionPercent: null,
      claimBoundary: 'Estimated retrieval payload is not measured model savings.',
    },
  };
}

function emptyChangeList() {
  return {
    schemaVersion: 'workspai.proof-carrying-change-list.v1',
    generatedAt,
    workspace: { name: 'demo' },
    changes: [],
    summary: { total: 0, open: 0, blocked: 0, sealed: 0, aborted: 0, invalid: 0 },
  };
}

describe('workspace operations projection', () => {
  it('consumes the CLI-owned Board and the published benchmark artifact', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'workspai-extension-operations-'));
    await fs.outputJson(
      path.join(workspacePath, WORKSPACE_INTELLIGENCE_BENCHMARK_REPORT_PATH),
      benchmark()
    );
    const run = vi.fn(async (options: { command: string[] }) => {
      const result = options.command[0] === 'change' ? emptyChangeList() : activityBoard();
      return {
        exitCode: 0,
        events: [],
        lastLifecycleEvent: null,
        result,
        stdout: JSON.stringify(result),
        stderr: '',
        failed: false,
      };
    });

    const projection = await loadWorkspaceOperationsProjection({ workspacePath, run });

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        command: ['live', '--once', '--projection', 'board', '--json'],
        cwd: workspacePath,
      })
    );
    expect(projection.board?.schemaVersion).toBe('workspace-activity-board.v1');
    expect(projection.board?.runs[0]?.run.evidenceBindings).toMatchObject([
      { kind: 'artifact', ref: '.workspai/reports/workspace-model.json' },
    ]);
    expect(projection.benchmark?.retrievalSummary.medianEstimatedReductionPercent).toBe(91.2);
    expect(projection.changes.summary.total).toBe(0);
    expect(projection.diagnostics).toEqual([]);
  });

  it('rejects malformed Live evidence bindings at the extension trust boundary', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'workspai-extension-operations-'));
    const malformed = activityBoard();
    malformed.runs[0]!.run.evidenceBindings = [
      {
        kind: 'artifact',
        ref: '',
        role: 'output',
        provenance: 'authoritative',
      },
    ];
    const run = vi.fn(async (options: { command: string[] }) => {
      const result = options.command[0] === 'change' ? emptyChangeList() : malformed;
      return {
        exitCode: 0,
        events: [],
        lastLifecycleEvent: null,
        result,
        stdout: JSON.stringify(result),
        stderr: '',
        failed: false,
      };
    });

    const projection = await loadWorkspaceOperationsProjection({ workspacePath, run });

    expect(projection.board).toBeNull();
    expect(projection.diagnostics).toContain(
      'Live activity output does not match the published Board v1 contract.'
    );
  });

  it('fails closed on incompatible Board and benchmark payloads', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'workspai-extension-operations-'));
    await fs.outputJson(path.join(workspacePath, WORKSPACE_INTELLIGENCE_BENCHMARK_REPORT_PATH), {
      schemaVersion: 'future-benchmark.v2',
    });
    const run = vi.fn(async (options: { command: string[] }) => {
      const result =
        options.command[0] === 'change' ? emptyChangeList() : { schemaVersion: 'future-board.v2' };
      return {
        exitCode: 0,
        events: [],
        lastLifecycleEvent: null,
        result,
        stdout: JSON.stringify(result),
        stderr: '',
        failed: false,
      };
    });

    const projection = await loadWorkspaceOperationsProjection({ workspacePath, run });

    expect(projection.board).toBeNull();
    expect(projection.benchmark).toBeNull();
    expect(projection.diagnostics).toEqual([
      'Live activity output does not match the published Board v1 contract.',
      'Benchmark artifact does not match the published v1 contract.',
    ]);
  });

  it('projects every durable Studio tool call into an ordered activity timeline', () => {
    const projection = projectStudioActivity(
      [
        {
          schemaVersion: 'workspai.studio-agent-session.v1',
          id: 'studio-session-1',
          workspacePath: '/workspace',
          projectPath: '/linked/grpc',
          cardId: 'workspaceRun',
          assistantMode: 'agent',
          status: 'failed',
          createdAt: generatedAt,
          updatedAt: '2026-08-29T12:00:03.000Z',
          sequence: 4,
          events: [
            {
              schemaVersion: 'workspai.studio-agent-event.v1',
              id: 'event-1',
              sessionId: 'studio-session-1',
              sequence: 1,
              timestamp: generatedAt,
              type: 'tool.requested',
              toolCallId: 'tool-1',
              data: {
                toolName: 'run-workspace-command',
                input: {
                  executable: 'cmake',
                  args: ['--fresh', '-S', '.', '-B', 'build'],
                },
              },
            },
            {
              schemaVersion: 'workspai.studio-agent-event.v1',
              id: 'event-2',
              sessionId: 'studio-session-1',
              sequence: 2,
              timestamp: generatedAt,
              type: 'tool.started',
              toolCallId: 'tool-1',
              data: { toolName: 'run-workspace-command' },
            },
            {
              schemaVersion: 'workspai.studio-agent-event.v1',
              id: 'event-3',
              sessionId: 'studio-session-1',
              sequence: 3,
              timestamp: '2026-08-29T12:00:01.000Z',
              type: 'tool.failed',
              toolCallId: 'tool-1',
              data: { toolName: 'run-workspace-command', error: 'Still blocked' },
            },
            {
              schemaVersion: 'workspai.studio-agent-event.v1',
              id: 'event-4',
              sessionId: 'studio-session-1',
              sequence: 4,
              timestamp: '2026-08-29T12:00:02.000Z',
              type: 'model.checkpoint',
              data: { summary: 'Choose another causal action.' },
            },
          ],
        },
      ],
      '/workspace',
      new Date('2026-08-29T12:00:04.000Z')
    );

    expect(projection).toMatchObject({
      sessionCount: 1,
      toolCallCount: 1,
      failedToolCallCount: 1,
      sessions: [
        expect.objectContaining({
          cardId: 'workspaceRun',
          modelCheckpointCount: 1,
          stages: [
            expect.objectContaining({
              label: 'cmake --fresh -S . -B build',
              status: 'failed',
              durationMs: 1000,
              detail: 'Still blocked',
            }),
          ],
        }),
      ],
    });
  });

  it('projects revision-bound Graph query results as Studio evidence bindings', () => {
    const graphSourceHash = 'b'.repeat(64);
    const projection = projectStudioActivity(
      [
        {
          schemaVersion: 'workspai.studio-agent-session.v1',
          id: 'studio-session-graph',
          workspacePath: '/workspace',
          cardId: 'agent',
          assistantMode: 'agent',
          status: 'completed',
          createdAt: generatedAt,
          updatedAt: generatedAt,
          sequence: 1,
          events: [
            {
              schemaVersion: 'workspai.studio-agent-event.v1',
              id: 'event-graph',
              sessionId: 'studio-session-graph',
              sequence: 1,
              timestamp: generatedAt,
              type: 'tool.completed',
              toolCallId: 'tool-graph',
              data: {
                toolName: 'query-workspace-graph',
                output: {
                  query: 'authentication owner',
                  result: {
                    schemaVersion: 'workspace-knowledge-search.v1',
                    graphSourceHash,
                    entities: [{ id: 'service:auth' }],
                    relations: [{ id: 'relation:auth-owner' }],
                    proofs: [{ id: 'proof:auth-config' }],
                  },
                },
              },
            },
          ],
        },
      ],
      '/workspace'
    );

    expect(projection.sessions[0]?.stages[0]?.evidenceBindings).toEqual([
      expect.objectContaining({
        kind: 'graph-entity',
        ref: 'service:auth',
        graphSourceHash,
      }),
      expect.objectContaining({
        kind: 'graph-relation',
        ref: 'relation:auth-owner',
        graphSourceHash,
      }),
      expect.objectContaining({ kind: 'proof', ref: 'proof:auth-config', graphSourceHash }),
    ]);
  });

  it('projects governed process telemetry and an automatic rollback into Live', () => {
    const projection = projectStudioActivity(
      [
        {
          schemaVersion: 'workspai.studio-agent-session.v1',
          id: 'studio-process-session',
          workspacePath: '/workspace',
          cardId: 'workspaceRun',
          assistantMode: 'agent',
          status: 'failed',
          createdAt: generatedAt,
          updatedAt: '2026-08-29T12:00:03.000Z',
          sequence: 4,
          events: [
            {
              schemaVersion: 'workspai.studio-agent-event.v1',
              id: 'process-event-1',
              sessionId: 'studio-process-session',
              sequence: 1,
              timestamp: generatedAt,
              type: 'tool.started',
              toolCallId: 'tool-process',
              data: { toolName: 'run-workspace-command' },
            },
            {
              schemaVersion: 'workspai.studio-agent-event.v1',
              id: 'process-event-2',
              sessionId: 'studio-process-session',
              sequence: 2,
              timestamp: '2026-08-29T12:00:01.000Z',
              type: 'tool.progress',
              toolCallId: 'tool-process',
              data: {
                toolName: 'run-workspace-command',
                process: {
                  phase: 'running',
                  processId: 42,
                  elapsedMs: 1000,
                  stdoutBytes: 128,
                  stderrBytes: 0,
                },
              },
            },
            {
              schemaVersion: 'workspai.studio-agent-event.v1',
              id: 'process-event-3',
              sessionId: 'studio-process-session',
              sequence: 3,
              timestamp: '2026-08-29T12:00:02.000Z',
              type: 'tool.failed',
              toolCallId: 'tool-process',
              data: {
                toolName: 'run-workspace-command',
                error: 'Command mutation was rolled back.',
                output: {
                  rollback: {
                    transactionId: 'tx-1',
                    changedPaths: ['src/index.ts'],
                    restoredFingerprint: 'a'.repeat(64),
                    reason: 'unapproved-mutation',
                  },
                },
              },
            },
          ],
        },
      ],
      '/workspace',
      new Date('2026-08-29T12:00:03.000Z')
    );

    expect(projection.sessions[0]?.stages[0]).toMatchObject({
      status: 'rolled-back',
      durationMs: 2000,
      detail: 'Automatic rollback restored 1 source path(s)',
    });
  });

  it('projects an exact command approval boundary as blocked Live activity', () => {
    const projection = projectStudioActivity(
      [
        {
          schemaVersion: 'workspai.studio-agent-session.v1',
          id: 'studio-approval-session',
          workspacePath: '/workspace',
          cardId: 'doctor',
          assistantMode: 'agent',
          status: 'waiting-permission',
          createdAt: generatedAt,
          updatedAt: '2026-08-29T12:00:01.000Z',
          sequence: 2,
          events: [
            {
              schemaVersion: 'workspai.studio-agent-event.v1',
              id: 'approval-event-1',
              sessionId: 'studio-approval-session',
              sequence: 1,
              timestamp: generatedAt,
              type: 'tool.requested',
              toolCallId: 'tool-approval',
              data: {
                toolName: 'run-workspace-command',
                input: { executable: 'npm', args: ['install'], purpose: 'dependency' },
              },
            },
            {
              schemaVersion: 'workspai.studio-agent-event.v1',
              id: 'approval-event-2',
              sessionId: 'studio-approval-session',
              sequence: 2,
              timestamp: '2026-08-29T12:00:01.000Z',
              type: 'tool.approval.requested',
              toolCallId: 'tool-approval',
              data: {
                toolName: 'run-workspace-command',
                displayCommand: 'npm install',
                execution: 'once',
              },
            },
          ],
        },
      ],
      '/workspace',
      new Date('2026-08-29T12:00:02.000Z')
    );

    expect(projection).toMatchObject({
      activeSessionCount: 1,
      sessions: [
        {
          status: 'blocked',
          active: true,
          stages: [
            expect.objectContaining({
              label: 'npm install',
              status: 'blocked',
              detail: 'npm install · exact scoped approval required',
            }),
          ],
        },
      ],
    });
  });
});
