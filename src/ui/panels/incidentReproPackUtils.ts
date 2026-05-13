import * as path from 'path';

export type IncidentReproPackRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type IncidentReproPackSensitivityLabel = 'internal' | 'restricted' | 'confidential';

export type ExportableIncidentReproPack = {
  packId: string;
  status?: 'captured' | 'failed' | 'skipped' | string;
  capturedAt?: string;
  schemaVersion?: 'v1' | string;
  workspacePath?: string;
  conversationId?: string;
  actionId?: string;
  redaction: {
    policy?: string;
    applied?: boolean;
    redactedFields?: string[];
  };
  summary: {
    historyTurns?: number;
    hasDoctorEvidence?: boolean;
    hasRollbackEvidence?: boolean;
    hasSandboxEvidence?: boolean;
    hasPredictiveWarning?: boolean;
    verifySuccess?: boolean;
    affectedFilesCount?: number;
    blockedReasonCount?: number;
  };
  replayPayload: {
    workspacePath?: string;
    conversationId?: string;
    actionType?: string;
    riskLevel: IncidentReproPackRiskLevel;
    likelyFailureMode?: string;
    verifyChecklist?: string[];
    blockedReasons?: string[];
    relatedFiles?: string[];
  };
  exportHint?: string;
  sensitivityLabel?: IncidentReproPackSensitivityLabel;
};

export type LinkSafeExportBundle = {
  schema_version: 'incident_repro_pack.v1';
  bundle_type: 'link-safe-payload';
  generated_at: string;
  source: 'workspai-incident-studio';
  incident_repro_pack: {
    packId: string;
    status: 'captured' | 'failed' | 'skipped';
    capturedAt: string;
    schemaVersion: 'v1';
    workspacePath: string;
    conversationId: '[REDACTED]';
    actionId: string;
    redaction: { policy: string; applied: boolean; redactedFields: string[] };
    summary: {
      historyTurns: number;
      hasDoctorEvidence: boolean;
      hasRollbackEvidence: boolean;
      hasSandboxEvidence: boolean;
      hasPredictiveWarning: boolean;
      verifySuccess: boolean;
      affectedFilesCount: number;
      blockedReasonCount: number;
    };
    replayPayload: {
      workspacePath: string;
      conversationId: '[REDACTED]';
      actionType: string;
      riskLevel: IncidentReproPackRiskLevel;
      likelyFailureMode?: string;
      verifyChecklist: string[];
      blockedReasons: string[];
      relatedFiles: string[];
    };
    exportHint?: string;
    sensitivity: {
      label: IncidentReproPackSensitivityLabel;
      reason: string;
    };
  };
  replay_entrypoint: {
    pack_id: string;
    workspace_hint: string;
    action_type: string;
    risk_level: IncidentReproPackRiskLevel;
    sensitivity_label: IncidentReproPackSensitivityLabel;
    verify_checklist: string[];
  };
};

function deriveSensitivityLabel(input: {
  declared?: IncidentReproPackSensitivityLabel;
  riskLevel: IncidentReproPackRiskLevel;
  redactedFields: string[];
}): IncidentReproPackSensitivityLabel {
  if (
    input.declared === 'internal' ||
    input.declared === 'restricted' ||
    input.declared === 'confidential'
  ) {
    return input.declared;
  }

  if (input.riskLevel === 'critical') {
    return 'confidential';
  }

  const sensitiveFields = new Set(
    input.redactedFields.map((field) => field.trim().toLowerCase()).filter(Boolean)
  );
  if (
    input.riskLevel === 'high' ||
    sensitiveFields.has('token') ||
    sensitiveFields.has('password') ||
    sensitiveFields.has('secret') ||
    sensitiveFields.has('apikey') ||
    sensitiveFields.has('authorization')
  ) {
    return 'restricted';
  }

  return 'internal';
}

/**
 * Converts an absolute file path to a 2-segment relative path safe for sharing.
 * Strips any path prefix beyond the last two segments to prevent workspace leakage.
 */
export function toLinkSafePath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/').trim();
  if (!normalized) {
    return '';
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 2) {
    return normalized;
  }
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

/**
 * Builds the structured replay query string for Incident Studio from a repro pack.
 * The output is deterministic and used as the `initialQuery` when importing a bundle.
 */
export function buildIncidentReplayQuery(reproPack: {
  packId: string;
  replayPayload: {
    actionType: string;
    riskLevel: IncidentReproPackRiskLevel;
    likelyFailureMode?: string;
    verifyChecklist: string[];
    blockedReasons: string[];
    relatedFiles: string[];
  };
}): string {
  const replayPayload = reproPack.replayPayload;
  const verifyList = replayPayload.verifyChecklist.length
    ? replayPayload.verifyChecklist
        .slice(0, 8)
        .map((item, index) => `${index + 1}. ${item}`)
        .join('\n')
    : '1. Run deterministic verification checks before claiming completion.';
  const blockedReasons = replayPayload.blockedReasons.length
    ? replayPayload.blockedReasons
        .slice(0, 8)
        .map((item, index) => `${index + 1}. ${item}`)
        .join('\n')
    : '1. No blocked reasons were captured in this pack.';
  const relatedFiles = replayPayload.relatedFiles.length
    ? replayPayload.relatedFiles.slice(0, 10).join(', ')
    : 'none captured';

  return [
    'Replay this incident repro pack in Incident Studio using a verify-first flow.',
    `Pack ID: ${reproPack.packId}`,
    `Action type: ${replayPayload.actionType}`,
    `Risk level: ${replayPayload.riskLevel}`,
    replayPayload.likelyFailureMode
      ? `Likely failure mode: ${replayPayload.likelyFailureMode}`
      : undefined,
    `Related files: ${relatedFiles}`,
    'Blocked reasons:',
    blockedReasons,
    'Verification checklist:',
    verifyList,
    'Return exactly one safe next step and one deterministic verification command.',
  ]
    .filter((line): line is string => Boolean(line && line.trim().length > 0))
    .join('\n');
}

/**
 * Builds the link-safe redacted JSON bundle that is written to disk during export.
 * Absolute workspacePaths and conversationIds are replaced with safe workspace name hints.
 */
export function buildLinkSafeExportBundle(
  reproPack: ExportableIncidentReproPack,
  workspaceName: string
): LinkSafeExportBundle {
  const riskLevel =
    reproPack.replayPayload.riskLevel === 'low' ||
    reproPack.replayPayload.riskLevel === 'medium' ||
    reproPack.replayPayload.riskLevel === 'high' ||
    reproPack.replayPayload.riskLevel === 'critical'
      ? reproPack.replayPayload.riskLevel
      : 'high';

  const safeWorkspaceName =
    workspaceName.trim() || path.basename(reproPack.workspacePath || '') || 'workspace';
  const normalizedStatus: 'captured' | 'failed' | 'skipped' =
    reproPack.status === 'failed' || reproPack.status === 'skipped' ? reproPack.status : 'captured';

  const linkSafePack = {
    packId: reproPack.packId,
    status: normalizedStatus,
    capturedAt: reproPack.capturedAt || new Date().toISOString(),
    schemaVersion: 'v1' as const,
    workspacePath: safeWorkspaceName,
    conversationId: '[REDACTED]' as const,
    actionId: reproPack.actionId || 'incident-repro-pack',
    redaction: {
      policy: reproPack.redaction?.policy || 'incident-studio-link-safe',
      applied: true as const,
      redactedFields: Array.from(
        new Set([...(reproPack.redaction?.redactedFields ?? []), 'workspacePath', 'conversationId'])
      ),
    },
    summary: {
      historyTurns: Math.max(0, Number(reproPack.summary?.historyTurns) || 0),
      hasDoctorEvidence: Boolean(reproPack.summary?.hasDoctorEvidence),
      hasRollbackEvidence: Boolean(reproPack.summary?.hasRollbackEvidence),
      hasSandboxEvidence: Boolean(reproPack.summary?.hasSandboxEvidence),
      hasPredictiveWarning: Boolean(reproPack.summary?.hasPredictiveWarning),
      verifySuccess: Boolean(reproPack.summary?.verifySuccess),
      affectedFilesCount: Math.max(0, Number(reproPack.summary?.affectedFilesCount) || 0),
      blockedReasonCount: Math.max(0, Number(reproPack.summary?.blockedReasonCount) || 0),
    },
    replayPayload: {
      workspacePath: safeWorkspaceName,
      conversationId: '[REDACTED]' as const,
      actionType: reproPack.replayPayload.actionType || 'incident-repro-pack',
      riskLevel,
      likelyFailureMode: reproPack.replayPayload.likelyFailureMode,
      verifyChecklist: (reproPack.replayPayload.verifyChecklist ?? []).slice(0, 10),
      blockedReasons: (reproPack.replayPayload.blockedReasons ?? []).slice(0, 10),
      relatedFiles: (reproPack.replayPayload.relatedFiles ?? [])
        .slice(0, 12)
        .map((entry) => toLinkSafePath(entry)),
    },
    exportHint:
      reproPack.exportHint ||
      'Link-safe payload exported with redaction enabled. Import in Incident Studio to replay safely.',
    sensitivity: {
      label: deriveSensitivityLabel({
        declared: reproPack.sensitivityLabel,
        riskLevel,
        redactedFields: Array.from(
          new Set([
            ...(reproPack.redaction?.redactedFields ?? []),
            'workspacePath',
            'conversationId',
          ])
        ),
      }),
      reason:
        riskLevel === 'critical'
          ? 'Critical-risk replay payload with redacted sensitive fields.'
          : 'Redacted replay payload intended for controlled incident collaboration.',
    },
  };

  return {
    schema_version: 'incident_repro_pack.v1',
    bundle_type: 'link-safe-payload',
    generated_at: new Date().toISOString(),
    source: 'workspai-incident-studio',
    incident_repro_pack: linkSafePack,
    replay_entrypoint: {
      pack_id: linkSafePack.packId,
      workspace_hint: linkSafePack.workspacePath,
      action_type: linkSafePack.replayPayload.actionType,
      risk_level: linkSafePack.replayPayload.riskLevel,
      sensitivity_label: linkSafePack.sensitivity.label,
      verify_checklist: linkSafePack.replayPayload.verifyChecklist,
    },
  };
}

/**
 * Parses an imported bundle JSON (multi-format: snake_case, camelCase, or direct packId root).
 * Returns a normalized shape ready for replay, or throws with a descriptive message.
 */
export function parseImportedReproBundle(parsed: Record<string, unknown>): {
  packId: string;
  replayPayload: {
    workspacePath?: string;
    actionType: string;
    riskLevel: IncidentReproPackRiskLevel;
    likelyFailureMode?: string;
    verifyChecklist: string[];
    blockedReasons: string[];
    relatedFiles: string[];
  };
} {
  const fromSnakeCase =
    parsed.incident_repro_pack && typeof parsed.incident_repro_pack === 'object'
      ? (parsed.incident_repro_pack as Record<string, unknown>)
      : null;
  const fromCamelCase =
    parsed.incidentReproPack && typeof parsed.incidentReproPack === 'object'
      ? (parsed.incidentReproPack as Record<string, unknown>)
      : null;
  const directPack =
    typeof parsed.packId === 'string' &&
    parsed.replayPayload &&
    typeof parsed.replayPayload === 'object'
      ? parsed
      : null;

  const importedPack = fromSnakeCase || fromCamelCase || directPack;
  if (!importedPack) {
    throw new Error('Invalid incident repro bundle: incident_repro_pack payload is missing.');
  }

  const replayPayloadRaw =
    importedPack.replayPayload && typeof importedPack.replayPayload === 'object'
      ? (importedPack.replayPayload as Record<string, unknown>)
      : null;
  if (!replayPayloadRaw) {
    throw new Error('Invalid incident repro bundle: replayPayload is missing.');
  }

  const riskLevelRaw = replayPayloadRaw.riskLevel;
  const riskLevel: IncidentReproPackRiskLevel =
    riskLevelRaw === 'low' ||
    riskLevelRaw === 'medium' ||
    riskLevelRaw === 'high' ||
    riskLevelRaw === 'critical'
      ? riskLevelRaw
      : 'high';

  return {
    packId:
      typeof importedPack.packId === 'string' && importedPack.packId.trim()
        ? importedPack.packId.trim()
        : `imported-${Date.now().toString(36)}`,
    replayPayload: {
      workspacePath:
        typeof replayPayloadRaw.workspacePath === 'string' && replayPayloadRaw.workspacePath.trim()
          ? replayPayloadRaw.workspacePath.trim()
          : undefined,
      actionType:
        typeof replayPayloadRaw.actionType === 'string' && replayPayloadRaw.actionType.trim()
          ? replayPayloadRaw.actionType.trim()
          : 'incident-repro-pack',
      riskLevel,
      likelyFailureMode:
        typeof replayPayloadRaw.likelyFailureMode === 'string'
          ? replayPayloadRaw.likelyFailureMode
          : undefined,
      verifyChecklist: Array.isArray(replayPayloadRaw.verifyChecklist)
        ? replayPayloadRaw.verifyChecklist
            .filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
            )
            .slice(0, 10)
        : [],
      blockedReasons: Array.isArray(replayPayloadRaw.blockedReasons)
        ? replayPayloadRaw.blockedReasons
            .filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
            )
            .slice(0, 10)
        : [],
      relatedFiles: Array.isArray(replayPayloadRaw.relatedFiles)
        ? replayPayloadRaw.relatedFiles
            .filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
            )
            .slice(0, 12)
        : [],
    },
  };
}
