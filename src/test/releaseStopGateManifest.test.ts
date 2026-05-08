import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('releaseStopGate manifest mode', () => {
  it('passes the Wave 3 manifest with enforced claim checklist and marker fixture', () => {
    const output = execFileSync(
      process.execPath,
      [
        'scripts/release-stop-gate.mjs',
        '--skip-contract-checks',
        '--manifest',
        'releases/wave3-foundation-gate.json',
        '--claim-checklist',
        'releases/wave3-claim-checklist.md',
        '--enforce-claim-checklist',
        '--marker',
        'releases/fixtures/wave3-kpi-marker.json',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        env: {
          ...process.env,
          WORKSPAI_GATE_MARKER_MAX_AGE_HOURS: '0',
        },
      }
    );

    expect(output).toContain('Manifest checks passed: WAVE3_FOUNDATION_GATE');
    expect(output).toContain('Claim checklist gates are fully checked.');
    expect(output).toContain('KPI gate result:');
    expect(output).toContain('All release stop conditions passed.');
  });

  it('passes the Wave 2 manifest when required artifacts exist', () => {
    const output = execFileSync(
      process.execPath,
      [
        'scripts/release-stop-gate.mjs',
        '--skip-contract-checks',
        '--manifest',
        'releases/wave2-foundation-gate.json',
        '--marker',
        'releases/fixtures/wave2-kpi-marker.json',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        env: {
          ...process.env,
          WORKSPAI_GATE_MARKER_MAX_AGE_HOURS: '0',
        },
      }
    );

    expect(output).toContain('Manifest checks passed: WAVE2_FOUNDATION_GATE');
    expect(output).toContain('KPI gate result:');
    expect(output).toContain('"prevented_incident_rate"');
    expect(output).toContain('"predictive_precision"');
    expect(output).toContain('"false_alarm_rate"');
    expect(output).toContain('"reproPackShareRate"');
    expect(output).toContain('"replayToResolutionRate"');
    expect(output).toContain('"verifyAutoRollbackSuccessRate"');
    expect(output).toContain('"falseConfidenceRate"');
    expect(output).toContain('All release stop conditions passed.');
  });

  it('fails when a manifest requires missing artifacts', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-gate-'));
    const manifestPath = path.join(tempDir, 'missing-artifacts.json');

    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          name: 'BROKEN_GATE',
          requiredFiles: ['docs/DOES_NOT_EXIST.md'],
        },
        null,
        2
      ),
      'utf-8'
    );

    try {
      execFileSync(
        process.execPath,
        [
          'scripts/release-stop-gate.mjs',
          '--skip-kpi',
          '--skip-contract-checks',
          '--manifest',
          manifestPath,
        ],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      throw new Error('Expected release gate to fail for missing artifacts.');
    } catch (error) {
      const failure = error as { status?: number; stderr?: string | Buffer };
      const stderr = String(failure.stderr || '');

      expect(failure.status).toBe(1);
      expect(stderr).toContain('Manifest validation failed');
      expect(stderr).toContain('docs/DOES_NOT_EXIST.md');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('activates production calibration tightening when evidence windows are sufficient', () => {
    const output = execFileSync(
      process.execPath,
      [
        'scripts/release-stop-gate.mjs',
        '--skip-contract-checks',
        '--manifest',
        'releases/wave2-foundation-gate.json',
        '--marker',
        'releases/fixtures/wave2-kpi-marker.json',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        env: {
          ...process.env,
          WORKSPAI_GATE_MARKER_MAX_AGE_HOURS: '0',
          WORKSPAI_GATE_PREDICTIVE_CALIBRATION_MODE: 'production',
          WORKSPAI_GATE_PROD_WINDOWS: '3',
          WORKSPAI_GATE_PROD_WINDOWS_MIN: '3',
          WORKSPAI_GATE_PREDICTION_SHOWN_MIN_FOR_TIGHTENING: '10',
          WORKSPAI_GATE_PREDICTION_OUTCOMES_MIN_FOR_TIGHTENING: '7',
          WORKSPAI_GATE_PREDICTIVE_PRECISION_TIGHTENED_MIN: '70',
          WORKSPAI_GATE_FALSE_ALARM_RATE_TIGHTENED_MAX: '30',
          WORKSPAI_GATE_PREVENTED_INCIDENT_RATE_TIGHTENED_MIN: '30',
        },
      }
    );

    expect(output).toContain('"predictiveCalibration"');
    expect(output).toContain('"tightenedActive": true');
    expect(output).toContain('"predictivePrecisionMin": 70');
    expect(output).toContain('"falseAlarmRateMax": 30');
    expect(output).toContain('"preventedIncidentRateMin": 30');
    expect(output).toContain('All release stop conditions passed.');
  });

  it('keeps production calibration tightening disabled when production evidence is insufficient', () => {
    const output = execFileSync(
      process.execPath,
      [
        'scripts/release-stop-gate.mjs',
        '--skip-contract-checks',
        '--manifest',
        'releases/wave2-foundation-gate.json',
        '--marker',
        'releases/fixtures/wave2-kpi-marker.json',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        env: {
          ...process.env,
          WORKSPAI_GATE_MARKER_MAX_AGE_HOURS: '0',
          WORKSPAI_GATE_PREDICTIVE_CALIBRATION_MODE: 'production',
          WORKSPAI_GATE_PROD_WINDOWS: '3',
          WORKSPAI_GATE_PROD_WINDOWS_MIN: '3',
          WORKSPAI_GATE_PREDICTION_SHOWN_MIN_FOR_TIGHTENING: '999',
          WORKSPAI_GATE_PREDICTION_OUTCOMES_MIN_FOR_TIGHTENING: '999',
          WORKSPAI_GATE_PREDICTIVE_PRECISION_TIGHTENED_MIN: '70',
          WORKSPAI_GATE_FALSE_ALARM_RATE_TIGHTENED_MAX: '30',
          WORKSPAI_GATE_PREVENTED_INCIDENT_RATE_TIGHTENED_MIN: '30',
        },
      }
    );

    expect(output).toContain('"predictiveCalibration"');
    expect(output).toContain('"tightenedActive": false');
    expect(output).toContain('"canTightenByWindows": true');
    expect(output).toContain('"canTightenByEvidence": false');
    expect(output).toContain('"predictivePrecisionMin": 65');
    expect(output).toContain('"falseAlarmRateMax": 35');
    expect(output).toContain('"preventedIncidentRateMin": 20');
    expect(output).toContain('All release stop conditions passed.');
  });

  it('accepts GO release readiness commander artifact', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-rrc-go-'));
    const artifactPath = path.join(tempDir, 'release-readiness-go.json');

    fs.writeFileSync(
      artifactPath,
      JSON.stringify(
        {
          release_readiness_commander: {
            schemaVersion: 'v1',
            artifactId: 'rrc-go-001',
            generatedAt: '2026-05-03T12:00:00.000Z',
            workspacePath: '/tmp/workspace',
            actionId: 'action-rrc-go',
            decision: 'go',
            confidence: 88,
            blockingReasons: [],
            evidence: {
              verifyPackContractStatus: 'passed',
              sandboxStatus: 'passed',
              doctorErrors: 0,
              doctorWarnings: 1,
              scopeKnown: true,
              verifyPathPresent: true,
              rollbackPathPresent: true,
            },
            summary: {
              goNoGoRationale: 'All checks passed.',
              recommendedNextStep: 'Proceed with release.',
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    try {
      const output = execFileSync(
        process.execPath,
        [
          'scripts/release-stop-gate.mjs',
          '--skip-kpi',
          '--skip-contract-checks',
          '--release-readiness-commander',
          artifactPath,
        ],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
        }
      );

      expect(output).toContain('Release readiness commander result');
      expect(output).toContain('decision');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('blocks NO-GO release readiness commander artifact', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-rrc-no-go-'));
    const artifactPath = path.join(tempDir, 'release-readiness-no-go.json');

    fs.writeFileSync(
      artifactPath,
      JSON.stringify(
        {
          release_readiness_commander: {
            schemaVersion: 'v1',
            artifactId: 'rrc-no-go-001',
            generatedAt: '2026-05-03T12:00:00.000Z',
            workspacePath: '/tmp/workspace',
            actionId: 'action-rrc-no-go',
            decision: 'no-go',
            confidence: 52,
            blockingReasons: ['verify path missing'],
            evidence: {
              verifyPackContractStatus: 'failed',
              sandboxStatus: 'failed',
              doctorErrors: 2,
              doctorWarnings: 1,
              scopeKnown: false,
              verifyPathPresent: false,
              rollbackPathPresent: true,
            },
            summary: {
              goNoGoRationale: 'Blocking issues found.',
              recommendedNextStep: 'Fix blockers and re-run.',
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    try {
      execFileSync(
        process.execPath,
        [
          'scripts/release-stop-gate.mjs',
          '--skip-kpi',
          '--skip-contract-checks',
          '--release-readiness-commander',
          artifactPath,
        ],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      throw new Error('Expected release gate to block on NO-GO commander artifact.');
    } catch (error) {
      const failure = error as { status?: number; stderr?: string | Buffer };
      const stderr = String(failure.stderr || '');
      expect(failure.status).toBe(1);
      expect(stderr).toContain('Release blocked: Release readiness commander decision is NO-GO.');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('blocks GO release readiness commander artifact when scope/verify/rollback gates fail', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-rrc-go-invalid-'));
    const artifactPath = path.join(tempDir, 'release-readiness-go-invalid.json');

    fs.writeFileSync(
      artifactPath,
      JSON.stringify(
        {
          release_readiness_commander: {
            schemaVersion: 'v1',
            artifactId: 'rrc-go-invalid-001',
            generatedAt: '2026-05-05T08:00:00.000Z',
            workspacePath: '/tmp/workspace',
            actionId: 'action-rrc-go-invalid',
            decision: 'go',
            confidence: 78,
            blockingReasons: ['verify path missing'],
            evidence: {
              verifyPackContractStatus: 'passed',
              sandboxStatus: 'passed',
              doctorErrors: 0,
              doctorWarnings: 0,
              scopeKnown: true,
              verifyPathPresent: false,
              rollbackPathPresent: true,
            },
            summary: {
              goNoGoRationale: 'Looks mostly safe.',
              recommendedNextStep: 'Ship now.',
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    try {
      execFileSync(
        process.execPath,
        [
          'scripts/release-stop-gate.mjs',
          '--skip-kpi',
          '--skip-contract-checks',
          '--release-readiness-commander',
          artifactPath,
        ],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      throw new Error('Expected release gate to block GO artifact with failed mandatory gates.');
    } catch (error) {
      const failure = error as { status?: number; stderr?: string | Buffer };
      const stderr = String(failure.stderr || '');
      expect(failure.status).toBe(1);
      expect(stderr).toContain('failed mandatory release gates');
      expect(stderr).toContain('verifyPathPresent=false');
      expect(stderr).toContain('blockingReasons_present');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('blocks KPI gate when verify-pack readiness threshold is enabled and not met', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-verify-pack-threshold-'));
    const markerPath = path.join(tempDir, 'wave3-kpi-marker-readiness-low.json');
    const baseMarkerPath = path.join(repoRoot, 'releases', 'fixtures', 'wave3-kpi-marker.json');
    const marker = JSON.parse(fs.readFileSync(baseMarkerPath, 'utf-8'));
    const telemetry = marker?.metadata?.custom?.workspaiTelemetry;
    const recentEvents = Array.isArray(telemetry?.recentEvents) ? telemetry.recentEvents : [];

    telemetry.recentEvents = [
      ...recentEvents,
      {
        command: 'workspai.studio.verify_pack_autopilot_generated',
        at: '2026-04-28T11:00:00.000Z',
      },
      {
        command: 'workspai.studio.verify_pack_autopilot_generated',
        at: '2026-04-28T11:00:01.000Z',
      },
      {
        command: 'workspai.studio.verify_pack_autopilot_generated',
        at: '2026-04-28T11:00:02.000Z',
      },
      {
        command: 'workspai.studio.verify_pack_autopilot_generated',
        at: '2026-04-28T11:00:03.000Z',
      },
      {
        command: 'workspai.studio.verify_pack_autopilot_ready',
        at: '2026-04-28T11:00:04.000Z',
      },
    ];

    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');

    try {
      execFileSync(
        process.execPath,
        [
          'scripts/release-stop-gate.mjs',
          '--skip-contract-checks',
          '--marker',
          markerPath,
          '--verify-pack-readiness-min',
          '80',
        ],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      throw new Error('Expected KPI gate to fail when verify-pack readiness threshold is unmet.');
    } catch (error) {
      const failure = error as {
        status?: number;
        stderr?: string | Buffer;
        stdout?: string | Buffer;
      };
      const stderr = String(failure.stderr || '');
      const stdout = String(failure.stdout || '');

      expect(failure.status).toBe(1);
      expect(stderr).toContain('Release blocked: KPI hard-gate failed.');
      expect(stdout).toContain('"verifyPackAutopilotReadinessRate"');
      expect(stdout).toContain('"verifyPackAutopilotReadinessRatePass": false');
      expect(stdout).toContain('"verifyPackAutopilotReadinessRateMin": 80');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps KPI pass in warn mode even when verify-pack readiness threshold is unmet', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-verify-pack-warn-mode-'));
    const markerPath = path.join(tempDir, 'wave3-kpi-marker-readiness-warn.json');
    const baseMarkerPath = path.join(repoRoot, 'releases', 'fixtures', 'wave3-kpi-marker.json');
    const marker = JSON.parse(fs.readFileSync(baseMarkerPath, 'utf-8'));
    const telemetry = marker?.metadata?.custom?.workspaiTelemetry;
    const recentEvents = Array.isArray(telemetry?.recentEvents) ? telemetry.recentEvents : [];

    telemetry.recentEvents = [
      ...recentEvents,
      {
        command: 'workspai.studio.verify_pack_autopilot_generated',
        at: '2026-04-28T11:10:00.000Z',
      },
      {
        command: 'workspai.studio.verify_pack_autopilot_generated',
        at: '2026-04-28T11:10:01.000Z',
      },
      {
        command: 'workspai.studio.verify_pack_autopilot_generated',
        at: '2026-04-28T11:10:02.000Z',
      },
      {
        command: 'workspai.studio.verify_pack_autopilot_generated',
        at: '2026-04-28T11:10:03.000Z',
      },
      {
        command: 'workspai.studio.verify_pack_autopilot_ready',
        at: '2026-04-28T11:10:04.000Z',
      },
    ];

    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');

    try {
      const output = execFileSync(
        process.execPath,
        [
          'scripts/release-stop-gate.mjs',
          '--skip-contract-checks',
          '--marker',
          markerPath,
          '--verify-pack-readiness-min',
          '80',
          '--verify-pack-readiness-mode',
          'warn',
        ],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      expect(output).toContain('"verifyPackAutopilotReadinessRatePass": true');
      expect(output).toContain('"mode": "warn"');
      expect(output).toContain('"wouldPass": false');
      expect(output).toContain('"enforced": false');
      expect(output).toContain('All release stop conditions passed.');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('enforces auto mode when verify-pack evidence volume reaches threshold', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-verify-pack-auto-mode-'));
    const markerPath = path.join(tempDir, 'wave3-kpi-marker-readiness-auto.json');
    const baseMarkerPath = path.join(repoRoot, 'releases', 'fixtures', 'wave3-kpi-marker.json');
    const marker = JSON.parse(fs.readFileSync(baseMarkerPath, 'utf-8'));
    const telemetry = marker?.metadata?.custom?.workspaiTelemetry;
    const recentEvents = Array.isArray(telemetry?.recentEvents) ? telemetry.recentEvents : [];

    const generatedEvents = Array.from({ length: 10 }, (_, index) => ({
      command: 'workspai.studio.verify_pack_autopilot_generated',
      at: `2026-04-28T11:20:${String(index).padStart(2, '0')}.000Z`,
    }));
    const readyEvents = Array.from({ length: 5 }, (_, index) => ({
      command: 'workspai.studio.verify_pack_autopilot_ready',
      at: `2026-04-28T11:21:${String(index).padStart(2, '0')}.000Z`,
    }));

    telemetry.recentEvents = [...recentEvents, ...generatedEvents, ...readyEvents];
    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');

    try {
      execFileSync(
        process.execPath,
        [
          'scripts/release-stop-gate.mjs',
          '--skip-contract-checks',
          '--marker',
          markerPath,
          '--verify-pack-readiness-min',
          '80',
          '--verify-pack-readiness-mode',
          'auto',
          '--verify-pack-generated-min',
          '10',
        ],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      throw new Error(
        'Expected KPI gate to fail when auto mode becomes enforced and readiness is below threshold.'
      );
    } catch (error) {
      const failure = error as {
        status?: number;
        stderr?: string | Buffer;
        stdout?: string | Buffer;
      };
      const stderr = String(failure.stderr || '');
      const stdout = String(failure.stdout || '');

      expect(failure.status).toBe(1);
      expect(stderr).toContain('Release blocked: KPI hard-gate failed.');
      expect(stdout).toContain('"mode": "auto"');
      expect(stdout).toContain('"evidenceEnoughForEnforcement": true');
      expect(stdout).toContain('"enforced": true');
      expect(stdout).toContain('"verifyPackAutopilotReadinessRatePass": false');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reports release-readiness validation KPIs when artifact outcomes are recorded', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-release-readiness-kpi-'));
    const markerPath = path.join(tempDir, 'wave3-kpi-marker-release-readiness.json');
    const baseMarkerPath = path.join(repoRoot, 'releases', 'fixtures', 'wave3-kpi-marker.json');
    const marker = JSON.parse(fs.readFileSync(baseMarkerPath, 'utf-8'));
    const telemetry = marker?.metadata?.custom?.workspaiTelemetry;
    const recentEvents = Array.isArray(telemetry?.recentEvents) ? telemetry.recentEvents : [];

    telemetry.recentEvents = [
      ...recentEvents,
      {
        command: 'workspai.studio.release_readiness_artifact_exported',
        at: '2026-05-04T11:00:00.000Z',
        props: { artifactId: 'artifact-go-1', decision: 'go' },
      },
      {
        command: 'workspai.studio.release_readiness_go_decision_exported',
        at: '2026-05-04T11:00:01.000Z',
        props: { artifactId: 'artifact-go-1', decision: 'go' },
      },
      {
        command: 'workspai.studio.release_readiness_decision_validated',
        at: '2026-05-04T11:05:00.000Z',
        props: {
          artifactId: 'artifact-go-1',
          originalDecision: 'GO',
          validationOutcome: 'go-confirmed',
        },
      },
      {
        command: 'workspai.studio.release_readiness_decision_correct',
        at: '2026-05-04T11:05:01.000Z',
        props: {
          artifactId: 'artifact-go-1',
          originalDecision: 'GO',
          validationOutcome: 'go-confirmed',
        },
      },
      {
        command: 'workspai.studio.release_readiness_artifact_exported',
        at: '2026-05-04T11:06:00.000Z',
        props: { artifactId: 'artifact-no-go-1', decision: 'no-go' },
      },
      {
        command: 'workspai.studio.release_readiness_no_go_decision_exported',
        at: '2026-05-04T11:06:01.000Z',
        props: { artifactId: 'artifact-no-go-1', decision: 'no-go' },
      },
      {
        command: 'workspai.studio.release_readiness_decision_validated',
        at: '2026-05-04T11:10:00.000Z',
        props: {
          artifactId: 'artifact-no-go-1',
          originalDecision: 'NO-GO',
          validationOutcome: 'no-go-prevented-incident',
        },
      },
      {
        command: 'workspai.studio.release_readiness_decision_correct',
        at: '2026-05-04T11:10:01.000Z',
        props: {
          artifactId: 'artifact-no-go-1',
          originalDecision: 'NO-GO',
          validationOutcome: 'no-go-prevented-incident',
        },
      },
      {
        command: 'workspai.studio.release_readiness_no_go_decision_validated',
        at: '2026-05-04T11:10:02.000Z',
        props: {
          artifactId: 'artifact-no-go-1',
          originalDecision: 'NO-GO',
          validationOutcome: 'no-go-prevented-incident',
        },
      },
      {
        command: 'workspai.studio.release_readiness_no_go_prevented_incident',
        at: '2026-05-04T11:10:03.000Z',
        props: {
          artifactId: 'artifact-no-go-1',
          originalDecision: 'NO-GO',
          validationOutcome: 'no-go-prevented-incident',
        },
      },
    ];
    fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');

    try {
      const output = execFileSync(
        process.execPath,
        ['scripts/release-stop-gate.mjs', '--skip-contract-checks', '--marker', markerPath],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      expect(output).toContain('"releaseReadinessDecisionAccuracy": 100');
      expect(output).toContain('"noGoPreventedIncidentRate": 100');
      expect(output).toContain('"releaseReadinessDecisionAccuracyAvailable": true');
      expect(output).toContain('"noGoPreventedIncidentRateAvailable": true');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('blocks KPI gate in enforce mode when release-readiness validation evidence is insufficient', () => {
    try {
      execFileSync(
        process.execPath,
        [
          'scripts/release-stop-gate.mjs',
          '--skip-contract-checks',
          '--marker',
          'releases/fixtures/wave3-kpi-marker.json',
          '--release-readiness-validation-mode',
          'enforce',
        ],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      throw new Error('Expected KPI gate to fail when release-readiness validation is enforced.');
    } catch (error) {
      const failure = error as {
        status?: number;
        stderr?: string | Buffer;
        stdout?: string | Buffer;
      };
      const stderr = String(failure.stderr || '');
      const stdout = String(failure.stdout || '');

      expect(failure.status).toBe(1);
      expect(stderr).toContain('Release blocked: KPI hard-gate failed.');
      expect(stdout).toContain('"releaseReadinessValidationPass": false');
      expect(stdout).toContain('"mode": "enforce"');
    }
  });

  it('keeps KPI pass in auto mode when release-readiness enforcement evidence is not enough', () => {
    const output = execFileSync(
      process.execPath,
      [
        'scripts/release-stop-gate.mjs',
        '--skip-contract-checks',
        '--marker',
        'releases/fixtures/wave3-kpi-marker.json',
        '--release-readiness-validation-mode',
        'auto',
        '--release-readiness-artifacts-min',
        '50',
        '--release-readiness-decisions-min',
        '30',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        stdio: 'pipe',
      }
    );

    expect(output).toContain('"mode": "auto"');
    expect(output).toContain('"evidenceEnoughForEnforcement": false');
    expect(output).toContain('"enforced": false');
    expect(output).toContain('"releaseReadinessValidationPass": true');
    expect(output).toContain('All release stop conditions passed.');
  });

  it('enforces enterprise freeze rule and release posture label when both are provided', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-enterprise-freeze-go-'));
    const gatePath = path.join(tempDir, 'enterprise-gate.json');
    const releaseNotesPath = path.join(tempDir, 'release-notes.md');

    fs.writeFileSync(
      gatePath,
      JSON.stringify(
        {
          enterpriseStabilizationGateStatus: {
            consecutiveWindowsPass: 2,
            expansionFrozen: false,
            freezeReason: null,
            last7d: { overallPass: true },
            last30d: { overallPass: true },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    fs.writeFileSync(releaseNotesPath, '# Release notes\n\nPosture: expansion-eligible\n', 'utf-8');

    try {
      const output = execFileSync(
        process.execPath,
        [
          'scripts/release-stop-gate.mjs',
          '--skip-kpi',
          '--skip-contract-checks',
          '--enterprise-gate',
          gatePath,
          '--enforce-enterprise-freeze',
          '--release-notes',
          releaseNotesPath,
          '--enforce-release-posture-label',
        ],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      expect(output).toContain('Enterprise stabilization gate result');
      expect(output).toContain('Release notes posture result');
      expect(output).toContain('expansion-eligible');
      expect(output).toContain('KPI check skipped by --skip-kpi.');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('blocks when open issue report contains blocking P0/P1 issues', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-open-issues-fail-'));
    const issueReportPath = path.join(tempDir, 'open-issues.json');

    fs.writeFileSync(
      issueReportPath,
      JSON.stringify(
        {
          issues: [
            {
              id: 'INC-101',
              title: 'Critical verify regression',
              severity: 'p0',
              state: 'open',
            },
            {
              id: 'INC-102',
              title: 'Minor docs drift',
              severity: 'p3',
              state: 'open',
            },
          ],
        },
        null,
        2
      ),
      'utf-8'
    );

    try {
      execFileSync(
        process.execPath,
        [
          'scripts/release-stop-gate.mjs',
          '--skip-kpi',
          '--skip-contract-checks',
          '--issue-report',
          issueReportPath,
          '--enforce-open-issues',
          '--block-severities',
          'p0,p1',
        ],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      throw new Error('Expected release gate to block on open P0/P1 issues.');
    } catch (error) {
      const failure = error as { status?: number; stderr?: string | Buffer };
      const stderr = String(failure.stderr || '');

      expect(failure.status).toBe(1);
      expect(stderr).toContain('Release blocked: Found 1 blocking open issue(s)');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('passes open-issue enforcement when P0/P1 issues are closed and only lower severities remain', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-open-issues-pass-'));
    const issueReportPath = path.join(tempDir, 'open-issues-clean.json');

    fs.writeFileSync(
      issueReportPath,
      JSON.stringify(
        [
          {
            number: 201,
            title: 'Closed high severity issue',
            labels: [{ name: 'p1' }],
            state: 'closed',
          },
          {
            number: 202,
            title: 'Open low severity issue',
            labels: [{ name: 'p3' }],
            state: 'open',
          },
        ],
        null,
        2
      ),
      'utf-8'
    );

    try {
      const output = execFileSync(
        process.execPath,
        [
          'scripts/release-stop-gate.mjs',
          '--skip-kpi',
          '--skip-contract-checks',
          '--issue-report',
          issueReportPath,
          '--enforce-open-issues',
          '--block-severities',
          'p0,p1',
        ],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      expect(output).toContain('Open-issue severity result');
      expect(output).toContain('No blocking open issues found for configured severities.');
      expect(output).toContain('KPI check skipped by --skip-kpi.');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('blocks open-issue enforcement for common severity label variants', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-open-issues-variant-fail-'));
    const issueReportPath = path.join(tempDir, 'open-issues-variants.json');

    fs.writeFileSync(
      issueReportPath,
      JSON.stringify(
        [
          {
            number: 301,
            title: 'Critical production incident',
            labels: [{ name: 'priority:p0-blocker' }],
            state: 'open',
          },
          {
            number: 302,
            title: 'High severity reliability risk',
            labels: [{ name: 'severity_high' }],
            state: 'open',
          },
        ],
        null,
        2
      ),
      'utf-8'
    );

    try {
      execFileSync(
        process.execPath,
        [
          'scripts/release-stop-gate.mjs',
          '--skip-kpi',
          '--skip-contract-checks',
          '--issue-report',
          issueReportPath,
          '--enforce-open-issues',
          '--block-severities',
          'p0,p1',
        ],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      throw new Error('Expected release gate to block on severity label variants for P0/P1.');
    } catch (error) {
      const failure = error as { status?: number; stderr?: string | Buffer };
      const stderr = String(failure.stderr || '');

      expect(failure.status).toBe(1);
      expect(stderr).toContain('Release blocked: Found 2 blocking open issue(s)');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('blocks when enterprise freeze rule is enforced but gate status is frozen', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-enterprise-freeze-fail-'));
    const gatePath = path.join(tempDir, 'enterprise-gate-frozen.json');

    fs.writeFileSync(
      gatePath,
      JSON.stringify(
        {
          enterpriseStabilizationGateStatus: {
            consecutiveWindowsPass: 1,
            expansionFrozen: true,
            freezeReason: 'last7d window failing',
            last7d: { overallPass: false },
            last30d: { overallPass: true },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    try {
      execFileSync(
        process.execPath,
        [
          'scripts/release-stop-gate.mjs',
          '--skip-kpi',
          '--skip-contract-checks',
          '--enterprise-gate',
          gatePath,
          '--enforce-enterprise-freeze',
        ],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      throw new Error('Expected release gate to block when freeze rule is not satisfied.');
    } catch (error) {
      const failure = error as { status?: number; stderr?: string | Buffer };
      const stderr = String(failure.stderr || '');
      expect(failure.status).toBe(1);
      expect(stderr).toContain('Release blocked: Enterprise stabilization freeze rule failed');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
