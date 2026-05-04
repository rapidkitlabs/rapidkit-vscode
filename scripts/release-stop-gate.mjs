#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DEFAULT_TEST_FILES = [
  'src/test/driftGuard.test.ts',
  'src/test/incidentStudioPayload.test.ts',
  'src/test/incidentStudioPromptPolicy.test.ts',
  'src/test/workspaceUsageTracker.test.ts',
];

function parseEnvNumber(envKeys, fallback) {
  for (const envKey of envKeys) {
    const raw = process.env[envKey];
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      continue;
    }

    const value = Number(raw);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

function parseArgs(argv) {
  const options = {
    skipKpi: false,
    skipContractChecks: false,
    manifest: '',
    claimChecklistPath:
      process.env.WORKSPAI_CLAIM_CHECKLIST_PATH ||
      path.resolve(process.cwd(), '..', 'Docs', 'workspai', 'Final', 'WORKSPAI_UNIFIED_FINAL_FEATURE_CHECKLIST.md'),
    enforceClaimChecklist: false,
    verifyPackContract:
      process.env.WORKSPAI_VERIFY_PACK_CONTRACT ||
      process.env.WORKSPAI_VERIFY_PACK_CONTRACT_PATH ||
      '',
    releaseReadinessCommander:
      process.env.WORKSPAI_RELEASE_READINESS_COMMANDER ||
      process.env.WORKSPAI_RELEASE_READINESS_COMMANDER_PATH ||
      '',
    marker: process.env.WORKSPAI_GATE_MARKER || process.env.WORKSPAI_GATE_MARKER_PATH || '',
    verifyPhaseReachMin: parseEnvNumber(
      ['WORKSPAI_GATE_VERIFY_MIN', 'WORKSPAI_GATE_VERIFY_PHASE_REACH_MIN'],
      80
    ),
    bridgeRouteCompletionMin: parseEnvNumber(
      ['WORKSPAI_GATE_BRIDGE_MIN', 'WORKSPAI_GATE_BRIDGE_ROUTE_COMPLETION_MIN'],
      95
    ),
    predictivePrecisionMin: parseEnvNumber(['WORKSPAI_GATE_PREDICTIVE_PRECISION_MIN'], 65),
    falseAlarmRateMax: parseEnvNumber(['WORKSPAI_GATE_FALSE_ALARM_RATE_MAX'], 35),
    preventedIncidentRateMin: parseEnvNumber(['WORKSPAI_GATE_PREVENTED_INCIDENT_RATE_MIN'], 20),
    reproPackShareRateMin: parseEnvNumber(['WORKSPAI_GATE_REPRO_PACK_SHARE_RATE_MIN'], 20),
    replayToResolutionRateMin: parseEnvNumber(['WORKSPAI_GATE_REPLAY_TO_RESOLUTION_RATE_MIN'], 60),
    verifyAutoRollbackSuccessRateMin: parseEnvNumber(['WORKSPAI_GATE_ROLLBACK_SUCCESS_RATE_MIN'], 60),
    falseConfidenceRateMax: parseEnvNumber(['WORKSPAI_GATE_FALSE_CONFIDENCE_RATE_MAX'], 40),
    predictiveCalibrationMode: String(
      process.env.WORKSPAI_GATE_PREDICTIVE_CALIBRATION_MODE || 'off'
    ).toLowerCase(),
    productionWindows: parseEnvNumber(['WORKSPAI_GATE_PROD_WINDOWS'], 0),
    productionWindowsMinForTightening: parseEnvNumber(['WORKSPAI_GATE_PROD_WINDOWS_MIN'], 3),
    predictionShownMinForTightening: parseEnvNumber(
      ['WORKSPAI_GATE_PREDICTION_SHOWN_MIN_FOR_TIGHTENING'],
      50
    ),
    predictionOutcomesMinForTightening: parseEnvNumber(
      ['WORKSPAI_GATE_PREDICTION_OUTCOMES_MIN_FOR_TIGHTENING'],
      30
    ),
    predictivePrecisionTightenedMin: parseEnvNumber(
      ['WORKSPAI_GATE_PREDICTIVE_PRECISION_TIGHTENED_MIN'],
      70
    ),
    falseAlarmRateTightenedMax: parseEnvNumber(
      ['WORKSPAI_GATE_FALSE_ALARM_RATE_TIGHTENED_MAX'],
      30
    ),
    preventedIncidentRateTightenedMin: parseEnvNumber(
      ['WORKSPAI_GATE_PREVENTED_INCIDENT_RATE_TIGHTENED_MIN'],
      30
    ),
    firstChunkLatencyP95MaxMs: parseEnvNumber(['WORKSPAI_GATE_FIRST_CHUNK_LATENCY_P95_MAX_MS'], 3000),
    syncLatencyP95MaxMs: parseEnvNumber(['WORKSPAI_GATE_SYNC_LATENCY_P95_MAX_MS'], 2000),
    boardRenderLatencyP95MaxMs: parseEnvNumber(['WORKSPAI_GATE_BOARD_RENDER_LATENCY_P95_MAX_MS'], 500),
    allowOverride: false,
    overrideOwner: process.env.WORKSPAI_GATE_OVERRIDE_OWNER || '',
    overrideReason: process.env.WORKSPAI_GATE_OVERRIDE_REASON || '',
    overrideTicket: process.env.WORKSPAI_GATE_OVERRIDE_TICKET || '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--skip-kpi') {
      options.skipKpi = true;
      continue;
    }

    if (arg === '--skip-contract-checks') {
      options.skipContractChecks = true;
      continue;
    }

    if (arg === '--manifest') {
      options.manifest = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--marker') {
      options.marker = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--verify-pack-contract') {
      options.verifyPackContract = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--release-readiness-commander') {
      options.releaseReadinessCommander = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--claim-checklist') {
      options.claimChecklistPath = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--enforce-claim-checklist') {
      options.enforceClaimChecklist = true;
      continue;
    }

    if (arg === '--verify-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.verifyPhaseReachMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--bridge-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.bridgeRouteCompletionMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--predictive-precision-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.predictivePrecisionMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--false-alarm-max') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.falseAlarmRateMax = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--prevented-rate-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.preventedIncidentRateMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--repro-pack-share-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.reproPackShareRateMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--replay-resolution-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.replayToResolutionRateMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--rollback-success-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.verifyAutoRollbackSuccessRateMin = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--false-confidence-max') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.falseConfidenceRateMax = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--allow-override') {
      options.allowOverride = true;
      continue;
    }

    if (arg === '--override-owner') {
      options.overrideOwner = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--override-reason') {
      options.overrideReason = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--override-ticket') {
      options.overrideTicket = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--predictive-calibration-mode') {
      options.predictiveCalibrationMode = String(argv[i + 1] || 'off').toLowerCase();
      i += 1;
      continue;
    }

    if (arg === '--prod-windows') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.productionWindows = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--prod-windows-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.productionWindowsMinForTightening = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--prediction-shown-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.predictionShownMinForTightening = value;
      }
      i += 1;
      continue;
    }

    if (arg === '--prediction-outcomes-min') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value)) {
        options.predictionOutcomesMinForTightening = value;
      }
      i += 1;
      continue;
    }
  }

  return options;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0)));
}

function runContractAndParityChecks(testFiles = DEFAULT_TEST_FILES) {
  const command = ['npx vitest run', ...uniqueStrings(testFiles)].join(' ');

  execSync(command, { stdio: 'inherit' });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function buildVerifyPackContractStatus(contractPath) {
  const resolvedPath = path.resolve(contractPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      contractPath: resolvedPath,
      message: `Verify-pack contract not found: ${resolvedPath}`,
    };
  }

  const payload = readJson(resolvedPath);
  const hasV1Schema = payload?.schemaVersion === 'v1';
  const overallStatus = payload?.overallStatus;
  const isOverallStatusValid =
    overallStatus === 'passed' || overallStatus === 'failed' || overallStatus === 'skipped';
  const commands = Array.isArray(payload?.commands) ? payload.commands : null;
  const summary = payload?.summary;
  const hasSummary =
    summary &&
    typeof summary.totalCommands === 'number' &&
    typeof summary.passedCommands === 'number' &&
    typeof summary.failedCommands === 'number' &&
    typeof summary.totalDurationMs === 'number';

  if (!hasV1Schema || !isOverallStatusValid || !commands || !hasSummary) {
    return {
      ok: false,
      contractPath: resolvedPath,
      message: 'Verify-pack contract payload is malformed or not schema v1.',
    };
  }

  return {
    ok: overallStatus === 'passed',
    contractPath: resolvedPath,
    overallStatus,
    summary,
    message:
      overallStatus === 'passed'
        ? 'Verify-pack contract passed.'
        : `Verify-pack contract status is ${overallStatus}.`,
  };
}

function buildReleaseReadinessCommanderStatus(artifactPath) {
  const resolvedPath = path.resolve(artifactPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      artifactPath: resolvedPath,
      message: `Release readiness commander artifact not found: ${resolvedPath}`,
    };
  }

  const payload = readJson(resolvedPath);
  const artifact = payload?.release_readiness_commander;
  const decision = artifact?.decision;
  const schemaVersion = artifact?.schemaVersion;
  const confidence = artifact?.confidence;
  const evidence = artifact?.evidence;
  const hasEvidence =
    evidence &&
    typeof evidence === 'object' &&
    typeof evidence.scopeKnown === 'boolean' &&
    typeof evidence.verifyPathPresent === 'boolean' &&
    typeof evidence.rollbackPathPresent === 'boolean';
  const blockingReasons = Array.isArray(artifact?.blockingReasons)
    ? artifact.blockingReasons.filter((item) => typeof item === 'string')
    : [];

  if (
    schemaVersion !== 'v1' ||
    (decision !== 'go' && decision !== 'no-go') ||
    !Number.isFinite(confidence) ||
    !hasEvidence
  ) {
    return {
      ok: false,
      artifactPath: resolvedPath,
      message: 'Release readiness commander artifact is malformed or unsupported.',
    };
  }

  return {
    ok: decision === 'go',
    artifactPath: resolvedPath,
    decision,
    confidence,
    blockingReasonCount: blockingReasons.length,
    message:
      decision === 'go'
        ? 'Release readiness commander decision is GO.'
        : 'Release readiness commander decision is NO-GO.',
  };
}

function listUncheckedCheckboxes(markdown, sectionTitle) {
  const lines = markdown.split(/\r?\n/);
  const sectionIndex = lines.findIndex((line) => line.trim() === sectionTitle.trim());
  if (sectionIndex < 0) {
    return [];
  }

  const unchecked = [];
  for (let i = sectionIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s+/.test(line) || /^###\s+/.test(line)) {
      break;
    }

    const match = line.match(/^\s*- \[ \] (.+)$/);
    if (match) {
      unchecked.push(match[1].trim());
    }
  }

  return unchecked;
}

function buildClaimChecklistStatus(checklistPath) {
  const resolvedPath = path.resolve(checklistPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      checklistPath: resolvedPath,
      finalMaturityUnchecked: [],
      wave1ExitUnchecked: [],
      message: `Claim checklist not found: ${resolvedPath}`,
    };
  }

  const markdown = fs.readFileSync(resolvedPath, 'utf-8');
  const finalMaturityUnchecked = listUncheckedCheckboxes(
    markdown,
    '## 4) Final Maturity Definition (Cross-Platform + IR/BYOP)'
  );
  const wave1ExitUnchecked = listUncheckedCheckboxes(markdown, '### Wave 1 Exit Package');
  const allUnchecked = [...finalMaturityUnchecked, ...wave1ExitUnchecked];

  return {
    ok: allUnchecked.length === 0,
    checklistPath: resolvedPath,
    finalMaturityUnchecked,
    wave1ExitUnchecked,
    message:
      allUnchecked.length === 0
        ? 'Claim checklist gates are fully checked.'
        : `Claim checklist has ${allUnchecked.length} unchecked gate(s).`,
  };
}

function percent(numerator, denominator) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : null;
}

function buildPredictionAggregation({ predictionShown, predictionVerified, predictionFalsified }) {
  const predictionOutcomes = predictionVerified + predictionFalsified;

  return {
    prevented_incident_rate: {
      key: 'prevented_incident_rate',
      numerator: predictionVerified,
      denominator: predictionShown,
      value: percent(predictionVerified, predictionShown),
      unit: 'percent',
      eventCommands: [
        'workspai.studio.prediction_verified',
        'workspai.studio.prediction_shown',
      ],
    },
    predictive_precision: {
      key: 'predictive_precision',
      numerator: predictionVerified,
      denominator: predictionOutcomes,
      value: percent(predictionVerified, predictionOutcomes),
      unit: 'percent',
      eventCommands: [
        'workspai.studio.prediction_verified',
        'workspai.studio.prediction_falsified',
      ],
    },
    false_alarm_rate: {
      key: 'false_alarm_rate',
      numerator: predictionFalsified,
      denominator: predictionOutcomes,
      value: percent(predictionFalsified, predictionOutcomes),
      unit: 'percent',
      eventCommands: [
        'workspai.studio.prediction_falsified',
        'workspai.studio.prediction_verified',
      ],
    },
  };
}

function resolvePredictiveCalibration({ baseThresholds, calibrationOptions, counts }) {
  const mode = String(calibrationOptions.predictiveCalibrationMode || 'off').toLowerCase();
  const productionWindows = Math.max(
    0,
    Number.isFinite(calibrationOptions.productionWindows)
      ? Math.round(calibrationOptions.productionWindows)
      : 0
  );
  const productionWindowsMinForTightening = Math.max(
    1,
    Number.isFinite(calibrationOptions.productionWindowsMinForTightening)
      ? Math.round(calibrationOptions.productionWindowsMinForTightening)
      : 3
  );
  const predictionShownMinForTightening = Math.max(
    1,
    Number.isFinite(calibrationOptions.predictionShownMinForTightening)
      ? Math.round(calibrationOptions.predictionShownMinForTightening)
      : 50
  );
  const predictionOutcomesMinForTightening = Math.max(
    1,
    Number.isFinite(calibrationOptions.predictionOutcomesMinForTightening)
      ? Math.round(calibrationOptions.predictionOutcomesMinForTightening)
      : 30
  );

  const canTightenByWindows = productionWindows >= productionWindowsMinForTightening;
  const canTightenByEvidence =
    counts.predictionShown >= predictionShownMinForTightening &&
    counts.predictionOutcomes >= predictionOutcomesMinForTightening;
  const tightenedActive =
    mode === 'production' && canTightenByWindows && canTightenByEvidence;

  const effectiveThresholds = {
    ...baseThresholds,
    predictivePrecisionMin: tightenedActive
      ? calibrationOptions.predictivePrecisionTightenedMin
      : baseThresholds.predictivePrecisionMin,
    falseAlarmRateMax: tightenedActive
      ? calibrationOptions.falseAlarmRateTightenedMax
      : baseThresholds.falseAlarmRateMax,
    preventedIncidentRateMin: tightenedActive
      ? calibrationOptions.preventedIncidentRateTightenedMin
      : baseThresholds.preventedIncidentRateMin,
  };

  return {
    effectiveThresholds,
    calibration: {
      mode,
      tightenedActive,
      productionWindows,
      productionWindowsMinForTightening,
      predictionShown: counts.predictionShown,
      predictionShownMinForTightening,
      predictionOutcomes: counts.predictionOutcomes,
      predictionOutcomesMinForTightening,
      reasons: {
        canTightenByWindows,
        canTightenByEvidence,
      },
      baseThresholds: {
        predictivePrecisionMin: baseThresholds.predictivePrecisionMin,
        falseAlarmRateMax: baseThresholds.falseAlarmRateMax,
        preventedIncidentRateMin: baseThresholds.preventedIncidentRateMin,
      },
      tightenedThresholds: {
        predictivePrecisionMin: calibrationOptions.predictivePrecisionTightenedMin,
        falseAlarmRateMax: calibrationOptions.falseAlarmRateTightenedMax,
        preventedIncidentRateMin: calibrationOptions.preventedIncidentRateTightenedMin,
      },
      appliedThresholds: {
        predictivePrecisionMin: effectiveThresholds.predictivePrecisionMin,
        falseAlarmRateMax: effectiveThresholds.falseAlarmRateMax,
        preventedIncidentRateMin: effectiveThresholds.preventedIncidentRateMin,
      },
    },
  };
}

function toIsoNow() {
  return new Date().toISOString();
}

function appendOverrideLog(record) {
  const targetPath = path.resolve(
    process.env.WORKSPAI_GATE_OVERRIDE_LOG ||
      path.join(process.cwd(), '.rapidkit', 'reports', 'release-gate-overrides.jsonl')
  );

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.appendFileSync(targetPath, `${JSON.stringify(record)}\n`, 'utf-8');

  return targetPath;
}

function validateManifestEntry(entry) {
  return entry && typeof entry === 'object' && typeof entry.path === 'string' && typeof entry.contains === 'string';
}

function buildManifestStatus(manifestPath) {
  const resolvedManifestPath = path.resolve(manifestPath);
  if (!fs.existsSync(resolvedManifestPath)) {
    return {
      ok: false,
      manifestPath: resolvedManifestPath,
      missingFiles: [resolvedManifestPath],
      missingContents: [],
      requiredVitestTests: [],
    };
  }

  const manifest = readJson(resolvedManifestPath);
  const requiredFiles = Array.isArray(manifest?.requiredFiles) ? manifest.requiredFiles : [];
  const requiredVitestTests = Array.isArray(manifest?.requiredVitestTests)
    ? manifest.requiredVitestTests
    : [];
  const requiredContents = Array.isArray(manifest?.requiredContents) ? manifest.requiredContents : [];

  const missingFiles = uniqueStrings([...requiredFiles, ...requiredVitestTests]).filter(
    (relativePath) => !fs.existsSync(path.resolve(process.cwd(), relativePath))
  );

  const missingContents = requiredContents
    .filter(validateManifestEntry)
    .filter((entry) => {
      const targetPath = path.resolve(process.cwd(), entry.path);
      if (!fs.existsSync(targetPath)) {
        return true;
      }

      const source = fs.readFileSync(targetPath, 'utf-8');
      return !source.includes(entry.contains);
    })
    .map((entry) => ({ path: entry.path, contains: entry.contains }));

  const malformedContentEntries = requiredContents.filter((entry) => !validateManifestEntry(entry));

  return {
    ok: missingFiles.length === 0 && missingContents.length === 0 && malformedContentEntries.length === 0,
    manifestPath: resolvedManifestPath,
    name: typeof manifest?.name === 'string' ? manifest.name : path.basename(resolvedManifestPath),
    missingFiles,
    missingContents,
    malformedContentEntries,
    requiredVitestTests: uniqueStrings(requiredVitestTests),
  };
}

function printManifestFailure(status) {
  console.error(`[release-stop-gate] Manifest validation failed: ${status.manifestPath}`);

  if (status.missingFiles.length > 0) {
    console.error('[release-stop-gate] Missing required files:');
    for (const filePath of status.missingFiles) {
      console.error(`- ${filePath}`);
    }
  }

  if (status.missingContents.length > 0) {
    console.error('[release-stop-gate] Missing required content snippets:');
    for (const entry of status.missingContents) {
      console.error(`- ${entry.path}: ${entry.contains}`);
    }
  }

  if (Array.isArray(status.malformedContentEntries) && status.malformedContentEntries.length > 0) {
    console.error('[release-stop-gate] Manifest contains malformed requiredContents entries.');
  }
}

function validateOverrideInput(options) {
  if (!options.allowOverride) {
    return null;
  }

  const owner = String(options.overrideOwner || '').trim();
  const reason = String(options.overrideReason || '').trim();
  const ticket = String(options.overrideTicket || '').trim();

  if (!owner || !reason || !ticket) {
    return {
      ok: false,
      message:
        'Override requires --override-owner, --override-reason, and --override-ticket when --allow-override is used.',
    };
  }

  if (reason.length < 10) {
    return {
      ok: false,
      message: 'Override reason must be at least 10 characters.',
    };
  }

  return {
    ok: true,
    owner,
    reason,
    ticket,
  };
}

function buildKpiGateStatus(markerPath, thresholds, calibrationOptions) {
  const marker = readJson(markerPath);
  const telemetry = marker?.metadata?.custom?.workspaiTelemetry;
  const recentEvents = Array.isArray(telemetry?.recentEvents) ? telemetry.recentEvents : [];

  let loopStarted = 0;
  let nextActionClicked = 0;
  let actionExecuted = 0;
  let verifyPassed = 0;
  let verifyFailed = 0;
  let predictionShown = 0;
  let predictionAccepted = 0;
  let predictionVerified = 0;
  let predictionFalsified = 0;
  let reproPackCaptured = 0;
  let reproPackExported = 0;
  let reproPackImported = 0;
  let incidentReplayReady = 0;
  let incidentReplayMemoryEnriched = 0;
  let rollbackAttempted = 0;
  let rollbackSucceeded = 0;

  for (const entry of recentEvents) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const command = typeof entry.command === 'string' ? entry.command : '';
    if (command === 'workspai.studio.loop_started') {
      loopStarted += 1;
    } else if (command === 'workspai.studio.next_action_clicked') {
      nextActionClicked += 1;
    } else if (command === 'workspai.studio.action_executed') {
      actionExecuted += 1;
    } else if (command === 'workspai.studio.verify_passed') {
      verifyPassed += 1;
    } else if (command === 'workspai.studio.verify_failed') {
      verifyFailed += 1;
    } else if (command === 'workspai.studio.prediction_shown') {
      predictionShown += 1;
    } else if (command === 'workspai.studio.prediction_accepted') {
      predictionAccepted += 1;
    } else if (command === 'workspai.studio.prediction_verified') {
      predictionVerified += 1;
    } else if (command === 'workspai.studio.prediction_falsified') {
      predictionFalsified += 1;
    } else if (command === 'workspai.studio.incident_repro_pack_captured') {
      reproPackCaptured += 1;
    } else if (command === 'workspai.studio.incident_repro_pack_exported') {
      reproPackExported += 1;
    } else if (command === 'workspai.studio.incident_repro_pack_imported') {
      reproPackImported += 1;
    } else if (command === 'workspai.studio.incident_replay_ready') {
      incidentReplayReady += 1;
    } else if (command === 'workspai.studio.incident_replay_memory_enriched') {
      incidentReplayMemoryEnriched += 1;
    } else if (command === 'workspai.studio.rollback_attempted') {
      rollbackAttempted += 1;
    } else if (command === 'workspai.studio.rollback_succeeded') {
      rollbackSucceeded += 1;
    }
  }

  const verifyOutcomes = verifyPassed + verifyFailed;
  const verifyPhaseReach =
    actionExecuted > 0 ? Number(((verifyOutcomes / actionExecuted) * 100).toFixed(2)) : null;
  const verifyAutoRollbackSuccessRate =
    rollbackAttempted > 0
      ? Number(((rollbackSucceeded / rollbackAttempted) * 100).toFixed(2))
      : null;
  const falseConfidenceRate =
    verifyFailed > 0
      ? Number(Math.max(0, (verifyFailed - rollbackSucceeded) / verifyFailed * 100).toFixed(2))
      : null;
  const bridgeRouteCompletionRate =
    loopStarted > 0 ? Number(((actionExecuted / loopStarted) * 100).toFixed(2)) : null;
  const predictionIgnored = Math.max(0, predictionShown - predictionAccepted);
  const predictionOutcomes = predictionVerified + predictionFalsified;
  const predictionAggregation = buildPredictionAggregation({
    predictionShown,
    predictionVerified,
    predictionFalsified,
  });
  const markerProductionWindows = Number(telemetry?.productionWindows);
  const effectiveProductionWindows =
    Number.isFinite(calibrationOptions.productionWindows) && calibrationOptions.productionWindows > 0
      ? calibrationOptions.productionWindows
      : Number.isFinite(markerProductionWindows)
      ? markerProductionWindows
      : 0;
  const predictiveCalibration = resolvePredictiveCalibration({
    baseThresholds: thresholds,
    calibrationOptions: {
      ...calibrationOptions,
      productionWindows: effectiveProductionWindows,
    },
    counts: {
      predictionShown,
      predictionOutcomes,
    },
  });
  const effectiveThresholds = predictiveCalibration.effectiveThresholds;
  const predictivePrecision = predictionAggregation.predictive_precision.value;
  const falseAlarmRate = predictionAggregation.false_alarm_rate.value;
  const preventedIncidentRate = predictionAggregation.prevented_incident_rate.value;
  const acceptanceRate =
    predictionShown > 0 ? Number(((predictionAccepted / predictionShown) * 100).toFixed(2)) : null;
  const verificationCoverage =
    predictionAccepted > 0 ? Number(((predictionOutcomes / predictionAccepted) * 100).toFixed(2)) : null;

  const reproPackShareRate = percent(reproPackExported, reproPackCaptured);
  const replayToResolutionRate = percent(incidentReplayMemoryEnriched, reproPackImported);
  const rollbackTelemetryEvidencePass = rollbackAttempted > 0;
  const verifyAutoRollbackSuccessRatePass =
    verifyAutoRollbackSuccessRate !== null &&
    verifyAutoRollbackSuccessRate >= effectiveThresholds.verifyAutoRollbackSuccessRateMin;
  const falseConfidenceRatePass =
    falseConfidenceRate !== null &&
    falseConfidenceRate <= effectiveThresholds.falseConfidenceRateMax;
  const reproPackShareRatePass =
    reproPackShareRate !== null && reproPackShareRate >= effectiveThresholds.reproPackShareRateMin;
  const replayToResolutionRatePass =
    replayToResolutionRate !== null &&
    replayToResolutionRate >= effectiveThresholds.replayToResolutionRateMin;

  // D04: performance SLO — compute P95 from latency samples stored in the marker
  const latencySamplesRaw = Array.isArray(telemetry?.latencySamples) ? telemetry.latencySamples : [];
  const latencySamples = latencySamplesRaw.filter(
    (s) => s && typeof s === 'object' && typeof s.event === 'string' && typeof s.ms === 'number'
  );
  const computeP95 = (values) => {
    if (values.length === 0) { return null; }
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, idx)];
  };
  const firstChunkMs = latencySamples.filter((s) => s.event === 'workspai.perf.first_chunk_latency').map((s) => s.ms);
  const syncMs = latencySamples.filter((s) => s.event === 'workspai.perf.sync_latency').map((s) => s.ms);
  const boardRenderMs = latencySamples.filter((s) => s.event === 'workspai.perf.board_render_latency').map((s) => s.ms);
  const firstChunkP95 = computeP95(firstChunkMs);
  const syncP95 = computeP95(syncMs);
  const boardRenderP95 = computeP95(boardRenderMs);
  const firstChunkLatencyPass =
    firstChunkP95 === null || firstChunkP95 <= effectiveThresholds.firstChunkLatencyP95MaxMs;
  const syncLatencyPass =
    syncP95 === null || syncP95 <= effectiveThresholds.syncLatencyP95MaxMs;
  const boardRenderLatencyPass =
    boardRenderP95 === null || boardRenderP95 <= effectiveThresholds.boardRenderLatencyP95MaxMs;

  const gates = {
    verifyPhaseReachPass:
      verifyPhaseReach !== null && verifyPhaseReach >= effectiveThresholds.verifyPhaseReachMin,
    bridgeRouteCompletionPass:
      bridgeRouteCompletionRate !== null &&
      bridgeRouteCompletionRate >= effectiveThresholds.bridgeRouteCompletionMin,
    telemetryEvidencePass: loopStarted > 0,
    predictivePrecisionPass:
      predictivePrecision !== null && predictivePrecision >= effectiveThresholds.predictivePrecisionMin,
    falseAlarmRatePass:
      falseAlarmRate !== null && falseAlarmRate <= effectiveThresholds.falseAlarmRateMax,
    preventedIncidentRatePass:
      preventedIncidentRate !== null && preventedIncidentRate >= effectiveThresholds.preventedIncidentRateMin,
    reproPackShareRatePass,
    replayToResolutionRatePass,
    rollbackTelemetryEvidencePass,
    verifyAutoRollbackSuccessRatePass,
    falseConfidenceRatePass,
    firstChunkLatencyPass,
    syncLatencyPass,
    boardRenderLatencyPass,
  };

  return {
    markerPath,
    evaluatedAt: toIsoNow(),
    thresholds: effectiveThresholds,
    predictiveCalibration: predictiveCalibration.calibration,
    aggregation: predictionAggregation,
    metrics: {
      loopStarted,
      nextActionClicked,
      actionExecuted,
      verifyOutcomes,
      verifyPassed,
      verifyFailed,
      verifyPhaseReach,
      bridgeRouteCompletionRate,
      predictionShown,
      predictionAccepted,
      predictionVerified,
      predictionFalsified,
      predictionIgnored,
      predictivePrecision,
      falseAlarmRate,
      preventedIncidentRate,
      reproPackCaptured,
      reproPackExported,
      reproPackImported,
      incidentReplayReady,
      incidentReplayMemoryEnriched,
      reproPackShareRate,
      replayToResolutionRate,
      acceptanceRate,
      verificationCoverage,
      rollbackAttempted,
      rollbackSucceeded,
      verifyAutoRollbackSuccessRate,
      falseConfidenceRate,
      firstChunkP95,
      syncP95,
      boardRenderP95,
      firstChunkSampleCount: firstChunkMs.length,
      syncSampleCount: syncMs.length,
      boardRenderSampleCount: boardRenderMs.length,
    },
    gates: {
      ...gates,
      overallPass:
        gates.verifyPhaseReachPass &&
        gates.bridgeRouteCompletionPass &&
        gates.telemetryEvidencePass &&
        gates.predictivePrecisionPass &&
        gates.falseAlarmRatePass &&
        gates.preventedIncidentRatePass &&
        gates.reproPackShareRatePass &&
        gates.replayToResolutionRatePass &&
        gates.rollbackTelemetryEvidencePass &&
        gates.verifyAutoRollbackSuccessRatePass &&
        gates.falseConfidenceRatePass &&
        gates.firstChunkLatencyPass &&
        gates.syncLatencyPass &&
        gates.boardRenderLatencyPass,
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  const manifestStatus = options.manifest ? buildManifestStatus(options.manifest) : null;
  if (manifestStatus && !manifestStatus.ok) {
    printManifestFailure(manifestStatus);
    process.exit(1);
  }

  if (manifestStatus) {
    console.log(`[release-stop-gate] Manifest checks passed: ${manifestStatus.name}`);
  }

  const testFiles = uniqueStrings([
    ...DEFAULT_TEST_FILES,
    ...(manifestStatus?.requiredVitestTests || []),
  ]);

  if (options.skipContractChecks) {
    console.log('[release-stop-gate] Contract/parity checks skipped by --skip-contract-checks.');
  } else {
    console.log('[release-stop-gate] Running contract/parity checks...');
    runContractAndParityChecks(testFiles);
  }

  if (options.verifyPackContract) {
    const verifyPackContractStatus = buildVerifyPackContractStatus(options.verifyPackContract);
    console.log('[release-stop-gate] Verify-pack contract result:');
    console.log(JSON.stringify(verifyPackContractStatus, null, 2));

    if (!verifyPackContractStatus.ok) {
      console.error(
        `[release-stop-gate] Release blocked: ${verifyPackContractStatus.message}`
      );
      process.exit(1);
    }
  }

  if (options.releaseReadinessCommander) {
    const commanderStatus = buildReleaseReadinessCommanderStatus(options.releaseReadinessCommander);
    console.log('[release-stop-gate] Release readiness commander result:');
    console.log(JSON.stringify(commanderStatus, null, 2));

    if (!commanderStatus.ok) {
      console.error(
        `[release-stop-gate] Release blocked: ${commanderStatus.message}`
      );
      process.exit(1);
    }
  }

  if (options.claimChecklistPath) {
    const claimChecklistStatus = buildClaimChecklistStatus(options.claimChecklistPath);
    console.log('[release-stop-gate] Claim checklist result:');
    console.log(JSON.stringify(claimChecklistStatus, null, 2));

    if (options.enforceClaimChecklist && !claimChecklistStatus.ok) {
      console.error(
        `[release-stop-gate] Release blocked: ${claimChecklistStatus.message}`
      );
      process.exit(1);
    }
  }

  if (options.skipKpi) {
    console.log('[release-stop-gate] KPI check skipped by --skip-kpi.');
    return;
  }

  if (!options.marker) {
    console.error(
      '[release-stop-gate] KPI gate requires --marker <path> or WORKSPAI_GATE_MARKER_PATH env var.'
    );
    process.exit(1);
  }

  const markerPath = path.resolve(options.marker);
  if (!fs.existsSync(markerPath)) {
    console.error(`[release-stop-gate] Marker not found: ${markerPath}`);
    process.exit(1);
  }

  const gateStatus = buildKpiGateStatus(
    markerPath,
    {
    verifyPhaseReachMin: options.verifyPhaseReachMin,
    bridgeRouteCompletionMin: options.bridgeRouteCompletionMin,
    predictivePrecisionMin: options.predictivePrecisionMin,
    falseAlarmRateMax: options.falseAlarmRateMax,
    preventedIncidentRateMin: options.preventedIncidentRateMin,
    reproPackShareRateMin: options.reproPackShareRateMin,
    replayToResolutionRateMin: options.replayToResolutionRateMin,
    verifyAutoRollbackSuccessRateMin: options.verifyAutoRollbackSuccessRateMin,
    falseConfidenceRateMax: options.falseConfidenceRateMax,
    firstChunkLatencyP95MaxMs: options.firstChunkLatencyP95MaxMs,
    syncLatencyP95MaxMs: options.syncLatencyP95MaxMs,
    boardRenderLatencyP95MaxMs: options.boardRenderLatencyP95MaxMs,
    },
    {
      predictiveCalibrationMode: options.predictiveCalibrationMode,
      productionWindows: options.productionWindows,
      productionWindowsMinForTightening: options.productionWindowsMinForTightening,
      predictionShownMinForTightening: options.predictionShownMinForTightening,
      predictionOutcomesMinForTightening: options.predictionOutcomesMinForTightening,
      predictivePrecisionTightenedMin: options.predictivePrecisionTightenedMin,
      falseAlarmRateTightenedMax: options.falseAlarmRateTightenedMax,
      preventedIncidentRateTightenedMin: options.preventedIncidentRateTightenedMin,
    }
  );

  console.log('[release-stop-gate] KPI gate result:');
  console.log(JSON.stringify(gateStatus, null, 2));

  if (!gateStatus.gates.overallPass) {
    const override = validateOverrideInput(options);
    if (override?.ok) {
      const logPath = appendOverrideLog({
        kind: 'release_gate_override',
        at: toIsoNow(),
        owner: override.owner,
        ticket: override.ticket,
        reason: override.reason,
        gateStatus,
      });

      console.warn(
        `[release-stop-gate] KPI hard-gate override accepted for ticket ${override.ticket} by ${override.owner}.`
      );
      console.warn(`[release-stop-gate] Override logged at: ${logPath}`);
      return;
    }

    if (override && !override.ok) {
      console.error(`[release-stop-gate] ${override.message}`);
    }
    console.error('[release-stop-gate] Release blocked: KPI hard-gate failed.');
    process.exit(1);
  }

  console.log('[release-stop-gate] All release stop conditions passed.');
}

main();
