import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('releaseStopGate manifest mode', () => {
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
});
