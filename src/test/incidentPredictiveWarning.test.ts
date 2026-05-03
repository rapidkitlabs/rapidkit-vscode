import { describe, expect, it } from 'vitest';

import { buildIncidentPredictiveWarning } from '../ui/panels/incidentPredictiveWarning';

describe('incidentPredictiveWarning', () => {
  it('fuses graph, doctor, and telemetry evidence into a high-confidence warning', () => {
    const warning = buildIncidentPredictiveWarning({
      impactAssessment: {
        confidence: 78,
        riskLevel: 'high',
        affectedFiles: ['src/orders/service.ts', 'src/orders/controller.ts'],
        affectedModules: ['orders', 'billing'],
        affectedTests: ['tests/orders.service.spec.ts'],
        likelyFailureMode: 'Authorization flow may regress across the orders boundary.',
        rationale: ['Orders depends on billing during auth checks.'],
        verifyChecklist: [
          'Run change-impact-lite and review affected modules before apply.',
          'Run deterministic verify command and capture output evidence.',
        ],
      },
      actionPolicy: {
        requiresImpactReview: true,
        requiresVerifyPath: true,
        riskClass: 'guarded-mutating',
      },
      doctorEvidence: {
        errors: 2,
        warnings: 1,
        passed: 5,
      },
      graphSummary: {
        nodeCount: 14,
        edgeCount: 11,
        supportedTopology: 'nestjs.standard',
      },
      evidenceSources: ['graph', 'doctor', 'runtime', 'selection'],
      signalContext: {
        actionType: 'terminal-bridge',
        queryText: [
          'Traceback (most recent call last):',
          'TimeoutError: database connection refused',
          'Auth middleware failed while validating bearer token',
        ].join('\n'),
      },
      telemetryStatus: {
        workspacePath: '/tmp/wsp',
        timeWindow: 'last7d',
        windowStartAt: null,
        windowEndAt: '2026-04-29T10:00:00.000Z',
        thresholds: {
          predictivePrecisionMin: 65,
          falseAlarmRateMax: 35,
          preventedIncidentRateMin: 20,
        },
        aggregation: {
          prevented_incident_rate: {
            key: 'prevented_incident_rate',
            numerator: 5,
            denominator: 10,
            value: 50,
            unit: 'percent',
            eventCommands: [
              'workspai.studio.prediction_verified',
              'workspai.studio.prediction_shown',
            ],
          },
          predictive_precision: {
            key: 'predictive_precision',
            numerator: 5,
            denominator: 6,
            value: 83.33,
            unit: 'percent',
            eventCommands: [
              'workspai.studio.prediction_verified',
              'workspai.studio.prediction_falsified',
            ],
          },
          false_alarm_rate: {
            key: 'false_alarm_rate',
            numerator: 1,
            denominator: 6,
            value: 16.67,
            unit: 'percent',
            eventCommands: [
              'workspai.studio.prediction_falsified',
              'workspai.studio.prediction_verified',
            ],
          },
        },
        metrics: {
          predictionShown: 10,
          predictionAccepted: 6,
          predictionVerified: 5,
          predictionFalsified: 1,
          predictionIgnored: 4,
          predictivePrecision: 83.33,
          falseAlarmRate: 16.67,
          preventedIncidentRate: 50,
          acceptanceRate: 60,
          verificationCoverage: 100,
        },
        gates: {
          telemetryEvidencePass: true,
          predictivePrecisionPass: true,
          falseAlarmRatePass: true,
          preventedIncidentRatePass: true,
          overallPass: true,
        },
      },
      verifyReady: false,
      verifySuccess: false,
    });

    expect(warning).not.toBeNull();
    expect(warning?.confidence).toBeGreaterThanOrEqual(75);
    expect(warning?.confidenceBand).toBe('high');
    expect(warning?.predictedFailure).toContain('Authorization flow may regress');
    expect(warning?.affectedScopeSummary).toContain('Modules: orders, billing');
    expect(warning?.nextSafeAction).toContain('doctor remediation');
    expect(warning?.verifyChecklist).toEqual(
      expect.arrayContaining([
        'Run candidate tests: tests/orders.service.spec.ts.',
        'Reproduce the failing runtime path and capture the first deterministic error lines before apply.',
        'Run auth and permission verification for the affected path before completion claim.',
        'Capture verify outcome so predictive KPI evidence stays calibrated.',
      ])
    );
    expect(warning?.evidenceSources).toEqual(
      expect.arrayContaining([
        'graph',
        'doctor',
        'runtime',
        'selection',
        'prediction-telemetry',
        'change-intent',
        'runtime-anomaly',
        'terminal-logs',
      ])
    );
  });

  it('suppresses low-confidence warnings after a clean verified outcome and weak telemetry', () => {
    const warning = buildIncidentPredictiveWarning({
      impactAssessment: {
        confidence: 40,
        riskLevel: 'low',
        affectedFiles: [],
        affectedModules: [],
        affectedTests: [],
        rationale: [],
        verifyChecklist: ['Run deterministic verify command and capture output evidence.'],
      },
      actionPolicy: {
        requiresImpactReview: false,
        requiresVerifyPath: true,
        riskClass: 'non-mutating-executable',
      },
      graphSummary: {
        nodeCount: 1,
        edgeCount: 0,
        supportedTopology: 'fastapi.standard',
      },
      evidenceSources: ['graph'],
      signalContext: {
        actionType: 'doctor-fix',
        queryText: 'Run deterministic verify checks only.',
      },
      telemetryStatus: {
        workspacePath: '/tmp/wsp',
        timeWindow: 'last7d',
        windowStartAt: null,
        windowEndAt: '2026-04-29T10:00:00.000Z',
        thresholds: {
          predictivePrecisionMin: 65,
          falseAlarmRateMax: 35,
          preventedIncidentRateMin: 20,
        },
        aggregation: {
          prevented_incident_rate: {
            key: 'prevented_incident_rate',
            numerator: 1,
            denominator: 8,
            value: 12.5,
            unit: 'percent',
            eventCommands: [
              'workspai.studio.prediction_verified',
              'workspai.studio.prediction_shown',
            ],
          },
          predictive_precision: {
            key: 'predictive_precision',
            numerator: 1,
            denominator: 5,
            value: 20,
            unit: 'percent',
            eventCommands: [
              'workspai.studio.prediction_verified',
              'workspai.studio.prediction_falsified',
            ],
          },
          false_alarm_rate: {
            key: 'false_alarm_rate',
            numerator: 4,
            denominator: 5,
            value: 80,
            unit: 'percent',
            eventCommands: [
              'workspai.studio.prediction_falsified',
              'workspai.studio.prediction_verified',
            ],
          },
        },
        metrics: {
          predictionShown: 8,
          predictionAccepted: 2,
          predictionVerified: 1,
          predictionFalsified: 4,
          predictionIgnored: 6,
          predictivePrecision: 20,
          falseAlarmRate: 80,
          preventedIncidentRate: 12.5,
          acceptanceRate: 25,
          verificationCoverage: 250,
        },
        gates: {
          telemetryEvidencePass: true,
          predictivePrecisionPass: false,
          falseAlarmRatePass: false,
          preventedIncidentRatePass: false,
          overallPass: false,
        },
      },
      verifyReady: true,
      verifySuccess: true,
    });

    expect(warning).toBeNull();
  });

  it('raises schema-mutation guidance from change intent even without terminal logs', () => {
    const warning = buildIncidentPredictiveWarning({
      impactAssessment: {
        confidence: 62,
        riskLevel: 'medium',
        affectedFiles: ['db/migrations/20260429_add_orders_table.sql'],
        affectedModules: ['orders'],
        affectedTests: [],
        rationale: ['Database schema changes may affect write paths.'],
        verifyChecklist: ['Run deterministic verify command and capture output evidence.'],
      },
      actionPolicy: {
        requiresImpactReview: true,
        requiresVerifyPath: true,
        riskClass: 'guarded-mutating',
      },
      doctorEvidence: {
        warnings: 1,
      },
      graphSummary: {
        nodeCount: 8,
        edgeCount: 6,
        supportedTopology: 'fastapi.standard',
      },
      evidenceSources: ['graph', 'doctor'],
      signalContext: {
        actionType: 'change-impact-lite',
        queryText:
          'Plan a schema migration to add the orders table and rename auth columns safely.',
      },
      verifyReady: true,
      verifySuccess: false,
    });

    expect(warning).not.toBeNull();
    expect(warning?.predictedFailure).toContain('schema mutation');
    expect(warning?.nextSafeAction).toContain('schema diff or dry-run');
    expect(warning?.verifyChecklist).toEqual(
      expect.arrayContaining([
        'Run migration dry-run or schema diff before applying a schema-affecting change.',
        'Run auth and permission verification for the affected path before completion claim.',
      ])
    );
    expect(warning?.evidenceSources).toEqual(expect.arrayContaining(['change-intent']));
  });

  it('classifies framework-specific runtime anomalies from Spring, workers, and migration engines', () => {
    const baseInput = {
      impactAssessment: {
        confidence: 48,
        riskLevel: 'medium' as const,
        affectedFiles: ['src/main/java/com/acme/App.java'],
        affectedModules: ['orders'],
        affectedTests: [],
        rationale: [],
        verifyChecklist: ['Run deterministic verify command and capture output evidence.'],
      },
      actionPolicy: {
        requiresImpactReview: false,
        requiresVerifyPath: true,
        riskClass: 'non-mutating-executable' as const,
      },
      graphSummary: {
        nodeCount: 4,
        edgeCount: 3,
        supportedTopology: 'springboot.standard',
      },
      evidenceSources: ['graph'],
      verifyReady: true,
      verifySuccess: false,
    };

    const springWarning = buildIncidentPredictiveWarning({
      ...baseInput,
      signalContext: {
        actionType: 'terminal-bridge',
        queryText:
          'APPLICATION FAILED TO START\nBeanCreationException: No qualifying bean of type OrderRepository',
      },
    });
    const workerWarning = buildIncidentPredictiveWarning({
      ...baseInput,
      signalContext: {
        actionType: 'terminal-bridge',
        queryText: 'BullMQ worker queue job failed, retry exhausted and moved to DLQ',
      },
    });
    const migrationWarning = buildIncidentPredictiveWarning({
      ...baseInput,
      signalContext: {
        actionType: 'terminal-bridge',
        queryText: 'Flyway migration failed: migration checksum mismatch on V12__orders.sql',
      },
    });

    expect(springWarning?.predictedFailure).toContain('Spring startup failures');
    expect(springWarning?.nextSafeAction).toContain('Spring startup');
    expect(springWarning?.verifyChecklist).toEqual(
      expect.arrayContaining([
        'Run Spring boot/startup verification and capture bean/config binding failure evidence.',
      ])
    );
    expect(workerWarning?.predictedFailure).toContain('worker queue failures');
    expect(workerWarning?.verifyChecklist).toEqual(
      expect.arrayContaining([
        'Replay the affected worker queue job or consumer path and capture retry/dead-letter outcome.',
      ])
    );
    expect(migrationWarning?.predictedFailure).toContain('migration engine failures');
    expect(migrationWarning?.nextSafeAction).toContain('migration engine dry-run');
    expect(migrationWarning?.verifyChecklist).toEqual(
      expect.arrayContaining([
        'Run migration status/dry-run and capture ordering, checksum, or schema drift evidence.',
      ])
    );
  });

  it('suppresses borderline warnings when false-alarm telemetry exceeds the calibrated cap', () => {
    const warning = buildIncidentPredictiveWarning({
      impactAssessment: {
        confidence: 70,
        riskLevel: 'low',
        affectedFiles: ['src/orders/service.ts'],
        affectedModules: ['orders'],
        affectedTests: ['tests/orders.service.spec.ts'],
        rationale: ['Possible regression in orders service.'],
        verifyChecklist: ['Run deterministic verify command and capture output evidence.'],
      },
      actionPolicy: {
        requiresImpactReview: false,
        requiresVerifyPath: true,
        riskClass: 'non-mutating-executable',
      },
      graphSummary: {
        nodeCount: 1,
        edgeCount: 0,
        supportedTopology: 'fastapi.standard',
      },
      evidenceSources: ['graph'],
      signalContext: {
        actionType: 'doctor-fix',
        queryText: 'Run deterministic verify checks only.',
      },
      telemetryStatus: {
        workspacePath: '/tmp/wsp',
        timeWindow: 'last7d',
        windowStartAt: null,
        windowEndAt: '2026-04-29T10:00:00.000Z',
        thresholds: {
          predictivePrecisionMin: 65,
          falseAlarmRateMax: 35,
          preventedIncidentRateMin: 20,
        },
        aggregation: {
          prevented_incident_rate: {
            key: 'prevented_incident_rate',
            numerator: 2,
            denominator: 10,
            value: 20,
            unit: 'percent',
            eventCommands: [
              'workspai.studio.prediction_verified',
              'workspai.studio.prediction_shown',
            ],
          },
          predictive_precision: {
            key: 'predictive_precision',
            numerator: 2,
            denominator: 6,
            value: 33.33,
            unit: 'percent',
            eventCommands: [
              'workspai.studio.prediction_verified',
              'workspai.studio.prediction_falsified',
            ],
          },
          false_alarm_rate: {
            key: 'false_alarm_rate',
            numerator: 4,
            denominator: 6,
            value: 66.67,
            unit: 'percent',
            eventCommands: [
              'workspai.studio.prediction_falsified',
              'workspai.studio.prediction_verified',
            ],
          },
        },
        metrics: {
          predictionShown: 10,
          predictionAccepted: 6,
          predictionVerified: 2,
          predictionFalsified: 4,
          predictionIgnored: 4,
          predictivePrecision: 33.33,
          falseAlarmRate: 66.67,
          preventedIncidentRate: 20,
          acceptanceRate: 60,
          verificationCoverage: 100,
        },
        gates: {
          telemetryEvidencePass: true,
          predictivePrecisionPass: false,
          falseAlarmRatePass: false,
          preventedIncidentRatePass: true,
          overallPass: false,
        },
      },
      verifyReady: true,
      verifySuccess: false,
      calibration: {
        warningConfidenceMin: 45,
        falseAlarmRateMax: 30,
        telemetrySuppressionBuffer: 10,
      },
    });

    expect(warning).toBeNull();
  });

  it('allows calibration to raise sensitivity for low-confidence flows when needed', () => {
    const warning = buildIncidentPredictiveWarning({
      impactAssessment: {
        confidence: 40,
        riskLevel: 'low',
        affectedFiles: [],
        affectedModules: [],
        affectedTests: [],
        rationale: [],
        verifyChecklist: ['Run deterministic verify command and capture output evidence.'],
      },
      actionPolicy: {
        requiresImpactReview: false,
        requiresVerifyPath: true,
        riskClass: 'non-mutating-executable',
      },
      graphSummary: {
        nodeCount: 1,
        edgeCount: 0,
        supportedTopology: 'fastapi.standard',
      },
      evidenceSources: ['graph'],
      signalContext: {
        actionType: 'doctor-fix',
        queryText: 'Run deterministic verify checks only.',
      },
      verifyReady: true,
      verifySuccess: false,
      calibration: {
        warningConfidenceMin: 30,
      },
    });

    expect(warning).not.toBeNull();
    expect((warning?.confidence ?? 0) >= 30).toBe(true);
  });
});
