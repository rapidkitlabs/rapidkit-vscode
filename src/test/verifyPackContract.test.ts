import { describe, expect, it } from 'vitest';

import { buildVerifyPackOutputContract } from '../core/verifyPackContract';

describe('verifyPackContract', () => {
  it('builds a passed contract when all commands pass', () => {
    const contract = buildVerifyPackOutputContract({
      producer: 'sandbox-simulation',
      generatedAt: '2026-05-03T08:00:00.000Z',
      commands: [
        {
          label: 'health: rapidkit doctor',
          command: 'rapidkit',
          args: ['doctor'],
          exitCode: 0,
          durationMs: 120,
        },
        {
          label: 'test: pytest',
          command: 'pytest',
          args: ['-q'],
          exitCode: 0,
          durationMs: 240,
        },
      ],
    });

    expect(contract.overallStatus).toBe('passed');
    expect(contract.summary).toEqual({
      totalCommands: 2,
      passedCommands: 2,
      failedCommands: 0,
      totalDurationMs: 360,
    });
  });

  it('builds a failed contract when any command fails', () => {
    const contract = buildVerifyPackOutputContract({
      producer: 'sandbox-simulation',
      generatedAt: '2026-05-03T08:00:00.000Z',
      commands: [
        {
          label: 'lint: run linter',
          command: 'npm',
          args: ['run', 'lint'],
          exitCode: 1,
          durationMs: 88,
        },
      ],
    });

    expect(contract.overallStatus).toBe('failed');
    expect(contract.summary.failedCommands).toBe(1);
    expect(contract.commands[0]?.status).toBe('failed');
  });

  it('builds a skipped contract when command list is empty', () => {
    const contract = buildVerifyPackOutputContract({
      producer: 'verify-pack-runner',
      generatedAt: '2026-05-03T08:00:00.000Z',
      commands: [],
    });

    expect(contract.overallStatus).toBe('skipped');
    expect(contract.summary.totalCommands).toBe(0);
  });

  it('fails closed when a command record has no executable command text', () => {
    const contract = buildVerifyPackOutputContract({
      producer: 'verify-pack-runner',
      generatedAt: '2026-05-03T08:00:00.000Z',
      commands: [
        {
          label: 'placeholder verify',
          command: '   ',
          args: ['doctor'],
          exitCode: 0,
          durationMs: -50,
        },
      ],
    });

    expect(contract.overallStatus).toBe('failed');
    expect(contract.summary.failedCommands).toBe(1);
    expect(contract.commands[0]).toEqual(
      expect.objectContaining({
        command: '',
        durationMs: 0,
        status: 'failed',
      })
    );
  });
});
