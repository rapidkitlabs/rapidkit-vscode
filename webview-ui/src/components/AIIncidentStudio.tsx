import { useEffect, useMemo, useRef, useState } from 'react';

import {
    Activity,
    AlertTriangle,
    BarChart3,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Clock3,
    Maximize2,
    Minimize2,
    Package,
    RotateCw,
    ShieldCheck,
    Sparkles,
    Wrench,
    Send,
} from 'lucide-react';

import {
    getActionResultPresentation,
    getBoardActionGuardHint,
    getDecisionClarityWordingPolicy,
    getPhaseNextAction,
} from '../lib/incidentStudioVerifyPolicy';
import { applyIncidentUxModePolicy } from '../lib/incidentUxModeAdapter';
import { evaluateArtifactSuccessCriteria } from '../lib/incidentArtifactCriteria';
import { buildIncidentArchitectureLens } from '../lib/incidentArchitectureLens';
import {
    buildIncidentArchitectureNavigator,
    type IncidentArchitectureNavigatorItem,
} from '../lib/incidentImpactNavigator';
import {
    buildDashboardSection51FromSnapshotJson,
    buildDashboardSection51FromSnapshotMarkdown,
} from '../lib/incidentStudioDashboardExport';
import {
    buildIncidentCliActionMatrix,
    resolveIncidentCliActionByActionType,
    resolveIncidentCliActionIdByActionType,
} from '../lib/incidentCliActionMatrix';
import type {
    NormalizedIncidentActionResultPayload,
    NormalizedIncidentImpactAssessmentPayload,
    NormalizedIncidentPredictiveWarningPayload,
    NormalizedIncidentReleaseGateEvidencePayload,
    NormalizedIncidentSystemGraphSnapshotPayload,
    IncidentStudioStabilizationKpiStatus,
    MultiFilePatchResult,
    FilePatch,
} from '../lib/incidentStudioPayload';

interface IncidentCommandUsage {
    command: string;
    count: number;
}

interface IncidentSurfaceBreakdown {
    actionEvents: number;
    askEvents: number;
    actionVsAskShare: number | null;
}

interface IncidentCommandSummary {
    totalEvents: number;
    lastCommand: string | null;
    lastCommandAt: string | null;
    commandUsage: IncidentCommandUsage[];
    surfaceBreakdown: IncidentSurfaceBreakdown;
}

interface IncidentOnboardingSummary {
    followupShown: number;
    followupClicked: number;
    overallFollowupClickThroughRate: number;
}

interface IncidentTelemetrySnapshot {
    commandSummary: IncidentCommandSummary | null;
    onboardingSummary: IncidentOnboardingSummary | null;
    ctaVariantBreakdown?: {
        workspacePath: string;
        timeWindow: 'all' | 'last24h' | 'last7d';
        windowStartAt: string | null;
        windowEndAt: string;
        variants: Array<{
            variant: string;
            loopStarted: number;
            nextActionClicked: number;
            actionExecuted: number;
            verifyPassed: number;
            verifyFailed: number;
            verifyCompletionRate: number | null;
            actionVsAskShare: number | null;
            loopCompleted: number;
            abandoned: number;
        }>;
    } | null;
    studioHardGateStatus?: {
        workspacePath: string;
        timeWindow: 'all' | 'last24h' | 'last7d';
        windowStartAt: string | null;
        windowEndAt: string;
        thresholds: {
            verifyPhaseReachMin: number;
            bridgeRouteCompletionMin: number;
        };
        metrics: {
            loopStarted: number;
            nextActionClicked: number;
            actionExecuted: number;
            verifyOutcomes: number;
            verifyPhaseReach: number | null;
            bridgeRouteCompletionRate: number | null;
        };
        gates: {
            verifyPhaseReachPass: boolean;
            bridgeRouteCompletionPass: boolean;
            telemetryEvidencePass: boolean;
            overallPass: boolean;
        };
    } | null;
    studioRollbackKpiStatus?: {
        workspacePath: string;
        timeWindow: 'all' | 'last24h' | 'last7d';
        windowStartAt: string | null;
        windowEndAt: string;
        thresholds: {
            verifyAutoRollbackSuccessRateMin: number;
            falseConfidenceRateMax: number;
        };
        metrics: {
            verifyFailed: number;
            rollbackAttempted: number;
            rollbackSucceeded: number;
            verifyAutoRollbackSuccessRate: number | null;
            falseConfidenceRate: number | null;
        };
        gates: {
            telemetryEvidencePass: boolean;
            verifyAutoRollbackSuccessRatePass: boolean;
            falseConfidenceRatePass: boolean;
            overallPass: boolean;
        };
    } | null;
    studioStabilizationKpiStatus?: IncidentStudioStabilizationKpiStatus | null;
    studioReproPackKpiStatus?: {
        workspacePath: string;
        timeWindow: 'all' | 'last24h' | 'last7d';
        windowStartAt: string | null;
        windowEndAt: string;
        thresholds: {
            reproPackShareRateMin: number;
            replayToResolutionRateMin: number;
        };
        metrics: {
            reproPackCaptured: number;
            reproPackExported: number;
            reproPackImported: number;
            incidentReplayReady: number;
            incidentReplayMemoryEnriched: number;
            reproPackShareRate: number | null;
            replayToResolutionRate: number | null;
        };
        gates: {
            telemetryEvidencePass: boolean;
            reproPackShareRatePass: boolean;
            replayToResolutionRatePass: boolean;
            overallPass: boolean;
        };
    } | null;
    releaseReadinessValidationKpiStatus?: {
        workspacePath: string;
        timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
        windowStartAt: string | null;
        windowEndAt: string;
        metrics: {
            releaseReadinessArtifactsExported: number;
            goDecisionsExported: number;
            noGoDecisionsExported: number;
            decisionsValidated: number;
            decisionsCorrect: number;
            noGoDecisionsValidated: number;
            noGoPreventedIncident: number;
            releaseReadinessDecisionAccuracy: number | null;
            noGoPreventedIncidentRate: number | null;
        };
        gates: {
            telemetryEvidencePass: boolean;
            releaseReadinessDecisionAccuracyAvailable: boolean;
            noGoPreventedIncidentRateAvailable: boolean;
            overallPass: boolean;
        };
    } | null;
    verifiedOutcomeLoopStatus?: {
        workspacePath: string | null;
        timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d' | null;
        verifiedOutcomes: number;
        reusableArtifacts: {
            reproPacksExported: number;
            replayReady: number;
            memoryEnriched: number;
            releaseArtifactsExported: number;
        };
        conversionRates: {
            replayToResolutionRate: number | null;
            releaseDecisionAccuracy: number | null;
            noGoPreventedIncidentRate: number | null;
        };
        gates: {
            reproEvidencePass: boolean;
            releaseEvidencePass: boolean;
            overallPass: boolean;
        };
    } | null;
    doctorSummary?: {
        workspaceName?: string;
        generatedAt?: string;
        health: {
            total: number;
            passed: number;
            warnings: number;
            errors: number;
            percent: number;
        };
        projectCount: number;
        projectsWithIssues: number;
        issueCount: number;
        frameworks: Array<{ name: string; count: number }>;
        projects: Array<{
            name: string;
            path?: string;
            framework?: string;
            issues: number;
            depsInstalled?: boolean;
            modulesCount?: number;
            modulesHealthy?: boolean;
            vulnerabilities?: number;
            installedModules?: Array<{
                slug: string;
                version: string;
                display_name: string;
            }>;
        }>;
        fixCommands: string[];
    } | null;
}

interface AIIncidentStudioProps {
    workspaceName?: string;
    analysisScopeType?: 'workspace' | 'project';
    analysisScopeLabel?: string;
    analysisScopePath?: string | null;
    analysisWorkspacePath?: string | null;
    analysisProjectPath?: string | null;
    modelId?: string | null;
    availableModels?: Array<{ id: string; name: string; vendor: string }>;
    selectedModelId?: string | null;
    onModelChange?: (modelId: string | null) => void;
    autoLearningEnabled?: boolean;
    onToggleAutoLearning?: (enabled: boolean) => void;
    isRefreshing?: boolean;
    onRefreshData?: () => void;
    refreshLabel?: string | null;
    isAnalyzing: boolean;
    lastError?: string | null;
    conversationTurns: number;
    telemetry?: IncidentTelemetrySnapshot | null;
    chatBrainStreamText?: string;
    chatBrainHistory?: Array<{
        id: string;
        role: 'user' | 'assistant';
        text: string;
        timestamp: number;
    }>;
    chatBrainSuggestedQuestions?: string[];
    chatBrainBoard?: {
        id: string;
        type: string;
        title: string;
        summary?: string;
        actions?: Array<{
            id: string;
            label: string;
            actionType: string;
            riskLevel?: string;
            requiresImpactReview?: boolean;
            requiresVerifyPath?: boolean;
        }>;
    } | null;
    chatBrainActionProgress?: {
        stage: string;
        progress: number;
        note?: string;
    } | null;
    chatBrainActionResult?: NormalizedIncidentActionResultPayload | null;
    chatBrainSystemGraphSnapshot?: NormalizedIncidentSystemGraphSnapshotPayload | null;
    chatBrainImpactAssessment?: NormalizedIncidentImpactAssessmentPayload | null;
    chatBrainPredictiveWarning?: NormalizedIncidentPredictiveWarningPayload | null;
    chatBrainReleaseGateEvidence?: NormalizedIncidentReleaseGateEvidencePayload | null;
    chatBrainError?: string | null;
    chatBrainErrorRetryable?: boolean;
    incidentResume?: {
        workspacePath: string;
        phase: 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';
        turnCount: number;
        queryCount: number;
        actionCount: number;
        lastActivityAt: number;
        resolved: boolean;
        recap: string;
        nextActionLabel: string;
        nextActionQuery: string;
    } | null;
    onChatBrainQuery?: (query: string) => void;
    onChatBrainExecuteAction?: (actionType: string, actionId?: string) => void;
    onRunTerminalBridge: () => void;
    onRunFixPreview: () => void;
    onRunChangeImpact: () => void;
    onRunMemoryWizard: () => void;
    onRunDoctorChecks: () => void;
    onRunDoctorFix?: () => void;
    onViewComplianceReport?: () => void;
    onRunInlineCommand?: (command: string) => void;
    onRevealArchitectureTarget?: (target: {
        path: string;
        label: string;
        kind: 'file' | 'test' | 'node';
        symbolName?: string;
        startLine?: number;
    }) => void;
    onPredictiveWarningAccepted?: (warningId: string, predictionKey: string) => void;
    onApplyPatch?: (patchId: string, acceptedPaths: string[], branchSafeApply: boolean) => void;
    onExportIncidentReproPack?: (
        reproPack: NonNullable<NormalizedIncidentActionResultPayload['incidentReproPack']>
    ) => void;
    onExportSandboxSimulationEvidence?: (
        sandboxSimulation: NonNullable<NormalizedIncidentActionResultPayload['sandboxSimulation']>
    ) => void;
    onExportReleaseReadinessCommander?: (
        releaseReadinessCommander: NonNullable<
            NormalizedIncidentActionResultPayload['releaseReadinessCommander']
        >
    ) => void;
    onImportIncidentReproPack?: () => void;
    executingCommand?: string | null;
    primaryCtaMode?: PrimaryCtaMode;
    studioDisplayMode?: IncidentStudioDisplayMode;
    preferredArchitectureLensView?: ArchitectureLensViewMode | null;
    hasProjectSelected?: boolean;
    userMode?: IncidentUserMode;
    onUserModeChange?: (mode: IncidentUserMode) => void;
    /** Callback to persist a lite/full display-mode preference change. */
    onStudioDisplayModeChange?: (mode: 'lite' | 'full') => void;
}

type StructuredIncidentResponse = {
    whatHappened?: string;
    why?: string;
    nextCommand?: string;
    verifyCommand?: string;
};

type PrimaryCtaMode = 'single' | 'multi';
type IncidentUserMode = 'guided' | 'standard' | 'expert';
type IncidentStudioDisplayMode = 'lite' | 'full';
type ArchitectureLensViewMode = 'tree' | 'dependency' | 'runtime';
type ReleaseReadinessShareFormat = 'approval-note' | 'signoff' | 'json';
type IncidentReleaseReadinessArtifact = NonNullable<
    NormalizedIncidentActionResultPayload['releaseReadinessCommander']
>;

type IncidentIntentChip = {
    id: string;
    label: string;
    detail: string;
    kind:
    | 'query'
    | 'inline-command'
    | 'board-action'
    | 'terminal-bridge'
    | 'fix-preview'
    | 'change-impact'
    | 'memory-wizard'
    | 'doctor-checks';
    query?: string;
    command?: string;
    actionType?: string;
    actionId?: string;
    isPrimary?: boolean;
};

const CTA_VARIANT_MIN_LOOP_SAMPLES = 5;
const CTA_VARIANT_MIN_ACTION_SAMPLES = 3;

function isNetworkFailure(error?: string | null): boolean {
    if (!error) {
        return false;
    }
    return /ERR_NAME_NOT_RESOLVED|firewall|network|ENOTFOUND|offline|timeout/i.test(error);
}

function riskTone(riskLevel?: string): 'low' | 'medium' | 'high' | 'critical' | 'unknown' {
    const raw = String(riskLevel || '').toLowerCase();
    if (raw.includes('critical')) {
        return 'critical';
    }
    if (raw.includes('high')) {
        return 'high';
    }
    if (raw.includes('medium')) {
        return 'medium';
    }
    if (raw.includes('low')) {
        return 'low';
    }
    return 'unknown';
}

function riskPriority(riskLevel?: string): number {
    const tone = riskTone(riskLevel);
    if (tone === 'critical') {
        return 0;
    }
    if (tone === 'high') {
        return 1;
    }
    if (tone === 'medium') {
        return 2;
    }
    if (tone === 'low') {
        return 3;
    }
    return 4;
}

function actionExecutionHint(actionType: string): string {
    const linkedCliAction = resolveIncidentCliActionByActionType(actionType, true);
    if (linkedCliAction) {
        return `${linkedCliAction.detail} CLI: ${linkedCliAction.command}`;
    }
    if (actionType === 'terminal-bridge') {
        return 'Use this when you have runtime errors, stack traces, or failing logs.';
    }
    if (actionType === 'fix-preview-lite') {
        return 'Use this to generate a safe patch preview before editing files.';
    }
    if (actionType === 'change-impact-lite') {
        return 'Use this to estimate blast radius and rollout risk before changes.';
    }
    if (actionType === 'workspace-memory-wizard') {
        return 'Use this to save conventions and decisions for better future AI answers.';
    }
    if (actionType === 'doctor-fix') {
        return 'Use this to resolve structured doctor issues with guided fix steps.';
    }
    if (actionType === 'verify-pack-autopilot') {
        return 'Use this to build and run a deterministic verify command pack before claiming completion.';
    }
    return 'Run this action to continue the current diagnosis flow.';
}

function parseStructuredResponse(text: string): StructuredIncidentResponse {
    // Normalise markdown bold/italic: **What happened:** → What happened:
    const normalised = text.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');

    // Section boundary: any of the four known headings (markdown-stripped)
    const BOUNDARY = '(?:What happened|Why|Next command|Verify command)';

    const readSection = (label: string) => {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match the label (with optional leading #, >, or whitespace), then capture
        // everything until the next section heading or end of string.
        const regex = new RegExp(
            `(?:^|\\n)[#>\\s]*${escaped}\\s*:[ \\t]*([\\s\\S]*?)(?=\\n[#>\\s]*${BOUNDARY}\\s*:|$)`,
            'i'
        );
        const match = normalised.match(regex);
        return match?.[1]?.trim() || undefined;
    };

    return {
        whatHappened: readSection('What happened'),
        why: readSection('Why'),
        nextCommand: readSection('Next command'),
        verifyCommand: readSection('Verify command'),
    };
}

function normalizeCommandText(raw: string): string {
    let normalized = raw.trim();
    if (normalized.startsWith('```') && normalized.endsWith('```')) {
        normalized = normalized.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/```$/, '').trim();
    }
    return normalized;
}

function normalizeBlockerReason(raw: string): string {
    let text = raw.trim();

    // Expand common abbreviations and rewrite for user clarity
    text = text.replace(/^Verify-path completion/, 'Verify evidence completion');
    text = text.replace(/^False-confidence rate/, 'Unrecovered verification failures');
    text = text.replace(/^Rollback recovery/, 'Rollback success rate');
    text = text.replace(/^Repeat verified resolution/, 'Resolution pattern reuse');

    // Fix grammar: "is below threshold" -> "is below target"
    text = text.replace(/is below threshold/g, 'below target');
    text = text.replace(/is above threshold/g, 'above target');

    // Ensure proper capitalization and punctuation
    if (text && !text.endsWith('.')) {
        text = text + '.';
    }

    return text;
}

function isThreadNearBottom(element: HTMLDivElement, threshold = 72): boolean {
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    return remaining <= threshold;
}

type CommandExecutionScope = 'workspace' | 'project';

function inferCommandExecutionScope(command: string, hasProjectSelected: boolean): CommandExecutionScope {
    const normalized = normalizeCommandText(command).toLowerCase();
    if (!hasProjectSelected) {
        return 'workspace';
    }

    const isRapidkitFamily =
        /(?:^|\s)(npx\s+)?rapidkit(?:\s|$)/.test(normalized) ||
        /(?:^|\s)\.\/rapidkit(?:\s|$)/.test(normalized) ||
        /(?:^|\s)poetry\s+run\s+rapidkit(?:\s|$)/.test(normalized) ||
        normalized.includes('.venv/bin/rapidkit');

    if (!isRapidkitFamily) {
        return 'project';
    }

    const isWorkspaceLevelRapidkit =
        /\bdoctor\s+workspace\b/.test(normalized) ||
        /\bworkspace\s+(doctor|status|list|ls)\b/.test(normalized);

    return isWorkspaceLevelRapidkit ? 'workspace' : 'project';
}

function commandScopeLabel(scope: CommandExecutionScope): string {
    if (scope === 'workspace') {
        return 'Run in workspace root';
    }
    return 'Run in project root';
}

type BlockerSeverity = 'hard' | 'soft';

function classifyBlockerSeverity(
    blockerText: string,
    releaseReadinessBlockers: string[],
    verifyPackBlockers: string[]
): BlockerSeverity {
    // Hard blockers: release-readiness decision NO-GO or verify pack critical blockedReasons
    const isFromReleaseReadiness = releaseReadinessBlockers.some(
        (reason) => normalizeBlockerReason(reason) === blockerText
    );
    const isFromVerifyPack = verifyPackBlockers.some(
        (reason) => normalizeBlockerReason(reason) === blockerText
    );

    if (isFromReleaseReadiness || isFromVerifyPack) {
        return 'hard';
    }
    // Soft blockers: KPI gate failures
    return 'soft';
}

/**
 * Format fallback-mix breakdown for operational runbooks and weekly KPI dashboard.
 * Calculates non-success share and provides human-readable summary.
 */
function formatFallbackMixBreakdown(breakdown?: {
    success: number;
    bare_keyword_only: number;
    fix_preview_fallback: number;
    orchestrate_default: number;
    other: number;
}): {
    readable: string;
    table: string;
    nonSuccessShare: number;
} {
    if (!breakdown) {
        return {
            readable: 'No fallback data',
            table: '| Reason | Count | Share |\n| --- | ---: | ---: |\n',
            nonSuccessShare: 0,
        };
    }

    const total = breakdown.success + breakdown.bare_keyword_only + breakdown.fix_preview_fallback + breakdown.orchestrate_default + breakdown.other;
    const nonSuccess = breakdown.bare_keyword_only + breakdown.fix_preview_fallback + breakdown.orchestrate_default + breakdown.other;
    const nonSuccessShare = total > 0 ? Math.round((nonSuccess / total) * 100) : 0;

    const tableRows = [
        `| success (correct route) | ${breakdown.success} | ${total > 0 ? Math.round((breakdown.success / total) * 100) : 0}% |`,
        `| bare_keyword_only | ${breakdown.bare_keyword_only} | ${total > 0 ? Math.round((breakdown.bare_keyword_only / total) * 100) : 0}% |`,
        `| fix_preview_fallback | ${breakdown.fix_preview_fallback} | ${total > 0 ? Math.round((breakdown.fix_preview_fallback / total) * 100) : 0}% |`,
        `| orchestrate_default | ${breakdown.orchestrate_default} | ${total > 0 ? Math.round((breakdown.orchestrate_default / total) * 100) : 0}% |`,
        `| other | ${breakdown.other} | ${total > 0 ? Math.round((breakdown.other / total) * 100) : 0}% |`,
    ];

    const readable = `success=${breakdown.success}, bare_keyword_only=${breakdown.bare_keyword_only}, fix_preview_fallback=${breakdown.fix_preview_fallback}, orchestrate_default=${breakdown.orchestrate_default}, other=${breakdown.other} [non-success: ${nonSuccessShare}%]`;

    return {
        readable,
        table: `| Reason | Count | Share |\n| --- | ---: | ---: |\n${tableRows.join('\n')}`,
        nonSuccessShare,
    };
}

/**
 * Format S02 verify-path miss reasons for operational runbooks.
 * Lists top reasons and calculates dominance metrics.
 */
function formatVerifyPathMissReasons(reasons?: Array<{ reason: string; count: number }>): {
    readable: string;
    listMarkdown: string;
    topReason: { reason: string; count: number; share: number } | null;
} {
    if (!reasons || reasons.length === 0) {
        return {
            readable: 'No verify-path misses',
            listMarkdown: 'No miss data available.',
            topReason: null,
        };
    }

    const totalMisses = reasons.reduce((sum, r) => sum + r.count, 0);
    const readable = reasons
        .map((r) => `${r.reason} (${r.count})`)
        .join(', ');

    const listMarkdown = reasons
        .map((r) => {
            const share = totalMisses > 0 ? Math.round((r.count / totalMisses) * 100) : 0;
            return `- ${r.reason}: ${r.count} miss${r.count === 1 ? '' : 'es'} (${share}% of misses)`;
        })
        .join('\n');

    const topReason = reasons.length > 0
        ? {
            reason: reasons[0].reason,
            count: reasons[0].count,
            share: totalMisses > 0 ? Math.round((reasons[0].count / totalMisses) * 100) : 0,
        }
        : null;

    return {
        readable,
        listMarkdown,
        topReason,
    };
}

function buildReplayQueryFromIncidentReproPack(
    reproPack: NonNullable<NormalizedIncidentActionResultPayload['incidentReproPack']>
): string {
    const replay = reproPack.replayPayload;
    const verifyList = replay.verifyChecklist.length > 0
        ? replay.verifyChecklist.map((item, index) => `${index + 1}. ${item}`).join('\n')
        : '1. Run deterministic verification checks for this flow.';
    const blockedReasons = replay.blockedReasons.length > 0
        ? replay.blockedReasons.map((item, index) => `${index + 1}. ${normalizeBlockerReason(item)}`).join('\n')
        : '1. No blocked reasons were captured in this pack.';
    const relatedFiles = replay.relatedFiles.length > 0
        ? replay.relatedFiles.join(', ')
        : 'none captured';

    return [
        'Replay this imported incident repro pack inside Incident Studio.',
        `Pack ID: ${reproPack.packId}`,
        `Action type: ${replay.actionType}`,
        `Risk level: ${replay.riskLevel}`,
        replay.likelyFailureMode ? `Likely failure mode: ${replay.likelyFailureMode}` : null,
        `Related files: ${relatedFiles}`,
        'Blocked reasons:',
        blockedReasons,
        'Verification checklist:',
        verifyList,
        'Return one safe next step and an explicit verify command.',
    ]
        .filter((line): line is string => Boolean(line && line.trim().length > 0))
        .join('\n');
}

function doctorProjectSeverity(project: { issues: number; depsInstalled?: boolean }): 'healthy' | 'warning' | 'critical' {
    if (project.issues <= 0 && project.depsInstalled !== false) {
        return 'healthy';
    }
    if (project.issues >= 3) {
        return 'critical';
    }
    return 'warning';
}

function formatRelativeCue(timestamp?: string | number | null): string | null {
    if (!timestamp) {
        return null;
    }

    const time = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
    if (Number.isNaN(time)) {
        return null;
    }

    const deltaMs = Math.max(0, Date.now() - time);
    const deltaMinutes = Math.floor(deltaMs / 60000);

    if (deltaMinutes < 1) {
        return 'just now';
    }
    if (deltaMinutes < 60) {
        return `${deltaMinutes}m ago`;
    }

    const deltaHours = Math.floor(deltaMinutes / 60);
    if (deltaHours < 24) {
        return `${deltaHours}h ago`;
    }

    const deltaDays = Math.floor(deltaHours / 24);
    return `${deltaDays}d ago`;
}

function formatPercentValue(value: number | null | undefined): string {
    if (value === null || value === undefined) {
        return 'N/A';
    }
    return `${value}%`;
}

function formatIsoUtc(iso?: string | null): string {
    if (!iso) {
        return 'N/A';
    }
    const parsed = Date.parse(iso);
    if (Number.isNaN(parsed)) {
        return iso;
    }
    return new Date(parsed).toISOString().replace('.000Z', 'Z');
}

function buildTelemetryWindowLabel(input: {
    timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
    windowStartAt: string | null;
    windowEndAt: string;
}): string {
    if (input.timeWindow === 'all' || !input.windowStartAt) {
        return `${input.timeWindow} · until ${formatIsoUtc(input.windowEndAt)}`;
    }
    return `${input.timeWindow} · ${formatIsoUtc(input.windowStartAt)} -> ${formatIsoUtc(input.windowEndAt)}`;
}

function formatTopReasonList(
    reasons: Array<{ reason: string; count: number }> | null | undefined
): string {
    if (!reasons || reasons.length === 0) {
        return 'none';
    }
    return reasons.map((entry) => `${entry.reason} (${entry.count})`).join(', ');
}

function buildReleaseReadinessApprovalNoteMarkdown(artifact: IncidentReleaseReadinessArtifact): string {
    const blockingReasonText =
        artifact.blockingReasons.length > 0 ? artifact.blockingReasons.slice(0, 6).join('; ') : 'None';

    return [
        '# Release Approval Note (One Page)',
        '',
        `Decision: ${artifact.decision.toUpperCase()} (${artifact.confidence}% confidence)`,
        `Artifact ID: ${artifact.artifactId}`,
        `Generated at: ${artifact.generatedAt}`,
        `Workspace: ${artifact.workspacePath}`,
        '',
        '## Executive Summary',
        artifact.summary.goNoGoRationale,
        '',
        '## Evidence At A Glance',
        `- Verify contract: ${artifact.evidence.verifyPackContractStatus}`,
        `- Sandbox status: ${artifact.evidence.sandboxStatus}`,
        `- Scope known: ${artifact.evidence.scopeKnown ? 'yes' : 'no'}`,
        `- Verify path present: ${artifact.evidence.verifyPathPresent ? 'yes' : 'no'}`,
        `- Rollback path present: ${artifact.evidence.rollbackPathPresent ? 'yes' : 'no'}`,
        `- Doctor warnings/errors: ${artifact.evidence.doctorWarnings}/${artifact.evidence.doctorErrors}`,
        '',
        '## Blocking Reasons',
        blockingReasonText,
        '',
        '## Recommended Next Step',
        artifact.summary.recommendedNextStep,
        '',
        '## Team Signoff',
        '- Product: ____________________',
        '- Engineering: ________________',
        '- Docs: _______________________',
        '- GTM: ________________________',
        '- Final decision: [ ] GO   [ ] NO-GO',
    ].join('\n');
}

function buildReleaseReadinessSignoffMarkdown(artifact: IncidentReleaseReadinessArtifact): string {
    const blockingLines =
        artifact.blockingReasons.length > 0
            ? artifact.blockingReasons.map((reason) => `- ${reason}`).join('\n')
            : '- None';

    return [
        '## Release Readiness Signoff Packet',
        '',
        `- Artifact ID: ${artifact.artifactId}`,
        `- Generated at: ${artifact.generatedAt}`,
        `- Workspace: ${artifact.workspacePath}`,
        `- Decision: ${artifact.decision.toUpperCase()}`,
        `- Confidence: ${artifact.confidence}%`,
        '',
        '### Evidence Summary',
        `- Verify contract: ${artifact.evidence.verifyPackContractStatus}`,
        `- Sandbox: ${artifact.evidence.sandboxStatus}`,
        `- Scope known: ${artifact.evidence.scopeKnown ? 'yes' : 'no'}`,
        `- Verify path: ${artifact.evidence.verifyPathPresent ? 'yes' : 'no'}`,
        `- Rollback path: ${artifact.evidence.rollbackPathPresent ? 'yes' : 'no'}`,
        `- Doctor warnings/errors: ${artifact.evidence.doctorWarnings}/${artifact.evidence.doctorErrors}`,
        '',
        '### Blocking Reasons',
        blockingLines,
        '',
        '### Rationale',
        artifact.summary.goNoGoRationale,
        '',
        '### Recommended Next Step',
        artifact.summary.recommendedNextStep,
        '',
        '### Team Signoff',
        '- Product: [ ] Approved [ ] Rejected',
        '- Engineering: [ ] Approved [ ] Rejected',
        '- Docs: [ ] Approved [ ] Rejected',
        '- GTM: [ ] Approved [ ] Rejected',
        '- Final release decision: [ ] GO [ ] NO-GO',
    ].join('\n');
}

function buildReleaseReadinessArtifactJson(artifact: IncidentReleaseReadinessArtifact): string {
    return JSON.stringify(artifact, null, 2);
}

function intentLabelFromQuestion(question: string): { label: string; detail: string } {
    const normalized = question.trim().replace(/\?+$/, '');
    const lower = normalized.toLowerCase();

    if (/(verify|validation|validate|proof|prove|test|confirm)/.test(lower)) {
        return {
            label: 'Run verification now',
            detail: 'Confirm the change with deterministic proof instead of another open-ended prompt.',
        };
    }
    if (/(log|trace|stack|runtime|error output|stderr|stdout)/.test(lower)) {
        return {
            label: 'Inspect logs',
            detail: 'Pull the runtime evidence first so the next action is grounded in actual failure data.',
        };
    }
    if (/(preview|patch|fix|safe fix|rollback)/.test(lower)) {
        return {
            label: 'Preview safe fix',
            detail: 'Inspect the lowest-risk patch candidate before touching the workspace.',
        };
    }
    if (/(blast|impact|risk|radius|downstream|side effect)/.test(lower)) {
        return {
            label: 'Check blast radius',
            detail: 'Estimate scope and downstream effect before you apply a fix or rollout.',
        };
    }
    if (/(save|remember|pattern|playbook|incident)/.test(lower)) {
        return {
            label: 'Save incident pattern',
            detail: 'Keep this diagnosis path as reusable workspace memory for the next incident.',
        };
    }

    return {
        label: normalized || 'Take the next step',
        detail: 'Continue the diagnosis flow with the next scoped prompt.',
    };
}

function intentFromBoardAction(action: { id: string; label: string; actionType: string }): Omit<IncidentIntentChip, 'isPrimary'> {
    const linkedCliAction = resolveIncidentCliActionByActionType(action.actionType, true);
    if (linkedCliAction) {
        return {
            id: action.id,
            label: linkedCliAction.label,
            detail: `${linkedCliAction.detail} (${linkedCliAction.command})`,
            kind: 'board-action',
            actionType: action.actionType,
            actionId: action.id,
        };
    }

    if (action.actionType === 'terminal-bridge') {
        return {
            id: action.id,
            label: 'Inspect logs',
            detail: 'Open runtime evidence and stack traces for the active incident.',
            kind: 'board-action',
            actionType: action.actionType,
            actionId: action.id,
        };
    }
    if (action.actionType === 'fix-preview-lite') {
        return {
            id: action.id,
            label: 'Preview safe fix',
            detail: 'Generate a scoped patch preview before making an edit.',
            kind: 'board-action',
            actionType: action.actionType,
            actionId: action.id,
        };
    }
    if (action.actionType === 'change-impact-lite') {
        return {
            id: action.id,
            label: 'Check blast radius',
            detail: 'Estimate affected modules and rollout risk before applying a change.',
            kind: 'board-action',
            actionType: action.actionType,
            actionId: action.id,
        };
    }
    if (action.actionType === 'workspace-memory-wizard') {
        return {
            id: action.id,
            label: 'Save incident pattern',
            detail: 'Capture the diagnosis and outcome so future AI runs retain the pattern.',
            kind: 'board-action',
            actionType: action.actionType,
            actionId: action.id,
        };
    }
    if (action.actionType === 'doctor-fix') {
        return {
            id: action.id,
            label: 'Run verification now',
            detail: 'Turn the current diagnosis into proof-backed validation.',
            kind: 'board-action',
            actionType: action.actionType,
            actionId: action.id,
        };
    }
    if (action.actionType === 'release-readiness-commander') {
        return {
            id: action.id,
            label: 'Generate Go/No-Go decision',
            detail: 'Build a shareable release-readiness artifact from verify and runtime evidence.',
            kind: 'board-action',
            actionType: action.actionType,
            actionId: action.id,
        };
    }
    if (action.actionType === 'verify-pack-autopilot') {
        return {
            id: action.id,
            label: 'Run verify autopilot',
            detail: 'Generate deterministic verification commands and execute proof checks safely.',
            kind: 'board-action',
            actionType: action.actionType,
            actionId: action.id,
        };
    }

    return {
        id: action.id,
        label: action.label,
        detail: actionExecutionHint(action.actionType),
        kind: 'board-action',
        actionType: action.actionType,
        actionId: action.id,
    };
}

export function AIIncidentStudio({
    workspaceName,
    analysisScopeType = 'workspace',
    analysisScopeLabel,
    analysisScopePath = null,
    analysisWorkspacePath = null,
    analysisProjectPath = null,
    modelId,
    availableModels = [],
    selectedModelId = null,
    onModelChange,
    autoLearningEnabled = true,
    onToggleAutoLearning,
    isRefreshing = false,
    onRefreshData,
    refreshLabel = null,
    isAnalyzing,
    lastError,
    conversationTurns,
    telemetry,
    chatBrainStreamText,
    chatBrainHistory,
    chatBrainSuggestedQuestions,
    chatBrainBoard,
    chatBrainActionProgress,
    chatBrainActionResult,
    chatBrainSystemGraphSnapshot,
    chatBrainImpactAssessment,
    chatBrainPredictiveWarning,
    chatBrainReleaseGateEvidence,
    chatBrainError,
    chatBrainErrorRetryable = true,
    incidentResume,
    onChatBrainQuery,
    onChatBrainExecuteAction,
    onRunTerminalBridge,
    onRunFixPreview: _onRunFixPreview,
    onRunChangeImpact: _onRunChangeImpact,
    onRunMemoryWizard: _onRunMemoryWizard,
    onRunDoctorChecks,
    onRunDoctorFix,
    onViewComplianceReport,
    onRunInlineCommand,
    onRevealArchitectureTarget,
    onPredictiveWarningAccepted,
    onApplyPatch,
    onExportIncidentReproPack,
    onExportSandboxSimulationEvidence,
    onExportReleaseReadinessCommander,
    onImportIncidentReproPack,
    executingCommand,
    primaryCtaMode = 'single',
    studioDisplayMode = 'lite',
    preferredArchitectureLensView = null,
    hasProjectSelected = false,
    userMode = 'standard',
    onUserModeChange,
    onStudioDisplayModeChange,
}: AIIncidentStudioProps) {
    const [commandInput, setCommandInput] = useState('');
    const [lastCopiedCommand, setLastCopiedCommand] = useState<string | null>(null);
    const [lastUserQuery, setLastUserQuery] = useState<string | null>(null);
    const [expandedConversationIds, setExpandedConversationIds] = useState<Record<string, boolean>>({});
    const [isMaximized, setIsMaximized] = useState(false);
    const [showAllSidebarIssues, setShowAllSidebarIssues] = useState(false);
    const [showAllDoctorProjects, setShowAllDoctorProjects] = useState(false);
    const [moduleGraphFrameworkFilter, setModuleGraphFrameworkFilter] = useState<string>('all');
    const [moduleGraphSeverityFilter, setModuleGraphSeverityFilter] = useState<'all' | 'healthy' | 'warning' | 'critical'>('all');
    const [moduleGraphSearch, setModuleGraphSearch] = useState('');
    const [shouldAutoScrollThread, setShouldAutoScrollThread] = useState(true);
    const [stabilizationSnapshotCopiedFormat, setStabilizationSnapshotCopiedFormat] = useState<'markdown' | 'json' | 'dashboard-5-1' | null>(null);
    const [releaseReadinessCopiedFormat, setReleaseReadinessCopiedFormat] = useState<ReleaseReadinessShareFormat | null>(null);
    const [releaseReadinessCopiedArtifactId, setReleaseReadinessCopiedArtifactId] = useState<string | null>(null);
    const [architectureLensViewMode, setArchitectureLensViewMode] = useState<ArchitectureLensViewMode>('tree');
    const threadRef = useRef<HTMLDivElement>(null);
    const architectureLensScopeRef = useRef<string | null>(null);
    const isLiteDisplay = studioDisplayMode === 'lite';
    const isFullDisplay = studioDisplayMode === 'full';

    // Auto-scroll to bottom whenever history grows or streaming is active
    const [activeUserMode, setActiveUserMode] = useState<IncidentUserMode>(userMode);
    // Keep local mode in sync when parent (tab header controls) changes userMode
    useEffect(() => {
        setActiveUserMode(userMode);
    }, [userMode]);

    useEffect(() => {
        const el = threadRef.current;
        if (!el || !shouldAutoScrollThread) {
            return;
        }
        const frame = requestAnimationFrame(() => {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
        return () => cancelAnimationFrame(frame);
    }, [chatBrainHistory?.length, chatBrainStreamText, shouldAutoScrollThread]);

    useEffect(() => {
        if (preferredArchitectureLensView) {
            setArchitectureLensViewMode(preferredArchitectureLensView);
        }
    }, [preferredArchitectureLensView]);

    useEffect(() => {
        const scopeKey = [
            chatBrainSystemGraphSnapshot?.workspacePath || '',
            chatBrainSystemGraphSnapshot?.projectPath || '',
        ].join('::');

        if (architectureLensScopeRef.current === scopeKey) {
            return;
        }

        architectureLensScopeRef.current = scopeKey;
        setArchitectureLensViewMode(preferredArchitectureLensView || 'tree');
    }, [
        chatBrainSystemGraphSnapshot?.workspacePath,
        chatBrainSystemGraphSnapshot?.projectPath,
        preferredArchitectureLensView,
    ]);

    const aiUnavailable = isNetworkFailure(lastError);
    const selectedModelOption =
        selectedModelId && selectedModelId.trim().length > 0
            ? availableModels.find((model) => model.id === selectedModelId)
            : undefined;
    const selectedModelLabel = selectedModelOption
        ? `${selectedModelOption.name}${selectedModelOption.vendor ? ` (${selectedModelOption.vendor})` : ''}`
        : 'Auto';
    const runtimeModelLabel =
        typeof modelId === 'string' && modelId.trim().length > 0 ? modelId.trim() : null;
    const runtimeModelDiffersFromSelection = Boolean(
        runtimeModelLabel &&
        selectedModelOption &&
        runtimeModelLabel !== selectedModelOption.id &&
        runtimeModelLabel !== selectedModelOption.name
    );
    const modelEntitlementLabel = aiUnavailable
        ? 'Copilot unavailable'
        : availableModels.length === 0
            ? 'No model entitlement detected'
            : `${availableModels.length} entitled model(s) available`;
    const commandSummary = telemetry?.commandSummary ?? null;
    const onboardingSummary = telemetry?.onboardingSummary ?? null;
    const ctaVariantBreakdown = telemetry?.ctaVariantBreakdown ?? null;
    const studioHardGateStatus = telemetry?.studioHardGateStatus ?? null;
    const studioRollbackKpiStatus = telemetry?.studioRollbackKpiStatus ?? null;
    const studioStabilizationKpiStatus = telemetry?.studioStabilizationKpiStatus ?? null;
    const studioReproPackKpiStatus = telemetry?.studioReproPackKpiStatus ?? null;
    const releaseReadinessValidationKpiStatus = telemetry?.releaseReadinessValidationKpiStatus ?? null;
    const verifiedOutcomeLoopStatus = telemetry?.verifiedOutcomeLoopStatus ?? null;
    const doctorSummary = telemetry?.doctorSummary ?? null;
    const isProjectAnalysisScope = analysisScopeType === 'project';
    const normalizedProjectScopePath = (analysisProjectPath || analysisScopePath || '')
        .trim()
        .replace(/\\/g, '/')
        .toLowerCase();
    const selectedProjectScopeName = isProjectAnalysisScope
        ? (analysisScopeLabel || '')
            .split('@')[0]
            .trim()
            .toLowerCase()
        : '';
    const hasDoctorSnapshot = Boolean(doctorSummary);
    const doctorProjects = doctorSummary?.projects ?? [];
    const scopedDoctorProjects = useMemo(() => {
        if (!isProjectAnalysisScope) {
            return doctorProjects;
        }

        if (doctorProjects.length === 0) {
            return [];
        }

        const byPath = normalizedProjectScopePath
            ? doctorProjects.filter((project) => {
                if (typeof project.path !== 'string' || !project.path.trim()) {
                    return false;
                }
                return project.path.trim().replace(/\\/g, '/').toLowerCase() === normalizedProjectScopePath;
            })
            : [];
        if (byPath.length > 0) {
            return byPath;
        }

        const byName = selectedProjectScopeName
            ? doctorProjects.filter(
                (project) => project.name.trim().toLowerCase() === selectedProjectScopeName
            )
            : [];
        if (byName.length > 0) {
            return byName;
        }

        return doctorProjects.slice(0, 1);
    }, [
        doctorProjects,
        isProjectAnalysisScope,
        normalizedProjectScopePath,
        selectedProjectScopeName,
    ]);
    const doctorVisibleProjects = isProjectAnalysisScope
        ? scopedDoctorProjects
        : showAllDoctorProjects
            ? scopedDoctorProjects
            : scopedDoctorProjects.slice(0, 4);
    const hiddenDoctorProjectsCount = isProjectAnalysisScope
        ? 0
        : Math.max(scopedDoctorProjects.length - doctorVisibleProjects.length, 0);
    const cliActionMatrix = useMemo(
        () => buildIncidentCliActionMatrix(hasProjectSelected),
        [hasProjectSelected]
    );
    const doctorModuleGraphByFramework = useMemo(() => {
        const grouped = new Map<
            string,
            Array<{
                name: string;
                severity: 'healthy' | 'warning' | 'critical';
                modules: Array<{ slug: string; version: string; display_name: string }>;
            }>
        >();

        for (const project of doctorVisibleProjects) {
            const installedModules = project.installedModules || [];
            if (installedModules.length === 0) {
                continue;
            }
            const framework = (project.framework || 'unknown framework').trim() || 'unknown framework';
            const existing = grouped.get(framework) || [];
            existing.push({
                name: project.name,
                severity: doctorProjectSeverity(project),
                modules: installedModules,
            });
            grouped.set(framework, existing);
        }

        return Array.from(grouped.entries())
            .map(([framework, projects]) => ({ framework, projects }))
            .sort((a, b) => a.framework.localeCompare(b.framework));
    }, [doctorVisibleProjects]);
    const doctorModuleGraphFrameworkOptions = useMemo(
        () => doctorModuleGraphByFramework.map((group) => group.framework),
        [doctorModuleGraphByFramework]
    );
    const filteredDoctorModuleGraph = useMemo(() => {
        const searchNeedle = moduleGraphSearch.trim().toLowerCase();
        return doctorModuleGraphByFramework
            .filter((group) => moduleGraphFrameworkFilter === 'all' || group.framework === moduleGraphFrameworkFilter)
            .map((group) => ({
                framework: group.framework,
                projects: group.projects
                    .filter((project) => moduleGraphSeverityFilter === 'all' || project.severity === moduleGraphSeverityFilter)
                    .map((project) => ({
                        ...project,
                        modules: searchNeedle
                            ? project.modules.filter((mod) => {
                                const moduleLabel = `${mod.display_name || ''} ${mod.slug || ''} ${mod.version || ''}`.toLowerCase();
                                return moduleLabel.includes(searchNeedle);
                            })
                            : project.modules,
                    }))
                    .filter((project) => project.modules.length > 0),
            }))
            .filter((group) => group.projects.length > 0);
    }, [doctorModuleGraphByFramework, moduleGraphFrameworkFilter, moduleGraphSearch, moduleGraphSeverityFilter]);
    useEffect(() => {
        if (
            moduleGraphFrameworkFilter !== 'all' &&
            !doctorModuleGraphFrameworkOptions.includes(moduleGraphFrameworkFilter)
        ) {
            setModuleGraphFrameworkFilter('all');
        }
    }, [doctorModuleGraphFrameworkOptions, moduleGraphFrameworkFilter]);
    const scopedDoctorIssueCount = scopedDoctorProjects.reduce(
        (total, project) => total + (project.issues || 0),
        0
    );
    const scopedDoctorProjectsWithIssues = scopedDoctorProjects.filter(
        (project) => (project.issues || 0) > 0
    ).length;
    const projectScopeHealthPercent = useMemo(() => {
        if (!isProjectAnalysisScope || !hasDoctorSnapshot) {
            return null;
        }

        if (scopedDoctorProjects.length === 0) {
            return null;
        }

        if (scopedDoctorProjects.length === 1) {
            const project = scopedDoctorProjects[0];
            const rawPenalty =
                (project.issues || 0) * 12 +
                (project.vulnerabilities || 0) * 3 +
                (project.depsInstalled === false ? 15 : 0);
            return Math.max(10, Math.min(100, 100 - rawPenalty));
        }

        const healthyShare =
            scopedDoctorProjects.length > 0
                ? (scopedDoctorProjects.length - scopedDoctorProjectsWithIssues) /
                scopedDoctorProjects.length
                : 0;
        return Math.round(Math.max(0, Math.min(1, healthyShare)) * 100);
    }, [
        hasDoctorSnapshot,
        isProjectAnalysisScope,
        scopedDoctorProjects,
        scopedDoctorProjectsWithIssues,
    ]);
    // null = no real data yet; shown as 'N/A' rather than fabricated numbers.
    const snapshotHealthPercent = hasDoctorSnapshot
        ? isProjectAnalysisScope
            ? projectScopeHealthPercent
            : doctorSummary!.health.percent
        : null;
    const projectsWithIssuesRatio =
        hasDoctorSnapshot && scopedDoctorProjects.length > 0
            ? Math.round((scopedDoctorProjectsWithIssues / scopedDoctorProjects.length) * 100)
            : null;
    const snapshotIssueCount = hasDoctorSnapshot
        ? isProjectAnalysisScope
            ? scopedDoctorIssueCount
            : doctorSummary!.issueCount
        : null;
    const snapshotPrimaryLabel = isProjectAnalysisScope ? 'Project health' : 'Workspace health';
    const snapshotSecondaryLabel = isProjectAnalysisScope
        ? 'Selected scope with issues'
        : 'Projects with issues';
    const snapshotSectionTitle = isProjectAnalysisScope
        ? 'Project Health Snapshot'
        : 'Workspace Health Snapshot';
    const diagnosisPanelTitle = isProjectAnalysisScope
        ? 'Project Live Diagnosis'
        : 'Workspace Live Diagnosis';
    const diagnosisHeadline = isProjectAnalysisScope
        ? 'Current project diagnosis'
        : 'Current workspace diagnosis';
    const incidentCount = commandSummary?.totalEvents
        ? Math.min(99, Math.ceil(commandSummary.totalEvents / 3))
        : conversationTurns > 0
            ? 1 + Math.floor(conversationTurns / 2)
            : null;
    const hardGateVerifyReach = studioHardGateStatus?.metrics.verifyPhaseReach ?? null;
    const hardGateBridgeCompletion = studioHardGateStatus?.metrics.bridgeRouteCompletionRate ?? null;
    const hardGateVerifyMeter = Math.max(0, Math.min(100, hardGateVerifyReach ?? 0));
    const hardGateBridgeMeter = Math.max(0, Math.min(100, hardGateBridgeCompletion ?? 0));
    const rollbackAutoSuccessRate = studioRollbackKpiStatus?.metrics.verifyAutoRollbackSuccessRate ?? null;
    const rollbackFalseConfidenceRate = studioRollbackKpiStatus?.metrics.falseConfidenceRate ?? null;
    const rollbackSuccessMeter = Math.max(0, Math.min(100, rollbackAutoSuccessRate ?? 0));
    const rollbackFalseConfidenceMeter = Math.max(0, Math.min(100, rollbackFalseConfidenceRate ?? 0));
    const stabilizationRoutePrecision = studioStabilizationKpiStatus?.metrics.routePrecision ?? null;
    const stabilizationVerifyPathCompletion = studioStabilizationKpiStatus?.metrics.verifyPathCompletionRate ?? null;
    const stabilizationFalseConfidence = studioStabilizationKpiStatus?.metrics.falseConfidenceRate ?? null;
    const stabilizationRollbackRecovery = studioStabilizationKpiStatus?.metrics.rollbackRecoverySuccessRate ?? null;
    const stabilizationRepeatResolution = studioStabilizationKpiStatus?.metrics.repeatVerifiedResolutionRate ?? null;
    const stabilizationRepeatWithArtifact = studioStabilizationKpiStatus?.metrics.repeatVerifiedWithArtifactRate ?? null;
    const stabilizationFallbackMix = studioStabilizationKpiStatus?.metrics.fallbackReasonBreakdown;
    const stabilizationVerifyPathReasonTop = studioStabilizationKpiStatus?.metrics.verifyPathReasonTop ?? [];
    const stabilizationRecoveryClassBreakdown = studioStabilizationKpiStatus?.metrics.recoveryClassBreakdown;
    const stabilizationVerifyPathReasonTopText = formatTopReasonList(stabilizationVerifyPathReasonTop);
    const stabilizationRouteMeter = Math.max(0, Math.min(100, stabilizationRoutePrecision ?? 0));
    const stabilizationVerifyMeter = Math.max(0, Math.min(100, stabilizationVerifyPathCompletion ?? 0));
    const stabilizationFalseConfidenceMeter = Math.max(0, Math.min(100, stabilizationFalseConfidence ?? 0));
    const stabilizationRollbackMeter = Math.max(0, Math.min(100, stabilizationRollbackRecovery ?? 0));
    const stabilizationRepeatMeter = Math.max(0, Math.min(100, stabilizationRepeatResolution ?? 0));
    const stabilizationWindowLabel = studioStabilizationKpiStatus
        ? buildTelemetryWindowLabel({
            timeWindow: studioStabilizationKpiStatus.timeWindow,
            windowStartAt: studioStabilizationKpiStatus.windowStartAt,
            windowEndAt: studioStabilizationKpiStatus.windowEndAt,
        })
        : null;
    const stabilizationSnapshotMarkdown = useMemo(() => {
        if (!studioStabilizationKpiStatus) {
            return '';
        }

        const fallbackMixData = formatFallbackMixBreakdown(stabilizationFallbackMix);
        const verifyPathMissData = formatVerifyPathMissReasons(stabilizationVerifyPathReasonTop);
        const totalRecoveryAttempts = (stabilizationRecoveryClassBreakdown?.auto_rollback ?? 0) +
            (stabilizationRecoveryClassBreakdown?.manual_recovery ?? 0) +
            (stabilizationRecoveryClassBreakdown?.unspecified ?? 0);

        return [
            '# Workspai Stabilization KPI Snapshot',
            '',
            '## Metadata',
            '',
            `- Generated at: ${new Date().toISOString()}`,
            `- Workspace: ${studioStabilizationKpiStatus.workspacePath}`,
            `- Window: ${studioStabilizationKpiStatus.timeWindow}`,
            `- Window start: ${formatIsoUtc(studioStabilizationKpiStatus.windowStartAt)}`,
            `- Window end: ${formatIsoUtc(studioStabilizationKpiStatus.windowEndAt)}`,
            '',
            '## KPI Scorecard',
            '',
            `**Overall gate: ${studioStabilizationKpiStatus.gates.overallPass ? '✅ PASS' : '❌ FAIL'}**`,
            '',
            '| KPI | Current | Target | Status |',
            '| --- | --- | --- | --- |',
            `| Route Precision | ${formatPercentValue(stabilizationRoutePrecision)} | >= ${studioStabilizationKpiStatus.thresholds.routePrecisionMin}% | ${studioStabilizationKpiStatus.gates.routePrecisionPass ? '✅' : '❌'} |`,
            `| Verify Path Completion | ${formatPercentValue(stabilizationVerifyPathCompletion)} | >= ${studioStabilizationKpiStatus.thresholds.verifyPathCompletionRateMin}% | ${studioStabilizationKpiStatus.gates.verifyPathCompletionRatePass ? '✅' : '❌'} |`,
            `| False Confidence | ${formatPercentValue(stabilizationFalseConfidence)} | <= ${studioStabilizationKpiStatus.thresholds.falseConfidenceRateMax}% | ${studioStabilizationKpiStatus.gates.falseConfidenceRatePass ? '✅' : '❌'} |`,
            `| Rollback Recovery | ${formatPercentValue(stabilizationRollbackRecovery)} | >= ${studioStabilizationKpiStatus.thresholds.rollbackRecoverySuccessRateMin}% | ${studioStabilizationKpiStatus.gates.rollbackRecoverySuccessRatePass ? '✅' : '❌'} |`,
            `| Repeat Verified Resolution | ${formatPercentValue(stabilizationRepeatResolution)} | >= ${studioStabilizationKpiStatus.thresholds.repeatVerifiedResolutionRateMin}% | ${studioStabilizationKpiStatus.gates.repeatVerifiedResolutionRatePass ? '✅' : '❌'} |`,
            `| Repeat with Artifact (Cohort) | ${formatPercentValue(stabilizationRepeatWithArtifact)} | >= ${studioStabilizationKpiStatus.thresholds.repeatVerifiedResolutionRateMin}% | ${studioStabilizationKpiStatus.gates.repeatVerifiedResolutionRatePass ? '✅' : '❌'} |`,
            '',
            '## Route Precision Breakdown',
            '',
            `**Non-success share: ${fallbackMixData.nonSuccessShare}%**`,
            '',
            fallbackMixData.table,
            '',
            '',
            '## Verify Path Miss Reasons',
            '',
            `- Verify-required actions: ${studioStabilizationKpiStatus.metrics.verifyRequired}`,
            `- Verify-path present: ${studioStabilizationKpiStatus.metrics.verifyPathPresent}`,
            `- Verify-incomplete warnings: ${Math.max(studioStabilizationKpiStatus.metrics.verifyRequired - studioStabilizationKpiStatus.metrics.verifyPathPresent, 0)}`,
            `- Verify-path completion rate: ${formatPercentValue(stabilizationVerifyPathCompletion)}`,
            '',
            verifyPathMissData.listMarkdown || 'No miss data available.',
            '',
            verifyPathMissData.topReason
                ? `**Top miss reason: ${verifyPathMissData.topReason.reason} (${verifyPathMissData.topReason.share}% of misses)**`
                : '**No miss patterns detected.**',
            '',
            '',
            '## Recovery Class Breakdown',
            '',
            `- Verify failures: ${studioStabilizationKpiStatus.metrics.verifyFailed}`,
            `- False confidence rate: ${formatPercentValue(stabilizationFalseConfidence)}`,
            `- Rollback attempts: ${studioStabilizationKpiStatus.metrics.rollbackAttempted}`,
            `- Rollback recovery success rate: ${formatPercentValue(stabilizationRollbackRecovery)}`,
            '',
            `Total recovery attempts: ${totalRecoveryAttempts}`,
            '',
            '| Recovery Class | Count | Share |',
            '| --- | ---: | ---: |',
            `| auto_rollback (high confidence) | ${stabilizationRecoveryClassBreakdown?.auto_rollback ?? 0} | ${totalRecoveryAttempts > 0 ? Math.round(((stabilizationRecoveryClassBreakdown?.auto_rollback ?? 0) / totalRecoveryAttempts) * 100) : 0}% |`,
            `| manual_recovery (assisted) | ${stabilizationRecoveryClassBreakdown?.manual_recovery ?? 0} | ${totalRecoveryAttempts > 0 ? Math.round(((stabilizationRecoveryClassBreakdown?.manual_recovery ?? 0) / totalRecoveryAttempts) * 100) : 0}% |`,
            `| unspecified (unknown) | ${stabilizationRecoveryClassBreakdown?.unspecified ?? 0} | ${totalRecoveryAttempts > 0 ? Math.round(((stabilizationRecoveryClassBreakdown?.unspecified ?? 0) / totalRecoveryAttempts) * 100) : 0}% |`,
            '',
            '',
            '## Repeat Resolution & Artifact Readiness',
            '',
            `- Repeated incidents detected: ${studioStabilizationKpiStatus.metrics.repeatedIncidentDetected}`,
            `- Repeat incidents verified-resolved: ${studioStabilizationKpiStatus.metrics.repeatVerifiedResolved}`,
            `- Repeat incidents with artifact ready: ${studioStabilizationKpiStatus.metrics.repeatVerifiedWithArtifactReady ?? 0}`,
            `- S05 resolution rate: ${formatPercentValue(stabilizationRepeatResolution)}`,
            `- S05-Cohort artifact rate: ${formatPercentValue(stabilizationRepeatWithArtifact)}`,
            '',
            '---',
            '',
            '> **For weekly runbook:** Use fallback-mix non-success share and top verify-path miss reason to guide remediation priorities.',
            '> **For release gate:** Both 7-day and 30-day snapshots must show all KPIs passing before enterprise claim.',
        ].join('\n');
    }, [
        studioStabilizationKpiStatus,
        stabilizationRoutePrecision,
        stabilizationVerifyPathCompletion,
        stabilizationFalseConfidence,
        stabilizationRollbackRecovery,
        stabilizationRepeatResolution,
        stabilizationRepeatWithArtifact,
        stabilizationFallbackMix,
        stabilizationRecoveryClassBreakdown,
        stabilizationVerifyPathReasonTop,
    ]);
    const stabilizationSnapshotJson = useMemo(() => {
        if (!studioStabilizationKpiStatus) {
            return '';
        }

        const fallbackMixData = formatFallbackMixBreakdown(stabilizationFallbackMix);
        const verifyPathMissData = formatVerifyPathMissReasons(stabilizationVerifyPathReasonTop);
        const totalRecoveryAttempts = (stabilizationRecoveryClassBreakdown?.auto_rollback ?? 0) +
            (stabilizationRecoveryClassBreakdown?.manual_recovery ?? 0) +
            (stabilizationRecoveryClassBreakdown?.unspecified ?? 0);

        return JSON.stringify(
            {
                version: '1.0',
                generatedAt: new Date().toISOString(),
                purpose: 'Enterprise Stabilization Gate evidence snapshot for weekly KPI dashboard and release decisions',
                workspacePath: studioStabilizationKpiStatus.workspacePath,
                window: {
                    timeWindow: studioStabilizationKpiStatus.timeWindow,
                    windowStartAt: studioStabilizationKpiStatus.windowStartAt,
                    windowEndAt: studioStabilizationKpiStatus.windowEndAt,
                },
                kpiScorecard: {
                    overallPass: studioStabilizationKpiStatus.gates.overallPass,
                    gates: studioStabilizationKpiStatus.gates,
                },
                thresholds: studioStabilizationKpiStatus.thresholds,
                metrics: studioStabilizationKpiStatus.metrics,
                operationalMetrics: {
                    routePrecisionFallbackMix: {
                        breakdown: stabilizationFallbackMix,
                        nonSuccessShare: fallbackMixData.nonSuccessShare,
                        interpretation: fallbackMixData.nonSuccessShare > 20
                            ? '⚠️ Non-success share exceeds 20% threshold; requires remediation'
                            : '✅ Non-success share within target',
                    },
                    verifyPathMisses: {
                        topReasons: stabilizationVerifyPathReasonTop,
                        topReason: verifyPathMissData.topReason,
                        interpretation: verifyPathMissData.topReason && verifyPathMissData.topReason.share > 30
                            ? '⚠️ Top miss reason exceeds 30% of misses; requires wording/checklist improvement'
                            : '✅ Miss pattern distribution reasonable',
                    },
                    recoveryClassMix: {
                        breakdown: stabilizationRecoveryClassBreakdown,
                        totalAttempts: totalRecoveryAttempts,
                        autoRollbackShare: totalRecoveryAttempts > 0
                            ? Math.round(((stabilizationRecoveryClassBreakdown?.auto_rollback ?? 0) / totalRecoveryAttempts) * 100)
                            : 0,
                        interpretation: (stabilizationRecoveryClassBreakdown?.manual_recovery ?? 0) > (totalRecoveryAttempts * 0.3)
                            ? '⚠️ Manual recovery exceeds 30% of attempts; automation UX needs review'
                            : '✅ Auto-rollback dominates recovery mix',
                    },
                    repeatResolutionCohort: {
                        repeatedIncidentsDetected: studioStabilizationKpiStatus.metrics.repeatedIncidentDetected,
                        repeatVerifiedResolved: studioStabilizationKpiStatus.metrics.repeatVerifiedResolved,
                        repeatWithArtifactReady: studioStabilizationKpiStatus.metrics.repeatVerifiedWithArtifactReady ?? 0,
                        cohortGapPercent: studioStabilizationKpiStatus.metrics.repeatedIncidentDetected > 0
                            ? Math.round(((studioStabilizationKpiStatus.metrics.repeatedIncidentDetected - (studioStabilizationKpiStatus.metrics.repeatVerifiedWithArtifactReady ?? 0)) / studioStabilizationKpiStatus.metrics.repeatedIncidentDetected) * 100)
                            : 0,
                        interpretation: (studioStabilizationKpiStatus.metrics.repeatVerifiedWithArtifactReady ?? 0) < (studioStabilizationKpiStatus.metrics.repeatedIncidentDetected * 0.7)
                            ? '⚠️ Artifact cohort gap >30%; debug replay capture'
                            : '✅ Most repeats have artifact backing',
                    },
                },
                releaseGateDecision: {
                    canClaim: studioStabilizationKpiStatus.gates.overallPass &&
                        fallbackMixData.nonSuccessShare <= 20 &&
                        (!verifyPathMissData.topReason || verifyPathMissData.topReason.share <= 30),
                    blockers: [
                        !studioStabilizationKpiStatus.gates.overallPass ? 'KPI gates do not all pass' : null,
                        fallbackMixData.nonSuccessShare > 20 ? `Fallback non-success share (${fallbackMixData.nonSuccessShare}%) exceeds 20%` : null,
                        verifyPathMissData.topReason && verifyPathMissData.topReason.share > 30
                            ? `Top verify-path miss (${verifyPathMissData.topReason.reason}: ${verifyPathMissData.topReason.share}%) exceeds 30%`
                            : null,
                    ].filter((b): b is string => b !== null),
                },
            },
            null,
            2
        );
    }, [studioStabilizationKpiStatus, stabilizationFallbackMix, stabilizationVerifyPathReasonTop, stabilizationRecoveryClassBreakdown]);
    const stabilizationDashboardSection51Markdown = useMemo(() => {
        if (stabilizationSnapshotJson) {
            return buildDashboardSection51FromSnapshotJson(
                stabilizationSnapshotJson,
                stabilizationWindowLabel
            );
        }
        if (!stabilizationSnapshotMarkdown) {
            return '';
        }
        return buildDashboardSection51FromSnapshotMarkdown(
            stabilizationSnapshotMarkdown,
            stabilizationWindowLabel
        );
    }, [stabilizationSnapshotJson, stabilizationSnapshotMarkdown, stabilizationWindowLabel]);
    const releaseDecisionAccuracy = releaseReadinessValidationKpiStatus?.metrics.releaseReadinessDecisionAccuracy ?? null;
    const noGoPreventedIncidentRate = releaseReadinessValidationKpiStatus?.metrics.noGoPreventedIncidentRate ?? null;
    const releaseDecisionAccuracyMeter = Math.max(0, Math.min(100, releaseDecisionAccuracy ?? 0));
    const noGoPreventedIncidentMeter = Math.max(0, Math.min(100, noGoPreventedIncidentRate ?? 0));
    const loopReplayToResolutionRate = verifiedOutcomeLoopStatus?.conversionRates.replayToResolutionRate ?? null;
    const loopReleaseDecisionAccuracy = verifiedOutcomeLoopStatus?.conversionRates.releaseDecisionAccuracy ?? null;
    const loopReplayMeter = Math.max(0, Math.min(100, loopReplayToResolutionRate ?? 0));
    const loopReleaseMeter = Math.max(0, Math.min(100, loopReleaseDecisionAccuracy ?? 0));

    const studioEventLabelMap: Record<string, string> = {
        'workspai.studio.next_action_clicked': 'Actions triggered',
        'workspai.studio.loop_started': 'Sessions started',
        'workspai.studio.verified_outcome_ready_for_artifact': 'Verified outcomes ready',
        'workspai.studio.abandoned': 'Closed without fix',
        'workspai.studio.cta_verify': 'Verify runs',
        'workspai.studio.cta_ask': 'Ask AI queries',
        'workspai.studio.cta_run': 'Run actions',
    };

    const commandLabelMap: Record<string, string> = {
        'workspai.aiTerminalBridge': 'Terminal Bridge runs',
        'workspai.aiFixPreviewLite': 'Fix Preview actions',
        'workspai.aiChangeImpactLite': 'Impact analysis runs',
        'workspai.aiWorkspaceMemoryWizard': 'Memory updates',
        'workspai.aiRecipePacks': 'Recipe workflows',
        'workspai.aiQuickActions': 'Quick action picks',
    };

    const allUsage = commandSummary?.commandUsage ?? [];

    const studioActivityItems = allUsage
        .filter((item) => item.command.startsWith('workspai.studio.') && studioEventLabelMap[item.command])
        .slice(0, 3)
        .map((item) => ({ label: studioEventLabelMap[item.command], count: item.count, command: item.command }));

    const timelineItems = allUsage
        .filter((item) => !item.command.startsWith('workspai.studio.'))
        .slice(0, 3)
        .map((item) => ({
            label: commandLabelMap[item.command] ?? item.command.replace(/^workspai\./, ''),
            count: item.count,
            command: item.command,
        }));

    const verifyPackReady = Boolean(
        chatBrainActionResult?.verifyCommandPack &&
        chatBrainActionResult.verifyCommandPack.readiness === 'ready' &&
        (chatBrainActionResult.verifyCommandPack.blockedReasons.length ?? 0) === 0 &&
        chatBrainActionResult.verifyCommandPack.commands.some((entry) => entry.required)
    );

    const verifySteps = [
        {
            label: 'Context packet prepared',
            // Mirror the workspaceReady condition from phaseContext (props available here)
            done: Boolean(
                workspaceName ||
                chatBrainSystemGraphSnapshot?.workspacePath ||
                doctorSummary?.workspaceName ||
                commandSummary?.totalEvents
            ),
        },
        { label: 'Patch candidate scored', done: !aiUnavailable && (isAnalyzing || conversationTurns > 0) },
        { label: 'Risk and blast-radius check', done: !aiUnavailable && conversationTurns > 1 },
        {
            label: 'Deterministic validation ready',
            // Mirror the verifyReady condition from phaseContext (no latestStructuredResponse yet
            // at this point, so use actionResult and verifyCommandPack as the signal sources)
            done: Boolean(
                verifyPackReady
            ),
        },
    ];

    const sortedBoardActions = useMemo(() => {
        const rawActions = chatBrainBoard?.actions || [];
        const idCounts = new Map<string, number>();
        const normalizedActions = rawActions.map((action) => {
            const matrixActionId = resolveIncidentCliActionIdByActionType(action.actionType, hasProjectSelected);
            const linkedCliAction = resolveIncidentCliActionByActionType(action.actionType, hasProjectSelected);
            const baseId = matrixActionId ? `matrix:${matrixActionId}` : action.id;
            const duplicateCount = idCounts.get(baseId) ?? 0;
            idCounts.set(baseId, duplicateCount + 1);
            const stableId = duplicateCount > 0 ? `${baseId}:${duplicateCount + 1}` : baseId;

            return {
                ...action,
                id: stableId,
                label: linkedCliAction?.label || action.label,
            };
        });

        return [...normalizedActions].sort((a, b) => {
            const byRisk = riskPriority(a.riskLevel) - riskPriority(b.riskLevel);
            if (byRisk !== 0) {
                return byRisk;
            }
            return a.label.localeCompare(b.label);
        });
    }, [chatBrainBoard?.actions, hasProjectSelected]);
    const primaryBoardAction = sortedBoardActions[0];
    const rawSecondaryBoardActions = sortedBoardActions.slice(1);
    const advancedBoardActionLabels = sortedBoardActions
        .filter(
            (action) =>
                action.actionType === 'release-readiness-commander' ||
                riskTone(action.riskLevel) === 'critical'
        )
        .map((action) => action.label);
    const modePresentation = primaryBoardAction
        ? applyIncidentUxModePolicy(activeUserMode, {
            primaryCta: primaryBoardAction.label,
            secondaryCtaLabels: rawSecondaryBoardActions.map((a) => a.label),
            advancedActionLabels: advancedBoardActionLabels,
            plainRationale: actionExecutionHint(primaryBoardAction.actionType),
            conciseRationale:
                primaryBoardAction.riskLevel
                    ? `${primaryBoardAction.riskLevel} risk path: validate impact and verify before completion.`
                    : undefined,
            evidenceItems: sortedBoardActions
                .slice(0, 4)
                .map((action) => `${action.label} (${action.riskLevel || 'unknown'} risk)`),
        })
        : null;
    const modeVisibleBoardActions = modePresentation
        ? sortedBoardActions.filter((a) => modePresentation.visibleCtaLabels.includes(a.label))
        : sortedBoardActions;
    const secondaryBoardActions = modePresentation
        ? modeVisibleBoardActions.filter((a) => primaryBoardAction && a.id !== primaryBoardAction.id)
        : rawSecondaryBoardActions;
    const primaryBoardGuardHint = primaryBoardAction ? getBoardActionGuardHint(primaryBoardAction) : null;
    const boardGuardHint = useMemo(() => {
        for (const action of sortedBoardActions) {
            const hint = getBoardActionGuardHint(action);
            if (hint) {
                return hint;
            }
        }
        return null;
    }, [sortedBoardActions]);
    const actionResultPresentation = chatBrainActionResult
        ? getActionResultPresentation(chatBrainActionResult)
        : null;
    const sidebarIssuePreviewLimit = activeUserMode === 'guided' ? 2 : 4;
    const visibleSidebarIssues =
        activeUserMode === 'guided' && !showAllSidebarIssues
            ? sortedBoardActions.slice(0, sidebarIssuePreviewLimit)
            : sortedBoardActions;
    const showSidebarIssuesToggle =
        activeUserMode === 'guided' && sortedBoardActions.length > sidebarIssuePreviewLimit;

    useEffect(() => {
        if (activeUserMode !== 'guided' && showAllSidebarIssues) {
            setShowAllSidebarIssues(false);
        }
    }, [activeUserMode, showAllSidebarIssues]);

    const latestAssistantEntry = useMemo(() => {
        const history = chatBrainHistory || [];
        for (let index = history.length - 1; index >= 0; index -= 1) {
            if (history[index].role === 'assistant' && history[index].text.trim()) {
                return history[index];
            }
        }
        if (chatBrainStreamText?.trim()) {
            return {
                id: 'streaming-assistant',
                role: 'assistant' as const,
                text: chatBrainStreamText,
                timestamp: Date.now(),
            };
        }
        return null;
    }, [chatBrainHistory, chatBrainStreamText]);
    const recentConversationEntries = useMemo(() => (chatBrainHistory || []).slice(-12), [chatBrainHistory]);
    const latestStructuredResponse = useMemo(
        () => (latestAssistantEntry ? parseStructuredResponse(latestAssistantEntry.text) : null),
        [latestAssistantEntry]
    );
    // ── telemetry gate signals ─────────────────────────────────────────────────
    // These are derived once here so phaseContext can use them as precise boolean gates.
    // For workspace scope: hard gate pass AND route precision pass are required as an evidence
    // floor before plan/verify phases advance.
    // For project scope: same gates but scoped evidence is sufficient.
    const telemetryHardGatePass = studioHardGateStatus?.gates.overallPass === true;
    const telemetryRoutePrecisionPass = studioStabilizationKpiStatus?.gates.routePrecisionPass === true;
    const telemetryVerifyPathPass = studioStabilizationKpiStatus?.gates.verifyPathCompletionRatePass === true;
    // verifyCommandPack qualityScore >= 60 is required to claim verifyReady via pack path.
    const verifyPackQualityAdequate =
        (chatBrainActionResult?.verifyCommandPack?.qualityScore ?? 0) >= 60;
    // workspace scope: verified outcomes in telemetry count as prior resolution evidence.
    const workspaceHasPriorResolutions =
        !isProjectAnalysisScope &&
        (verifiedOutcomeLoopStatus?.verifiedOutcomes ?? 0) > 0;

    const phaseContext = useMemo(
        () => ({
            workspaceReady: Boolean(
                workspaceName ||
                chatBrainSystemGraphSnapshot?.workspacePath ||
                doctorSummary?.workspaceName ||
                commandSummary?.totalEvents
            ),
            // diagnosisReady: require at least one real evidence signal.
            // Telemetry hard gate pass (when available) acts as a corroborating signal;
            // it does NOT block diagnosis if only local evidence is present.
            diagnosisReady: Boolean(
                chatBrainActionResult?.diagnosis ||
                chatBrainImpactAssessment ||
                doctorSummary?.generatedAt ||
                (doctorSummary && doctorSummary.issueCount >= 0) ||
                telemetryHardGatePass
            ),
            // planReady: board actions + diagnosis evidence are required.
            // When telemetry gates are available, route precision pass strengthens the signal
            // so the plan phase only advances when the routing system is behaving correctly.
            planReady: Boolean(
                sortedBoardActions.length > 0 &&
                (chatBrainActionResult?.diagnosis ||
                    chatBrainImpactAssessment ||
                    doctorSummary?.generatedAt ||
                    (doctorSummary && doctorSummary.issueCount >= 0)) &&
                // If telemetry gate data is present, route precision must also pass.
                // If no telemetry data yet, do not block the plan phase.
                (studioStabilizationKpiStatus === null || telemetryRoutePrecisionPass)
            ),
            // verifyReady: structured verify command, or a quality-adequate pack with no blockers.
            // Telemetry verify path gate (when present) acts as a corroborating floor:
            // if it explicitly fails (false) and there is no local verify evidence, block the phase.
            verifyReady: Boolean(
                latestStructuredResponse?.verifyCommand ||
                (chatBrainActionResult?.verifyCommandPack?.commands.some((entry) => entry.required) &&
                    (chatBrainActionResult?.verifyCommandPack?.blockedReasons.length ?? 0) === 0 &&
                    verifyPackQualityAdequate) ||
                verifyPackReady ||
                // Telemetry verify path pass is sufficient when no local pack exists yet.
                (telemetryVerifyPathPass && studioStabilizationKpiStatus !== null)
            ),
            // priorResolutionAvailable: direct resolved flag OR workspace telemetry evidence.
            priorResolutionAvailable: Boolean(
                incidentResume?.resolved ||
                workspaceHasPriorResolutions
            ),
        }),
        [
            workspaceName,
            chatBrainSystemGraphSnapshot?.workspacePath,
            doctorSummary?.workspaceName,
            doctorSummary?.generatedAt,
            doctorSummary?.issueCount,
            commandSummary?.totalEvents,
            chatBrainActionResult?.diagnosis,
            chatBrainActionResult?.verifyCommandPack?.commands.length,
            chatBrainActionResult?.verifyCommandPack?.readiness,
            chatBrainActionResult?.verifyCommandPack?.blockedReasons.length,
            chatBrainActionResult?.verifyCommandPack?.qualityScore,
            chatBrainImpactAssessment,
            sortedBoardActions.length,
            latestStructuredResponse?.verifyCommand,
            incidentResume?.resolved,
            telemetryHardGatePass,
            telemetryRoutePrecisionPass,
            telemetryVerifyPathPass,
            verifyPackQualityAdequate,
            studioStabilizationKpiStatus,
            verifyPackReady,
            workspaceHasPriorResolutions,
        ]
    );

    const phaseProgress = useMemo(() => {
        const rawSteps = [
            {
                key: 'detect',
                label: 'Detect',
                done: phaseContext.workspaceReady,
                cue: doctorSummary?.generatedAt
                    ? `Doctor ${formatRelativeCue(doctorSummary.generatedAt)}`
                    : getPhaseNextAction('detect', phaseContext).primaryAction,
            },
            {
                key: 'diagnose',
                label: 'Diagnose',
                done: phaseContext.diagnosisReady,
                cue: isAnalyzing
                    ? 'AI reading context'
                    : getPhaseNextAction('diagnose', phaseContext).primaryAction,
            },
            {
                key: 'plan',
                label: 'Plan',
                done: phaseContext.planReady,
                cue: getPhaseNextAction('plan', phaseContext).primaryAction,
            },
            {
                key: 'verify',
                label: 'Verify',
                done: phaseContext.verifyReady,
                cue: getPhaseNextAction('verify', phaseContext).primaryAction,
            },
            {
                key: 'learn',
                label: 'Learn',
                done: phaseContext.priorResolutionAvailable,
                cue: getPhaseNextAction('learn', phaseContext).primaryAction,
            },
        ];
        // Enforce sequential progression immutably: a step is only done when all
        // prior steps are also done. Spread to avoid mutating rawStep objects.
        let allPriorDone = true;
        const steps = rawSteps.map((step) => {
            if (!allPriorDone) {
                return { ...step, done: false };
            }
            if (!step.done) {
                allPriorDone = false;
            }
            return step;
        });

        const activeIndex = Math.max(0, steps.findIndex((step) => !step.done));
        return { steps, activeIndex: activeIndex === -1 ? steps.length - 1 : activeIndex };
    }, [
        chatBrainActionResult?.success,
        commandSummary?.totalEvents,
        conversationTurns,
        doctorSummary?.generatedAt,
        isAnalyzing,
        latestStructuredResponse?.verifyCommand,
        onboardingSummary?.followupClicked,
        phaseContext,
    ]);

    useEffect(() => {
        if (!recentConversationEntries.length) {
            return;
        }

        const latestEntryId = recentConversationEntries[recentConversationEntries.length - 1]?.id;
        if (!latestEntryId) {
            return;
        }

        setExpandedConversationIds(() => {
            const nextState: Record<string, boolean> = {};
            recentConversationEntries.forEach((entry) => {
                nextState[entry.id] = entry.id === latestEntryId;
            });
            return nextState;
        });
    }, [recentConversationEntries]);

    const activePhase = phaseProgress.steps[phaseProgress.activeIndex]?.label ?? 'Detect';
    const deterministicFallbackAction = getPhaseNextAction(
        phaseProgress.steps[phaseProgress.activeIndex]?.key as
        | 'detect'
        | 'diagnose'
        | 'plan'
        | 'verify'
        | 'learn',
        phaseContext
    ).primaryAction;
    const nextActionLabel = sortedBoardActions[0]?.label ?? deterministicFallbackAction;
    const summaryTitle = aiUnavailable
        ? 'AI is temporarily unavailable'
        : isAnalyzing
            ? `AI is analyzing this ${isProjectAnalysisScope ? 'project' : 'workspace'}`
            : sortedBoardActions.length > 0
                ? 'AI found the next actions for you'
                : `Ask AI to inspect the current ${isProjectAnalysisScope ? 'project' : 'workspace'}`;
    const summaryText = aiUnavailable
        ? 'Switch to deterministic checks now, then retry AI when the connection recovers.'
        : isAnalyzing
            ? 'Stay here. The conversation and action list will update in this Studio.'
            : sortedBoardActions.length > 0
                ? `Current phase: ${activePhase}. Start with "${nextActionLabel}" or ask a follow-up below.`
                : isProjectAnalysisScope
                    ? 'Use the input below to debug this project, inspect module risk, or verify a targeted fix path.'
                    : 'Use the input below to analyze cross-project risk, shared failures, and workspace-level priorities.';
    const modeHint =
        activeUserMode === 'guided'
            ? 'Guided mode: one best next action, minimal cognitive load.'
            : activeUserMode === 'expert'
                ? 'Expert mode: broader action surface with faster branching.'
                : 'Standard mode: balanced guidance and execution options.';

    const guidedStepHints: Record<string, string> = {
        Detect: 'Doctor has scanned your workspace. Review the issues below and pick one to fix.',
        Diagnose: 'Ask AI to explain what is wrong. Describe the error or paste a log.',
        Plan: 'AI has a fix plan. Pick one action to execute from "Do this next".',
        Verify: 'Run the verify command to confirm the fix worked before moving on.',
        Learn: 'Save this fix pattern so future incidents resolve faster.',
    };
    const guidedStepHint = guidedStepHints[activePhase] ?? 'Follow the steps above to resolve this incident.';
    const compactStats = [
        {
            label: 'Current phase',
            value: activePhase,
        },
        {
            label: 'Open actions',
            value: String(sortedBoardActions.length),
        },
        {
            label: 'Last activity',
            value: commandSummary?.lastCommandAt
                ? new Date(commandSummary.lastCommandAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Waiting',
        },
    ];

    const frameworkSignal = doctorSummary?.frameworks?.[0]?.name?.trim() || null;
    const frameworkSource = frameworkSignal
        ? 'doctorSummary.frameworks[0]'
        : chatBrainSystemGraphSnapshot?.summary?.supportedTopology
            ? 'systemGraphSnapshot.summary.supportedTopology'
            : 'fallback: unknown';
    const frameworkLabel = frameworkSignal || chatBrainSystemGraphSnapshot?.summary?.supportedTopology || 'Unknown';

    const startingNode = (chatBrainSystemGraphSnapshot?.nodes || []).find((node) =>
        Boolean(node.filePath || node.label)
    );
    const startingPoint = startingNode?.filePath || startingNode?.label || null;
    const startingPointSource = startingPoint
        ? 'systemGraphSnapshot.nodes'
        : 'fallback: no-entry-point-detected';

    const liteRiskItems = sortedBoardActions.slice(0, 3).map((action) => ({
        label: action.label,
        risk: action.riskLevel || 'unknown',
    }));
    const liteRiskSource = liteRiskItems.length
        ? 'chatBrainBoard.actions (risk-priority sort)'
        : 'fallback: no-action-board';

    const litePrimaryActionSourceDefault = primaryBoardAction
        ? 'chatBrainBoard.actions[0]'
        : 'fallback: guided-next-query';
    const litePrimaryActionLabel = primaryBoardAction?.label || 'Ask AI for the single safest next step';

    const releaseReadinessBlockers =
        chatBrainActionResult?.releaseReadinessCommander?.decision === 'no-go'
            ? chatBrainActionResult.releaseReadinessCommander.blockingReasons
            : [];
    const verifyPackBlockers = chatBrainActionResult?.verifyCommandPack?.blockedReasons ?? [];
    const stabilizationBlockers: string[] = [];
    if (studioStabilizationKpiStatus?.gates.verifyPathCompletionRatePass === false) {
        stabilizationBlockers.push('Verify-path completion is below threshold');
    }
    if (studioStabilizationKpiStatus?.gates.falseConfidenceRatePass === false) {
        stabilizationBlockers.push('False-confidence rate is above threshold');
    }
    if (studioStabilizationKpiStatus?.gates.rollbackRecoverySuccessRatePass === false) {
        stabilizationBlockers.push('Rollback recovery is below threshold');
    }
    if (studioStabilizationKpiStatus?.gates.repeatVerifiedResolutionRatePass === false) {
        stabilizationBlockers.push('Repeat verified resolution is below threshold');
    }

    const liteHardBlockReasons = Array.from(
        new Set(
            [...releaseReadinessBlockers, ...verifyPackBlockers, ...stabilizationBlockers]
                .map((reason) => reason.trim())
                .filter((reason) => reason.length > 0)
                .map((reason) => normalizeBlockerReason(reason))
        )
    );
    const liteBlockerSeverityMap = new Map<string, BlockerSeverity>();
    liteHardBlockReasons.forEach((blocker) => {
        liteBlockerSeverityMap.set(
            blocker,
            classifyBlockerSeverity(blocker, releaseReadinessBlockers, verifyPackBlockers)
        );
    });
    const liteReleaseNoGo =
        chatBrainActionResult?.releaseReadinessCommander?.decision === 'no-go' ||
        liteHardBlockReasons.length > 0;
    const liteStatusLabel = liteReleaseNoGo ? 'NO-GO' : 'READY';
    const liteStatusSummary = liteReleaseNoGo
        ? `Blocked by ${liteHardBlockReasons.length} signal${liteHardBlockReasons.length === 1 ? '' : 's'}`
        : 'No hard blockers detected in current evidence';
    const liteTopBlocker = liteHardBlockReasons[0] ?? null;
    const blockerAwarePrimaryActionLabel = liteTopBlocker
        ? `Resolve blocker: ${liteTopBlocker}`
        : litePrimaryActionLabel;
    const litePrimaryActionSource = liteTopBlocker
        ? 'derived:blocker-priority'
        : litePrimaryActionSourceDefault;

    const fallbackVerifyCommand = hasProjectSelected
        ? 'rapidkit doctor project'
        : 'rapidkit doctor workspace';
    const requiredVerifyCommands = (chatBrainActionResult?.verifyCommandPack?.commands ?? []).filter(
        (entry) => entry.required
    );
    const liteVerifyCommand = liteReleaseNoGo && requiredVerifyCommands.length > 0
        ? normalizeCommandText(requiredVerifyCommands[0].command)
        : latestStructuredResponse?.verifyCommand
            ? normalizeCommandText(latestStructuredResponse.verifyCommand)
            : fallbackVerifyCommand;
    const liteVerifySource = latestStructuredResponse?.verifyCommand
        ? 'latestStructuredResponse.verifyCommand'
        : liteReleaseNoGo && requiredVerifyCommands.length > 0
            ? 'verifyCommandPack.commands[required=true][0]'
            : hasProjectSelected
                ? 'default: rapidkit doctor project'
                : 'default: rapidkit doctor workspace';

    const runLitePrimaryAction = () => {
        if (liteTopBlocker) {
            if (requiredVerifyCommands.length > 0) {
                runCommand(liteVerifyCommand);
                return;
            }

            const blockerQuery = `Inspect this blocker and propose one deterministic remediation command: ${liteTopBlocker}`;
            setLastUserQuery(blockerQuery);
            onChatBrainQuery?.(blockerQuery);
            return;
        }

        if (primaryBoardAction) {
            onChatBrainExecuteAction?.(primaryBoardAction.actionType, primaryBoardAction.id);
            return;
        }

        const fallbackQuery = deterministicFallbackAction;
        setLastUserQuery(fallbackQuery);
        onChatBrainQuery?.(fallbackQuery);
    };

    const focusNarrative = latestStructuredResponse?.whatHappened || latestAssistantEntry?.text || summaryText;
    const focusReason = latestStructuredResponse?.why || null;
    const focusHeadline = latestStructuredResponse?.whatHappened
        ? `Latest ${isProjectAnalysisScope ? 'project' : 'workspace'} diagnosis`
        : summaryTitle;
    const focusTimestamp = latestAssistantEntry?.timestamp
        ? new Date(latestAssistantEntry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Waiting for signal';
    const resumeTimestamp = incidentResume?.lastActivityAt
        ? new Date(incidentResume.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : null;
    const architectureLens = useMemo(
        () => buildIncidentArchitectureLens({
            graphSnapshot: chatBrainSystemGraphSnapshot,
            impactAssessment: chatBrainImpactAssessment,
            predictiveWarning: chatBrainPredictiveWarning,
            releaseGateEvidence: chatBrainReleaseGateEvidence,
        }),
        [
            chatBrainSystemGraphSnapshot,
            chatBrainImpactAssessment,
            chatBrainPredictiveWarning,
            chatBrainReleaseGateEvidence,
        ]
    );
    const architectureNavigator = useMemo(
        () => buildIncidentArchitectureNavigator(architectureLens),
        [architectureLens]
    );
    const graphNodeById = useMemo(() => {
        const index = new Map<string, NonNullable<NormalizedIncidentSystemGraphSnapshotPayload['nodes']>[number]>();
        (chatBrainSystemGraphSnapshot?.nodes || []).forEach((node) => {
            index.set(node.id, node);
        });
        return index;
    }, [chatBrainSystemGraphSnapshot?.nodes]);
    const graphNodeGroups = useMemo(() => {
        const grouped = new Map<string, NonNullable<NormalizedIncidentSystemGraphSnapshotPayload['nodes']>[number][]>();
        (chatBrainSystemGraphSnapshot?.nodes || []).forEach((node) => {
            const key = node.type || 'unknown';
            const bucket = grouped.get(key);
            if (bucket) {
                bucket.push(node);
                return;
            }
            grouped.set(key, [node]);
        });

        return Array.from(grouped.entries())
            .map(([nodeType, nodes]) => ({
                nodeType,
                nodes: [...nodes].sort((left, right) => right.confidence - left.confidence),
            }))
            .sort((left, right) => right.nodes.length - left.nodes.length);
    }, [chatBrainSystemGraphSnapshot?.nodes]);
    const graphEdgeRows = useMemo(() => {
        return (chatBrainSystemGraphSnapshot?.edges || []).map((edge, index) => {
            const sourceNode = graphNodeById.get(edge.sourceId);
            const targetNode = graphNodeById.get(edge.targetId);
            const unresolved = !sourceNode || !targetNode;
            const relation = edge.relation?.trim() || 'related_to';
            const relationKey = relation.toLowerCase();
            const runtimeByRelation =
                relationKey.includes('route') ||
                relationKey.includes('runtime') ||
                relationKey.includes('request') ||
                relationKey.includes('query') ||
                relationKey.includes('handler');
            const runtimeByType =
                Boolean(sourceNode) &&
                Boolean(targetNode) &&
                ['route', 'controller', 'service'].includes(sourceNode!.type) &&
                ['controller', 'service', 'model', 'datastore'].includes(targetNode!.type);

            return {
                id: `edge-${index}`,
                relation,
                relationKey,
                sourceNode,
                targetNode,
                sourceLabel: sourceNode?.label || edge.sourceId,
                targetLabel: targetNode?.label || edge.targetId,
                unresolved,
                runtime: runtimeByRelation || runtimeByType,
            };
        });
    }, [chatBrainSystemGraphSnapshot?.edges, graphNodeById]);
    const graphDependencyEdges = useMemo(
        () => graphEdgeRows.filter((edge) => !edge.unresolved && !edge.runtime),
        [graphEdgeRows]
    );
    const graphRuntimeEdges = useMemo(
        () => graphEdgeRows.filter((edge) => !edge.unresolved && edge.runtime),
        [graphEdgeRows]
    );
    const graphUnresolvedEdges = useMemo(
        () => graphEdgeRows.filter((edge) => edge.unresolved),
        [graphEdgeRows]
    );

    const intentChips = useMemo(() => {
        const chips: IncidentIntentChip[] = [];
        const seen = new Set<string>();

        const addChip = (chip: IncidentIntentChip | null) => {
            if (!chip) {
                return;
            }
            const key = chip.label.trim().toLowerCase();
            if (!key || seen.has(key)) {
                return;
            }
            seen.add(key);
            chips.push(chip);
        };

        if (latestStructuredResponse?.verifyCommand) {
            addChip({
                id: 'verify-command-chip',
                label: 'Run verification now',
                detail: 'Use the verification command from the latest answer to prove the fix actually worked.',
                kind: 'inline-command',
                command: latestStructuredResponse.verifyCommand,
            });
        }

        if (primaryBoardAction) {
            addChip({ ...intentFromBoardAction(primaryBoardAction) });
        }

        secondaryBoardActions.forEach((action) => {
            addChip({ ...intentFromBoardAction(action) });
        });

        if (latestStructuredResponse?.nextCommand) {
            addChip({
                id: 'next-command-chip',
                label: 'Run next command',
                detail: 'Execute the assistant-recommended next step directly from the current diagnosis.',
                kind: 'inline-command',
                command: latestStructuredResponse.nextCommand,
            });
        }

        if (!isProjectAnalysisScope) {
            addChip({
                id: 'workspace-doctor-chip',
                label: 'Run workspace doctor',
                detail: 'Refresh cross-project health evidence before taking a mutating action.',
                kind: 'doctor-checks',
            });
            addChip({
                id: 'workspace-verify-pack-chip',
                label: 'Generate workspace verify pack',
                detail: 'Build deterministic verification commands for all affected services.',
                kind: 'board-action',
                actionType: 'verify-pack-autopilot',
            });
            addChip({
                id: 'workspace-release-readiness-chip',
                label: 'Run release readiness check',
                detail: 'Create a workspace-wide GO or NO-GO decision with evidence.',
                kind: 'board-action',
                actionType: 'release-readiness-commander',
            });
        }

        (chatBrainSuggestedQuestions || []).slice(0, 5).forEach((question, index) => {
            const inferred = intentLabelFromQuestion(question);
            addChip({
                id: `question-chip-${index}`,
                label: inferred.label,
                detail: inferred.detail,
                kind: 'query',
                query: question,
            });
        });

        if (chips.length === 0) {
            if (isProjectAnalysisScope) {
                addChip({
                    id: 'fallback-inspect-logs',
                    label: 'Inspect project logs',
                    detail: 'Start with runtime evidence from this project to reduce guesswork.',
                    kind: 'terminal-bridge',
                });
                addChip({
                    id: 'fallback-preview-fix',
                    label: 'Preview safe project fix',
                    detail: 'Generate a patch proposal before editing this project.',
                    kind: 'fix-preview',
                });
                addChip({
                    id: 'fallback-project-blast-radius',
                    label: 'Check project blast radius',
                    detail: 'Review module and test impact before rollout.',
                    kind: 'change-impact',
                });
            } else {
                addChip({
                    id: 'fallback-workspace-doctor',
                    label: 'Run workspace doctor',
                    detail: 'Collect fresh workspace-wide health evidence before making changes.',
                    kind: 'doctor-checks',
                });
                addChip({
                    id: 'fallback-workspace-verify-pack',
                    label: 'Generate workspace verify pack',
                    detail: 'Create deterministic verify commands across affected projects.',
                    kind: 'board-action',
                    actionType: 'verify-pack-autopilot',
                });
                addChip({
                    id: 'fallback-workspace-blast-radius',
                    label: 'Check cross-project blast radius',
                    detail: 'Map impact propagation before rollout across the workspace.',
                    kind: 'change-impact',
                });
                addChip({
                    id: 'fallback-save-pattern',
                    label: 'Save workspace incident pattern',
                    detail: 'Store the diagnosis path as reusable workspace memory.',
                    kind: 'memory-wizard',
                });
            }
        }

        const maxChips = activeUserMode === 'guided' ? 3 : activeUserMode === 'expert' ? 7 : 5;
        return chips.slice(0, maxChips).map((chip, index) => ({
            ...chip,
            isPrimary: primaryCtaMode === 'single' ? index === 0 : true,
        }));
    }, [
        isProjectAnalysisScope,
        chatBrainSuggestedQuestions,
        latestStructuredResponse?.nextCommand,
        latestStructuredResponse?.verifyCommand,
        primaryBoardAction,
        primaryCtaMode,
        activeUserMode,
        secondaryBoardActions,
    ]);

    const copyCommand = async (raw: string) => {
        const command = normalizeCommandText(raw);
        if (!command) {
            return;
        }
        try {
            await navigator.clipboard.writeText(command);
            setLastCopiedCommand(command);
            window.setTimeout(() => {
                setLastCopiedCommand((prev) => (prev === command ? null : prev));
            }, 1200);
        } catch {
            // ignore clipboard failure in restricted environments
        }
    };

    const copyStabilizationSnapshot = async (
        format: 'markdown' | 'json' | 'dashboard-5-1',
        text: string
    ) => {
        if (!text) {
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            setStabilizationSnapshotCopiedFormat(format);
            window.setTimeout(() => {
                setStabilizationSnapshotCopiedFormat((prev) => (prev === format ? null : prev));
            }, 1400);
        } catch {
            // ignore clipboard failure in restricted environments
        }
    };

    const copyReleaseReadinessShare = async (
        artifact: IncidentReleaseReadinessArtifact,
        format: ReleaseReadinessShareFormat
    ) => {
        const text =
            format === 'approval-note'
                ? buildReleaseReadinessApprovalNoteMarkdown(artifact)
                : format === 'signoff'
                    ? buildReleaseReadinessSignoffMarkdown(artifact)
                    : buildReleaseReadinessArtifactJson(artifact);

        try {
            await navigator.clipboard.writeText(text);
            setReleaseReadinessCopiedFormat(format);
            setReleaseReadinessCopiedArtifactId(artifact.artifactId);
            window.setTimeout(() => {
                setReleaseReadinessCopiedFormat(null);
                setReleaseReadinessCopiedArtifactId(null);
            }, 1400);
        } catch {
            // ignore clipboard failure in restricted environments
        }
    };

    const runCommand = (raw: string) => {
        const command = normalizeCommandText(raw);
        if (!command) {
            return;
        }
        onRunInlineCommand?.(command);
    };

    const runPredictiveSafeAction = () => {
        if (!chatBrainPredictiveWarning) {
            return;
        }

        onPredictiveWarningAccepted?.(
            chatBrainPredictiveWarning.warningId,
            chatBrainPredictiveWarning.telemetrySeed.predictionKey
        );

        const action = chatBrainPredictiveWarning.nextSafeAction;
        if (action) {
            setLastUserQuery(action);
            onChatBrainQuery?.(action);
        }
    };

    const handleArchitectureNavigatorSelect = (item: IncidentArchitectureNavigatorItem) => {
        if (item.action === 'query') {
            setLastUserQuery(item.query);
            onChatBrainQuery?.(item.query);
            return;
        }

        onRevealArchitectureTarget?.({
            path: item.targetPath,
            label: item.label,
            kind: item.kind,
            ...(item.action === 'open' && item.symbolName ? { symbolName: item.symbolName } : {}),
            ...(item.action === 'open' && typeof item.startLine === 'number'
                ? { startLine: item.startLine }
                : {}),
        });
    };

    const revealGraphNodeTarget = (
        node: NonNullable<NormalizedIncidentSystemGraphSnapshotPayload['nodes']>[number] | undefined,
        fallbackKind: 'file' | 'test' | 'node' = 'node'
    ) => {
        if (!node?.filePath) {
            return;
        }

        onRevealArchitectureTarget?.({
            path: node.filePath,
            label: node.label,
            kind: node.type === 'test' ? 'test' : fallbackKind,
            ...(node.symbolName ? { symbolName: node.symbolName } : {}),
            ...(typeof node.startLine === 'number' ? { startLine: node.startLine } : {}),
        });
    };

    const runStudioAction = (
        actionType:
            | 'terminal-bridge'
            | 'fix-preview-lite'
            | 'change-impact-lite'
            | 'workspace-memory-wizard'
            | 'verify-pack-autopilot',
        fallback?: () => void
    ) => {
        if (onChatBrainExecuteAction) {
            onChatBrainExecuteAction(actionType, `intent-${actionType}-${Date.now()}`);
            return;
        }
        fallback?.();
    };

    const handleIntentChipSelect = (chip: IncidentIntentChip) => {
        if (chip.kind === 'query' && chip.query) {
            setLastUserQuery(chip.query);
            onChatBrainQuery?.(chip.query);
            return;
        }
        if (chip.kind === 'inline-command' && chip.command) {
            runCommand(chip.command);
            return;
        }
        if (chip.kind === 'board-action' && chip.actionType) {
            onChatBrainExecuteAction?.(chip.actionType, chip.actionId);
            return;
        }
        if (chip.kind === 'terminal-bridge') {
            runStudioAction('terminal-bridge', onRunTerminalBridge);
            return;
        }
        if (chip.kind === 'fix-preview') {
            runStudioAction('fix-preview-lite', _onRunFixPreview);
            return;
        }
        if (chip.kind === 'change-impact') {
            runStudioAction('change-impact-lite', _onRunChangeImpact);
            return;
        }
        if (chip.kind === 'memory-wizard') {
            runStudioAction('workspace-memory-wizard', _onRunMemoryWizard);
            return;
        }
        if (chip.kind === 'doctor-checks') {
            onRunDoctorChecks();
        }
    };

    const toggleConversationEntry = (entryId: string) => {
        setExpandedConversationIds((prev) => ({
            ...prev,
            [entryId]: !prev[entryId],
        }));
    };

    const jumpToLatest = () => {
        const element = threadRef.current;
        if (!element) {
            return;
        }
        setShouldAutoScrollThread(true);
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    };

    const handleThreadScroll = () => {
        const element = threadRef.current;
        if (!element) {
            return;
        }
        setShouldAutoScrollThread(isThreadNearBottom(element));
    };

    const runVerifyCommandPack = (
        pack: NonNullable<NormalizedIncidentActionResultPayload['verifyCommandPack']>
    ) => {
        const requiredCommands = pack.commands.filter((entry) => entry.required);
        if (requiredCommands.length === 0) {
            return;
        }

        requiredCommands.forEach((entry, index) => {
            window.setTimeout(() => {
                runCommand(entry.command);
            }, index * 80);
        });
    };

    const handleChatSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!commandInput.trim()) {
            return;
        }

        const input = commandInput.trim();
        const slashMap: Record<string, string> = {
            '/debug': 'Run workspace diagnostics and list all detected issues and warnings',
            '/add-service': 'Guide me through adding a new service module to this workspace',
            '/add-route': 'Help me add a new API route — analyze existing patterns first',
            '/new-project': 'Start a new project creation workflow for this workspace',
            '/new-module': 'Scaffold a new module — show available templates first',
        };

        const query = slashMap[input.toLowerCase()] ?? input;
        setLastUserQuery(query);
        onChatBrainQuery?.(query);
        setCommandInput('');
    };

    const renderAssistantText = (text: string) => {
        const renderCommandSection = (label: string, raw: string) => {
            const command = normalizeCommandText(raw);
            if (!command) {
                return null;
            }
            const scope = inferCommandExecutionScope(command, hasProjectSelected);
            const copied = lastCopiedCommand === command;
            const isExecuting = !!(executingCommand && normalizeCommandText(executingCommand) === command);
            return (
                <div>
                    <h5>{label}</h5>
                    <code>{command}</code>
                    <div className={`incident-command-scope incident-command-scope--${scope}`}>
                        {commandScopeLabel(scope)}
                    </div>
                    <div className="incident-command-actions">
                        <button
                            type="button"
                            className="incident-btn"
                            onClick={() => copyCommand(command)}
                            disabled={isExecuting}
                        >
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                        <button
                            type="button"
                            className="incident-btn primary"
                            onClick={() => runCommand(command)}
                            disabled={isExecuting}
                        >
                            {isExecuting ? (
                                <>
                                    <span style={{ display: 'inline-block', marginRight: '6px' }}>●</span>
                                    Running
                                </>
                            ) : (
                                'Run'
                            )}
                        </button>
                    </div>
                </div>
            );
        };

        const structured = parseStructuredResponse(text);
        const hasStructured = Boolean(
            structured.whatHappened || structured.why || structured.nextCommand || structured.verifyCommand
        );

        if (!hasStructured) {
            return <p>{text}</p>;
        }

        return (
            <div className="incident-structured-response">
                {structured.whatHappened ? (
                    <div>
                        <h5>What happened</h5>
                        <p>{structured.whatHappened}</p>
                    </div>
                ) : null}
                {structured.why ? (
                    <div>
                        <h5>Why</h5>
                        <p>{structured.why}</p>
                    </div>
                ) : null}
                {structured.nextCommand ? (
                    renderCommandSection('Next command', structured.nextCommand)
                ) : null}
                {structured.verifyCommand ? (
                    renderCommandSection('Verify command', structured.verifyCommand)
                ) : null}
            </div>
        );
    };

    return (
        <section className={`incident-studio${isMaximized ? ' incident-studio--maximized' : ''}`} aria-label="AI Incident Studio">
            <div className="incident-studio-header">
                <div className="incident-studio-title-wrap">
                    <Sparkles size={14} style={{ color: '#00b894' }} />
                    <div className="incident-studio-title-stack">
                        <span className="incident-studio-title">AI Incident Studio</span>
                        <span className="incident-studio-subtitle">
                            {workspaceName ? workspaceName : 'No active workspace'}
                        </span>
                    </div>
                    <span
                        className={`incident-scope-pill ${analysisScopeType === 'project' ? 'is-project' : 'is-workspace'}`}
                        title={analysisScopePath || analysisScopeLabel || undefined}
                    >
                        {analysisScopeType === 'project' ? 'Project' : 'Workspace'}: {analysisScopeLabel || 'No active scope'}
                    </span>
                </div>
                <div className="incident-studio-status-wrap">
                    <div className="incident-header-group" role="group" aria-label="Studio status">
                        <span className="incident-header-group-label">Status</span>
                        <div className="incident-header-group-controls">
                            <span className={`incident-studio-badge ${aiUnavailable ? 'is-risk' : 'is-ok'}`}>
                                {aiUnavailable ? 'Needs fallback' : isAnalyzing ? 'Analyzing now' : 'Ready'}
                            </span>
                        </div>
                    </div>

                    <div className="incident-header-group incident-header-group--mode" role="group" aria-label="Studio interaction mode">
                        <span className="incident-header-group-label">Mode</span>
                        <div className="incident-header-group-controls">
                            {/* Mode segmented control: Guided / Standard / Expert */}
                            <div className="incident-mode-segmented" role="group" aria-label="Studio interaction mode">
                                {(['guided', 'standard', 'expert'] as const).map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        className={`incident-mode-chip${activeUserMode === m ? ' is-active' : ''}`}
                                        onClick={() => {
                                            setActiveUserMode(m);
                                            onUserModeChange?.(m);
                                        }}
                                        aria-label={
                                            m === 'guided' ? 'Guided mode' : m === 'expert' ? 'Expert mode' : 'Standard mode'
                                        }
                                        title={
                                            m === 'guided'
                                                ? 'Guided — one best next action, minimal cognitive load'
                                                : m === 'expert'
                                                    ? 'Expert — full action surface and evidence breakdown'
                                                    : 'Standard — balanced guidance and execution options'
                                        }
                                    >
                                        {m === 'guided' ? '🧭 Guided' : m === 'expert' ? '⚡ Expert' : '⚙ Standard'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="incident-header-group incident-header-group--view" role="group" aria-label="Studio view controls">
                        <span className="incident-header-group-label">View</span>
                        <div className="incident-header-group-controls">
                            {/* Maximize / Restore toggle */}
                            <button
                                type="button"
                                className="incident-mode-chip incident-view-chip incident-view-chip--maximize"
                                onClick={() => setIsMaximized((v) => !v)}
                                aria-label={isMaximized ? 'Restore Studio to normal size' : 'Maximize Studio to full view'}
                                title={isMaximized ? 'Restore normal size' : 'Maximize — full view'}
                            >
                                {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                                <span className="incident-view-chip__label">{isMaximized ? 'Restore' : 'Maximize'}</span>
                            </button>
                            {/* Lite ↔ Full toggle — always visible so features are never hidden by default */}
                            <button
                                type="button"
                                className={`incident-mode-chip incident-view-chip incident-view-chip--display${isFullDisplay ? ' is-active' : ''}`}
                                onClick={() => onStudioDisplayModeChange?.(isLiteDisplay ? 'full' : 'lite')}
                                aria-label={isLiteDisplay ? 'Switch to full Studio view' : 'Switch to compact Lite view'}
                                title={isLiteDisplay ? 'Switch to full Studio view' : 'Switch to compact Lite view'}
                            >
                                <span className="incident-view-chip__icon" aria-hidden="true">{isLiteDisplay ? '▢' : '⊠'}</span>
                                <span className="incident-view-chip__label">{isLiteDisplay ? 'Full' : 'Lite'}</span>
                            </button>
                        </div>
                    </div>

                    <div className="incident-header-group incident-header-group--automation" role="group" aria-label="Studio automation controls">
                        <span className="incident-header-group-label">Automation</span>
                        <div className="incident-header-group-controls">
                            <button
                                type="button"
                                className={`incident-mode-chip${autoLearningEnabled ? ' is-active' : ''}`}
                                onClick={() => onToggleAutoLearning?.(!autoLearningEnabled)}
                                title="Save reusable fix pattern after verify_passed"
                            >
                                Learning: {autoLearningEnabled ? 'On' : 'Off'}
                            </button>
                            <button
                                type="button"
                                className={`incident-mode-chip incident-mode-refresh${isRefreshing ? ' is-loading' : ''}`}
                                onClick={() => onRefreshData?.()}
                                disabled={isRefreshing}
                                title="Restart analysis for the selected workspace/project"
                            >
                                {isRefreshing ? 'Re-analyzing...' : 'Re-analyze'}
                            </button>
                        </div>
                    </div>

                    <div className="incident-header-group incident-header-group--model" role="group" aria-label="Studio model controls">
                        <span className="incident-header-group-label">Model</span>
                        <div className="incident-header-group-controls">
                            <select
                                className="incident-model-select"
                                value={selectedModelId ?? ''}
                                onChange={(event) => onModelChange?.(event.target.value || null)}
                            >
                                <option value="">Auto</option>
                                {availableModels.map((model) => (
                                    <option key={model.id} value={model.id}>
                                        {model.name} ({model.vendor})
                                    </option>
                                ))}
                            </select>
                            <span className="incident-header-meta">
                                Selected: {selectedModelLabel}
                                {runtimeModelLabel
                                    ? runtimeModelDiffersFromSelection
                                        ? ` | Current run: ${runtimeModelLabel}`
                                        : ''
                                    : ''}
                            </span>
                            <span className="incident-header-meta">Entitlement: {modelEntitlementLabel}</span>
                            <span className="incident-header-meta">Models synced: {refreshLabel || 'not yet'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {isFullDisplay ? (
                <div className="incident-studio-body">
                    <ol className="incident-phase-rail incident-phase-rail--compact" aria-label="Incident lifecycle">
                        {activeUserMode === 'guided' && (
                            <div className="incident-guided-banner">
                                <strong>Step {phaseProgress.activeIndex + 1} of {phaseProgress.steps.length} — {activePhase}</strong>
                                <span>{guidedStepHint}</span>
                            </div>
                        )}

                        {phaseProgress.steps.map((step, index) => {
                            const isActive = index === phaseProgress.activeIndex;
                            const isDone = step.done;

                            return (
                                <li
                                    key={`compact-${step.key}`}
                                    className={`incident-phase-step ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}`}
                                    aria-current={isActive ? 'step' : undefined}
                                >
                                    {index < phaseProgress.steps.length - 1 ? <span className="incident-phase-line" aria-hidden="true" /> : null}
                                    <span className="incident-phase-node-wrap">
                                        <span className="incident-phase-node">{index + 1}</span>
                                        <span className="incident-phase-copy">
                                            <strong>{step.label}</strong>
                                            <small>{isDone ? 'Completed' : isActive ? 'In progress' : 'Queued'}</small>
                                            <em>{step.cue}</em>
                                        </span>
                                    </span>
                                </li>
                            );
                        })}
                    </ol>

                    <div className="incident-studio-grid">
                        <main className="incident-analysis-panel">
                            <ol className="incident-phase-rail incident-phase-rail--desktop" aria-label="Incident lifecycle">
                                {activeUserMode === 'guided' && (
                                    <div className="incident-guided-banner">
                                        <strong>Step {phaseProgress.activeIndex + 1} of {phaseProgress.steps.length} — {activePhase}</strong>
                                        <span>{guidedStepHint}</span>
                                    </div>
                                )}

                                {phaseProgress.steps.map((step, index) => {
                                    const isActive = index === phaseProgress.activeIndex;
                                    const isDone = step.done;

                                    return (
                                        <li
                                            key={step.key}
                                            className={`incident-phase-step ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}`}
                                            aria-current={isActive ? 'step' : undefined}
                                        >
                                            {index < phaseProgress.steps.length - 1 ? <span className="incident-phase-line" aria-hidden="true" /> : null}
                                            <span className="incident-phase-node-wrap">
                                                <span className="incident-phase-node">{index + 1}</span>
                                                <span className="incident-phase-copy">
                                                    <strong>{step.label}</strong>
                                                    <small>{isDone ? 'Completed' : isActive ? 'In progress' : 'Queued'}</small>
                                                    <em>{step.cue}</em>
                                                </span>
                                            </span>
                                        </li>
                                    );
                                })}
                            </ol>

                            <div className="incident-panel-heading incident-panel-heading--brand">
                                <Activity size={13} />
                                <span>{diagnosisPanelTitle}</span>
                                <span className="incident-analysis-status">
                                    {isAnalyzing ? '● Analyzing…' : chatBrainHistory?.length ? `${chatBrainHistory.length} messages` : 'Ready'}
                                </span>
                            </div>

                            <div className="incident-focus-surface">
                                <div className="incident-focus-main">
                                    {incidentResume ? (
                                        <div className="incident-resume-card">
                                            <div className="incident-resume-head">
                                                <span>Session recap</span>
                                                <small>
                                                    {resumeTimestamp || 'Recent'}
                                                    {' · '}
                                                    {incidentResume.turnCount} turn{incidentResume.turnCount === 1 ? '' : 's'}
                                                </small>
                                            </div>
                                            <p>{incidentResume.recap}</p>
                                            <div className="incident-resume-meta">
                                                <span>Phase: {incidentResume.phase}</span>
                                                <span>Actions: {incidentResume.actionCount}</span>
                                                <span>{incidentResume.resolved ? 'Resolved' : 'Open loop'}</span>
                                            </div>
                                            <button
                                                type="button"
                                                className="incident-btn primary"
                                                onClick={() => {
                                                    setLastUserQuery(incidentResume.nextActionQuery);
                                                    onChatBrainQuery?.(incidentResume.nextActionQuery);
                                                }}
                                            >
                                                {incidentResume.nextActionLabel}
                                            </button>
                                        </div>
                                    ) : null}

                                    <details className="incident-collapse incident-focus-diagnosis">
                                        <summary>
                                            <span className="incident-focus-kicker">
                                                <span className="incident-focus-kicker-dot" />
                                                <span>{focusHeadline}</span>
                                            </span>
                                            <small>{focusTimestamp}</small>
                                        </summary>
                                        <div className="incident-focus-copy">
                                            <h3>{latestAssistantEntry ? diagnosisHeadline : `${isProjectAnalysisScope ? 'Project' : 'Workspace'} ready for incident analysis`}</h3>
                                            <p>{focusNarrative}</p>
                                            <small className="incident-mode-hint">{modeHint}</small>
                                            {modePresentation?.rationale ? (
                                                <small className="incident-mode-hint">Mode rationale: {modePresentation.rationale}</small>
                                            ) : null}
                                        </div>
                                        {focusReason ? (
                                            <div className="incident-focus-reason">
                                                <strong>Why this is likely</strong>
                                                <p>{focusReason}</p>
                                            </div>
                                        ) : null}
                                    </details>
                                    {isFullDisplay && architectureLens ? (
                                        <section className={`incident-architecture-lens risk-${architectureLens.riskTone}${architectureLens.blocked ? ' is-blocked' : ''}`}>
                                            <div className="incident-architecture-lens-head">
                                                <div>
                                                    <span className="incident-architecture-lens-kicker">Architecture lens</span>
                                                    <h4>{architectureLens.title}</h4>
                                                </div>
                                                <div className="incident-architecture-lens-status">
                                                    <strong>{architectureLens.statusLabel}</strong>
                                                    <small>{architectureLens.graphSummary}</small>
                                                </div>
                                            </div>
                                            <p className="incident-architecture-lens-summary">{architectureLens.headline}</p>
                                            <div className="incident-architecture-lens-view-switch" role="group" aria-label="Graph lens view">
                                                <button
                                                    type="button"
                                                    className={`incident-mode-chip ${architectureLensViewMode === 'tree' ? 'is-active' : ''}`}
                                                    onClick={() => setArchitectureLensViewMode('tree')}
                                                >
                                                    Tree
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`incident-mode-chip ${architectureLensViewMode === 'dependency' ? 'is-active' : ''}`}
                                                    onClick={() => setArchitectureLensViewMode('dependency')}
                                                >
                                                    Dependency
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`incident-mode-chip ${architectureLensViewMode === 'runtime' ? 'is-active' : ''}`}
                                                    onClick={() => setArchitectureLensViewMode('runtime')}
                                                >
                                                    Runtime Flow
                                                </button>
                                            </div>
                                            <div className="incident-architecture-lens-view-panel">
                                                {architectureLensViewMode === 'tree' ? (
                                                    <div className="incident-architecture-lens-tree">
                                                        {graphNodeGroups.length > 0 ? (
                                                            graphNodeGroups.slice(0, 5).map((group) => (
                                                                <div key={`tree-${group.nodeType}`} className="incident-architecture-lens-tree-group">
                                                                    <small className="incident-architecture-lens-tree-title">
                                                                        {group.nodeType} ({group.nodes.length})
                                                                    </small>
                                                                    <div className="incident-architecture-lens-tree-items">
                                                                        {group.nodes.slice(0, 6).map((node) => (
                                                                            <button
                                                                                key={node.id}
                                                                                type="button"
                                                                                className={`incident-architecture-lens-node-link${node.filePath ? '' : ' is-readonly'}`}
                                                                                onClick={() => revealGraphNodeTarget(node)}
                                                                                disabled={!node.filePath}
                                                                                title={node.filePath || node.label}
                                                                            >
                                                                                <strong>{node.label}</strong>
                                                                                <small>{node.type} · {node.confidence}% confidence</small>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))
                                                        ) : architectureLens.focusNodes.length > 0 ? (
                                                            <div className="incident-architecture-lens-tree-items">
                                                                {architectureLens.focusNodes.map((node) => (
                                                                    <button
                                                                        key={`focus-${node.id}`}
                                                                        type="button"
                                                                        className={`incident-architecture-lens-node-link${node.filePath ? '' : ' is-readonly'}`}
                                                                        onClick={() =>
                                                                            revealGraphNodeTarget(
                                                                                graphNodeById.get(node.id),
                                                                                'node'
                                                                            )
                                                                        }
                                                                        disabled={!node.filePath}
                                                                        title={node.filePath || node.label}
                                                                    >
                                                                        <strong>{node.label}</strong>
                                                                        <small>{node.type} · {node.confidence}% confidence</small>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <small className="incident-architecture-lens-empty">
                                                                Tree view will populate as soon as graph nodes arrive from the incident scan.
                                                            </small>
                                                        )}
                                                    </div>
                                                ) : null}

                                                {architectureLensViewMode === 'dependency' ? (
                                                    <div className="incident-architecture-lens-dependency">
                                                        {graphDependencyEdges.length > 0 ? (
                                                            <div className="incident-architecture-lens-edge-list">
                                                                {graphDependencyEdges.slice(0, 12).map((edge) => (
                                                                    <div key={edge.id} className="incident-architecture-lens-edge-row">
                                                                        <div className="incident-architecture-lens-edge-main">
                                                                            <button
                                                                                type="button"
                                                                                className={`incident-architecture-lens-edge-link${edge.sourceNode?.filePath ? '' : ' is-readonly'}`}
                                                                                onClick={() => revealGraphNodeTarget(edge.sourceNode)}
                                                                                disabled={!edge.sourceNode?.filePath}
                                                                            >
                                                                                {edge.sourceLabel}
                                                                            </button>
                                                                            <span className="incident-architecture-lens-edge-arrow">-&gt;</span>
                                                                            <button
                                                                                type="button"
                                                                                className={`incident-architecture-lens-edge-link${edge.targetNode?.filePath ? '' : ' is-readonly'}`}
                                                                                onClick={() => revealGraphNodeTarget(edge.targetNode)}
                                                                                disabled={!edge.targetNode?.filePath}
                                                                            >
                                                                                {edge.targetLabel}
                                                                            </button>
                                                                        </div>
                                                                        <div className="incident-architecture-lens-edge-meta">
                                                                            <small>{edge.relation}</small>
                                                                            <span className={`incident-architecture-lens-risk-chip risk-${architectureLens.riskTone}`}>
                                                                                {architectureLens.riskTone} risk
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <small className="incident-architecture-lens-empty">
                                                                No dependency edges yet. Run change-impact again to enrich structural links.
                                                            </small>
                                                        )}
                                                        {graphUnresolvedEdges.length > 0 ? (
                                                            <div className="incident-architecture-lens-unresolved">
                                                                <span>Unresolved edges</span>
                                                                {graphUnresolvedEdges.slice(0, 5).map((edge) => (
                                                                    <small key={`unresolved-${edge.id}`}>
                                                                        {edge.sourceLabel} -&gt; {edge.targetLabel} ({edge.relation})
                                                                    </small>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ) : null}

                                                {architectureLensViewMode === 'runtime' ? (
                                                    <div className="incident-architecture-lens-runtime">
                                                        {graphRuntimeEdges.length > 0 ? (
                                                            <div className="incident-architecture-runtime-lane">
                                                                {graphRuntimeEdges.slice(0, 12).map((edge) => (
                                                                    <div key={`runtime-${edge.id}`} className="incident-architecture-runtime-step">
                                                                        <button
                                                                            type="button"
                                                                            className={`incident-architecture-lens-edge-link${edge.sourceNode?.filePath ? '' : ' is-readonly'}`}
                                                                            onClick={() => revealGraphNodeTarget(edge.sourceNode)}
                                                                            disabled={!edge.sourceNode?.filePath}
                                                                        >
                                                                            {edge.sourceLabel}
                                                                        </button>
                                                                        <span className="incident-architecture-lens-edge-arrow">-&gt;</span>
                                                                        <button
                                                                            type="button"
                                                                            className={`incident-architecture-lens-edge-link${edge.targetNode?.filePath ? '' : ' is-readonly'}`}
                                                                            onClick={() => revealGraphNodeTarget(edge.targetNode)}
                                                                            disabled={!edge.targetNode?.filePath}
                                                                        >
                                                                            {edge.targetLabel}
                                                                        </button>
                                                                        <small>{edge.relation}</small>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <small className="incident-architecture-lens-empty">
                                                                Runtime lane is waiting for route/service/datastore edges from graph telemetry.
                                                            </small>
                                                        )}
                                                        {graphUnresolvedEdges.length > 0 ? (
                                                            <div className="incident-architecture-lens-unresolved">
                                                                <span>Unresolved runtime links</span>
                                                                {graphUnresolvedEdges.slice(0, 5).map((edge) => (
                                                                    <small key={`runtime-unresolved-${edge.id}`}>
                                                                        {edge.sourceLabel} -&gt; {edge.targetLabel}
                                                                    </small>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div className="incident-architecture-lens-grid">
                                                <div className="incident-architecture-lens-section">
                                                    <span>Why Workspai thinks so</span>
                                                    {architectureLens.reasons.length > 0 ? (
                                                        architectureLens.reasons.map((reason, index) => (
                                                            <small key={`lens-reason-${index}`}>{reason}</small>
                                                        ))
                                                    ) : (
                                                        <small>Evidence is still being assembled from the system graph and verification layer.</small>
                                                    )}
                                                </div>
                                                <div className="incident-architecture-lens-section">
                                                    <span>What is affected</span>
                                                    <small>
                                                        Modules: {architectureLens.affectedModules.length > 0
                                                            ? architectureLens.affectedModules.join(', ')
                                                            : 'unknown'}
                                                    </small>
                                                    <small>
                                                        Files: {architectureLens.affectedFiles.length > 0
                                                            ? architectureLens.affectedFiles.join(', ')
                                                            : 'unknown'}
                                                    </small>
                                                    <small>
                                                        Tests: {architectureLens.affectedTests.length > 0
                                                            ? architectureLens.affectedTests.join(', ')
                                                            : 'none suggested yet'}
                                                    </small>
                                                </div>
                                                <div className="incident-architecture-lens-section">
                                                    <span>How to verify safely</span>
                                                    {architectureLens.verifyChecklist.length > 0 ? (
                                                        architectureLens.verifyChecklist.map((item, index) => (
                                                            <small key={`lens-verify-${index}`}>{item}</small>
                                                        ))
                                                    ) : (
                                                        <small>Run deterministic verification before any completion claim.</small>
                                                    )}
                                                </div>
                                            </div>
                                            {architectureNavigator.length > 0 ? (
                                                <div className="incident-architecture-lens-navigator">
                                                    <span>Impact navigator</span>
                                                    <div className="incident-architecture-lens-nav-groups">
                                                        {architectureNavigator.map((section) => (
                                                            <div key={section.id} className="incident-architecture-lens-nav-group">
                                                                <small className="incident-architecture-lens-nav-title">{section.title}</small>
                                                                <div className="incident-architecture-lens-nav-items">
                                                                    {section.items.map((item) => (
                                                                        <button
                                                                            key={item.id}
                                                                            type="button"
                                                                            className={`incident-architecture-lens-nav-item is-${item.kind}`}
                                                                            onClick={() => handleArchitectureNavigatorSelect(item)}
                                                                            title={item.detail}
                                                                        >
                                                                            <strong>{item.label}</strong>
                                                                            <small>{item.detail}</small>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}
                                            {architectureLens.focusNodes.length > 0 ? (
                                                <div className="incident-architecture-lens-focus">
                                                    <span>Top graph signals</span>
                                                    <div className="incident-architecture-lens-node-list">
                                                        {architectureLens.focusNodes.map((node) => (
                                                            <div key={node.id} className="incident-architecture-lens-node">
                                                                <strong>{node.label}</strong>
                                                                <small>{node.type} · {node.confidence}% confidence</small>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}
                                            {architectureLens.blockedReasons.length > 0 ? (
                                                <div className="incident-architecture-lens-blockers">
                                                    <span>Blocked until</span>
                                                    {architectureLens.blockedReasons.map((reason, index) => (
                                                        <small key={`lens-blocked-${index}`}>{reason}</small>
                                                    ))}
                                                </div>
                                            ) : null}
                                            {architectureLens.nextSafeAction ? (
                                                <div className="incident-architecture-lens-actions">
                                                    <button
                                                        type="button"
                                                        className="incident-btn primary"
                                                        onClick={runPredictiveSafeAction}
                                                    >
                                                        Use safe next action
                                                    </button>
                                                    <small>{architectureLens.nextSafeAction}</small>
                                                </div>
                                            ) : null}
                                        </section>
                                    ) : null}
                                    {intentChips.length > 0 ? (
                                        <div className="incident-intent-section">
                                            <div className="incident-intent-section-head">
                                                <span>Do this next</span>
                                            </div>
                                            <div className="incident-intent-grid">
                                                {intentChips.map((chip) => (
                                                    <button
                                                        key={chip.id}
                                                        type="button"
                                                        className={`incident-intent-chip${chip.isPrimary ? ' is-primary' : ''}`}
                                                        onClick={() => handleIntentChipSelect(chip)}
                                                        title={chip.detail}
                                                    >
                                                        <strong>{chip.label}</strong>
                                                        <span>{chip.detail}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>

                                <aside className="incident-focus-sidecar">
                                    <div className="incident-focus-metrics">
                                        {compactStats.map((stat) => (
                                            <div key={stat.label} className="incident-focus-metric">
                                                <span>{stat.label}</span>
                                                <strong>{stat.value}</strong>
                                            </div>
                                        ))}
                                    </div>

                                    {latestStructuredResponse?.nextCommand ? (
                                        <div className="incident-focus-command-card">
                                            <div className="incident-focus-command-head">Next command</div>
                                            <code>{normalizeCommandText(latestStructuredResponse.nextCommand)}</code>
                                            <div
                                                className={`incident-command-scope incident-command-scope--${inferCommandExecutionScope(normalizeCommandText(latestStructuredResponse.nextCommand), hasProjectSelected)}`}
                                            >
                                                {commandScopeLabel(inferCommandExecutionScope(normalizeCommandText(latestStructuredResponse.nextCommand), hasProjectSelected))}
                                            </div>
                                            <div className="incident-command-actions">
                                                <button
                                                    type="button"
                                                    className="incident-btn primary"
                                                    onClick={() => runCommand(latestStructuredResponse.nextCommand!)}
                                                >
                                                    Run
                                                </button>
                                                <button
                                                    type="button"
                                                    className="incident-btn"
                                                    onClick={() => copyCommand(latestStructuredResponse.nextCommand!)}
                                                >
                                                    {lastCopiedCommand === normalizeCommandText(latestStructuredResponse.nextCommand) ? 'Copied' : 'Copy'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}

                                    {latestStructuredResponse?.verifyCommand ? (
                                        <div className="incident-focus-command-card incident-focus-command-card--proof">
                                            <div className="incident-focus-command-head">Proof this worked</div>
                                            <code>{normalizeCommandText(latestStructuredResponse.verifyCommand)}</code>
                                            <div
                                                className={`incident-command-scope incident-command-scope--${inferCommandExecutionScope(normalizeCommandText(latestStructuredResponse.verifyCommand), hasProjectSelected)}`}
                                            >
                                                {commandScopeLabel(inferCommandExecutionScope(normalizeCommandText(latestStructuredResponse.verifyCommand), hasProjectSelected))}
                                            </div>
                                            <div className="incident-command-actions">
                                                <button
                                                    type="button"
                                                    className="incident-btn primary"
                                                    onClick={() => runCommand(latestStructuredResponse.verifyCommand!)}
                                                >
                                                    Run
                                                </button>
                                                <button
                                                    type="button"
                                                    className="incident-btn"
                                                    onClick={() => copyCommand(latestStructuredResponse.verifyCommand!)}
                                                >
                                                    {lastCopiedCommand === normalizeCommandText(latestStructuredResponse.verifyCommand) ? 'Copied' : 'Copy'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}

                                    {architectureLens ? (
                                        <div className="incident-focus-command-card incident-focus-command-card--impact">
                                            <div className="incident-focus-command-head">System graph</div>
                                            <div className="incident-focus-graph-meta">
                                                <span>{architectureLens.graphSummary}</span>
                                                <strong>{architectureLens.focusNodes.length > 0 ? architectureLens.focusNodes[0].label : 'Awaiting graph focus nodes'}</strong>
                                            </div>
                                        </div>
                                    ) : null}
                                </aside>
                                {chatBrainActionResult && actionResultPresentation ? (
                                    <div className={`incident-verify-inline-badge is-${actionResultPresentation.tone === 'success' ? 'pass' : actionResultPresentation.tone === 'warning' ? 'warning' : 'fail'}`}>
                                        {actionResultPresentation.tone === 'success'
                                            ? <CheckCircle2 size={11} />
                                            : <AlertTriangle size={11} />}
                                        <span>{actionResultPresentation.title}</span>
                                        {chatBrainActionResult.outputSummary
                                            ? <em>{chatBrainActionResult.outputSummary}</em>
                                            : null}
                                    </div>
                                ) : null}
                            </div>

                            {isFullDisplay ? (
                                <div className="incident-health-snapshot">
                                    <div className="incident-panel-heading">
                                        <BarChart3 size={13} />
                                        <span>{snapshotSectionTitle}</span>
                                    </div>
                                    <details className="incident-collapse incident-collapse--snapshot incident-collapse--issues incident-health-section">
                                        <summary>
                                            <span>Open Issues</span>
                                            <small>{sortedBoardActions.length > 0 ? `${sortedBoardActions.length} active` : isAnalyzing ? 'Scanning' : 'Clear'}</small>
                                        </summary>
                                        {sortedBoardActions.length > 0 ? (
                                            <div className="incident-issues-grid">
                                                {visibleSidebarIssues.map((action) => {
                                                    const tone = riskTone(action.riskLevel);
                                                    const isUrgent = tone === 'critical' || tone === 'high';
                                                    return (
                                                        <button
                                                            key={action.id}
                                                            type="button"
                                                            className={`incident-issue-card${isUrgent ? ' active' : ''}`}
                                                            onClick={() => onChatBrainExecuteAction?.(action.actionType, action.id)}
                                                        >
                                                            <span className={`incident-feed-severity ${tone}`} />
                                                            <div className="incident-issue-copy">
                                                                <strong>{action.label}</strong>
                                                                <small>{action.riskLevel ?? 'unknown risk'}</small>
                                                            </div>
                                                            <span className={`incident-feed-status${isUrgent ? '' : ' muted'}`}>
                                                                {isUrgent ? 'Needs attention' : 'Ready'}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="incident-issues-empty">
                                                {isAnalyzing
                                                    ? 'Scanning workspace for issues…'
                                                    : 'No incidents yet. Start an analysis to populate this strip.'}
                                            </div>
                                        )}
                                        {showSidebarIssuesToggle ? (
                                            <button
                                                type="button"
                                                className="incident-sidebar-toggle-link"
                                                onClick={() => setShowAllSidebarIssues((prev) => !prev)}
                                            >
                                                {showAllSidebarIssues ? 'Show less' : `Show all (${sortedBoardActions.length})`}
                                            </button>
                                        ) : null}
                                    </details>
                                    <details className="incident-collapse incident-collapse--snapshot incident-health-section">
                                        <summary>
                                            <span>Snapshot numbers</span>
                                            <small>
                                                {snapshotHealthPercent === null
                                                    ? (isProjectAnalysisScope ? 'Scoped data unavailable' : 'No data')
                                                    : `${snapshotHealthPercent}%`}
                                            </small>
                                        </summary>
                                        <div className="incident-metric-card">
                                            <span>{snapshotPrimaryLabel}</span>
                                            <strong>
                                                {snapshotHealthPercent === null
                                                    ? (isProjectAnalysisScope
                                                        ? 'N/A — select a tracked project'
                                                        : 'N/A — run doctor checks')
                                                    : `${snapshotHealthPercent}%`}
                                            </strong>
                                            <div className="incident-meter">
                                                <span style={{ width: `${snapshotHealthPercent ?? 0}%` }} />
                                            </div>
                                        </div>
                                        {hasDoctorSnapshot ? (
                                            <div className="incident-metric-card">
                                                <span>{snapshotSecondaryLabel}</span>
                                                <strong>
                                                    {scopedDoctorProjectsWithIssues}/{scopedDoctorProjects.length}
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${projectsWithIssuesRatio ?? 0}%` }} />
                                                </div>
                                            </div>
                                        ) : null}
                                        <div className="incident-stats-row">
                                            <div>
                                                <Clock3 size={12} />
                                                <span>
                                                    {doctorSummary?.generatedAt
                                                        ? `Doctor updated ${new Date(doctorSummary.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                                        : commandSummary?.lastCommandAt
                                                            ? `Updated ${new Date(commandSummary.lastCommandAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                                            : 'No activity yet'}
                                                </span>
                                            </div>
                                            <div>
                                                <CheckCircle2 size={12} />
                                                <span>
                                                    {hasDoctorSnapshot
                                                        ? `${snapshotIssueCount ?? 0} issue(s) detected`
                                                        : incidentCount !== null
                                                            ? `${incidentCount} items tracked`
                                                            : 'No activity yet'}
                                                </span>
                                            </div>
                                            <div>
                                                <RotateCw size={12} />
                                                <span>
                                                    {isAnalyzing
                                                        ? 'AI is updating this view'
                                                        : hasDoctorSnapshot
                                                            ? isProjectAnalysisScope
                                                                ? 'Doctor evidence loaded for selected project scope'
                                                                : `Doctor evidence loaded from workspace${analysisWorkspacePath ? ': ' + analysisWorkspacePath.split('/').pop() : ''}`
                                                            : 'Waiting for your next action'}
                                                </span>
                                            </div>
                                        </div>
                                    </details>

                                    {ctaVariantBreakdown?.variants?.length ? (
                                        <details className="incident-collapse incident-collapse--snapshot incident-health-section">
                                            <summary>
                                                <span>CTA Variant Breakdown</span>
                                                <small>{ctaVariantBreakdown.variants.length} variant(s)</small>
                                            </summary>
                                            <div className="incident-cta-variant-grid">
                                                {ctaVariantBreakdown.variants.map((item) => {
                                                    const lowConfidence =
                                                        item.loopStarted < CTA_VARIANT_MIN_LOOP_SAMPLES ||
                                                        item.actionExecuted < CTA_VARIANT_MIN_ACTION_SAMPLES;

                                                    return (
                                                        <div key={item.variant} className="incident-cta-variant-card">
                                                            <div className="incident-cta-variant-head">
                                                                <strong>{item.variant.toUpperCase()}</strong>
                                                                <small>{item.loopStarted} loop starts</small>
                                                            </div>
                                                            {lowConfidence ? (
                                                                <div className="incident-cta-variant-confidence">Low confidence sample</div>
                                                            ) : null}
                                                            <div className="incident-cta-variant-metrics">
                                                                <span>
                                                                    verify completion
                                                                    <b>{item.verifyCompletionRate === null ? 'N/A' : `${item.verifyCompletionRate}%`}</b>
                                                                </span>
                                                                <span>
                                                                    action vs ask
                                                                    <b>{item.actionVsAskShare === null ? 'N/A' : `${item.actionVsAskShare}%`}</b>
                                                                </span>
                                                            </div>
                                                            <div className="incident-cta-variant-foot">
                                                                <small>
                                                                    actions {item.actionExecuted} · verify ✓ {item.verifyPassed} / ✗ {item.verifyFailed}
                                                                </small>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="incident-cta-variant-legend">
                                                verify completion = (verify passed + verify failed) / action executed. action vs ask = action executed / (action executed + next_action_clicked). UNKNOWN = events collected without ctaVariant tag.
                                            </div>
                                        </details>
                                    ) : null}

                                    {studioHardGateStatus ? (
                                        <details className="incident-collapse incident-collapse--snapshot incident-health-section">
                                            <summary>
                                                <span>Studio hard-gate</span>
                                                <small>{studioHardGateStatus.gates.overallPass ? 'PASS' : 'FAIL'}</small>
                                            </summary>
                                            <div className="incident-metric-card">
                                                <span>Verify-phase reach</span>
                                                <strong>
                                                    {hardGateVerifyReach === null ? 'N/A' : `${hardGateVerifyReach}%`} / min{' '}
                                                    {studioHardGateStatus.thresholds.verifyPhaseReachMin}%
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${hardGateVerifyMeter}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-metric-card">
                                                <span>Bridge route completion</span>
                                                <strong>
                                                    {hardGateBridgeCompletion === null ? 'N/A' : `${hardGateBridgeCompletion}%`} / min{' '}
                                                    {studioHardGateStatus.thresholds.bridgeRouteCompletionMin}%
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${hardGateBridgeMeter}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-stats-row">
                                                <div>
                                                    <ShieldCheck size={12} />
                                                    <span>
                                                        verify gate: {studioHardGateStatus.gates.verifyPhaseReachPass ? 'pass' : 'fail'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <BarChart3 size={12} />
                                                    <span>
                                                        bridge gate: {studioHardGateStatus.gates.bridgeRouteCompletionPass ? 'pass' : 'fail'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <Activity size={12} />
                                                    <span>
                                                        telemetry evidence: {studioHardGateStatus.gates.telemetryEvidencePass ? 'present' : 'missing'}
                                                    </span>
                                                </div>
                                            </div>
                                        </details>
                                    ) : null}

                                    {studioRollbackKpiStatus ? (
                                        <details className="incident-collapse incident-collapse--snapshot incident-health-section">
                                            <summary>
                                                <span>Rollback KPI gate</span>
                                                <small>{studioRollbackKpiStatus.gates.overallPass ? 'PASS' : 'FAIL'}</small>
                                            </summary>
                                            <div className="incident-metric-card">
                                                <span>Auto-rollback success rate</span>
                                                <strong>
                                                    {rollbackAutoSuccessRate === null ? 'N/A' : `${rollbackAutoSuccessRate}%`} / min{' '}
                                                    {studioRollbackKpiStatus.thresholds.verifyAutoRollbackSuccessRateMin}%
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${rollbackSuccessMeter}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-metric-card">
                                                <span>False-confidence rate</span>
                                                <strong>
                                                    {rollbackFalseConfidenceRate === null ? 'N/A' : `${rollbackFalseConfidenceRate}%`} / max{' '}
                                                    {studioRollbackKpiStatus.thresholds.falseConfidenceRateMax}%
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${rollbackFalseConfidenceMeter}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-stats-row">
                                                <div>
                                                    <RotateCw size={12} />
                                                    <span>
                                                        attempts: {studioRollbackKpiStatus.metrics.rollbackAttempted} / verify failed{' '}
                                                        {studioRollbackKpiStatus.metrics.verifyFailed}
                                                    </span>
                                                </div>
                                                <div>
                                                    <CheckCircle2 size={12} />
                                                    <span>succeeded: {studioRollbackKpiStatus.metrics.rollbackSucceeded}</span>
                                                </div>
                                                <div>
                                                    <Activity size={12} />
                                                    <span>
                                                        evidence: {studioRollbackKpiStatus.gates.telemetryEvidencePass ? 'present' : 'missing'}
                                                    </span>
                                                </div>
                                            </div>
                                        </details>
                                    ) : null}

                                    {studioStabilizationKpiStatus ? (
                                        <details className="incident-collapse incident-collapse--snapshot incident-health-section">
                                            <summary>
                                                <span>Stabilization KPI gate</span>
                                                <small>{studioStabilizationKpiStatus.gates.overallPass ? 'PASS' : 'FAIL'}</small>
                                            </summary>
                                            <div className="incident-cta-variant-legend">
                                                operational window: {stabilizationWindowLabel}
                                            </div>
                                            <div className="incident-metric-card">
                                                <span>Route precision</span>
                                                <strong>
                                                    {stabilizationRoutePrecision === null ? 'N/A' : `${stabilizationRoutePrecision}%`} / min{' '}
                                                    {studioStabilizationKpiStatus.thresholds.routePrecisionMin}%
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${stabilizationRouteMeter}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-metric-card">
                                                <span>Verify path completion</span>
                                                <strong>
                                                    {stabilizationVerifyPathCompletion === null ? 'N/A' : `${stabilizationVerifyPathCompletion}%`} / min{' '}
                                                    {studioStabilizationKpiStatus.thresholds.verifyPathCompletionRateMin}%
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${stabilizationVerifyMeter}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-metric-card">
                                                <span>False confidence</span>
                                                <strong>
                                                    {stabilizationFalseConfidence === null ? 'N/A' : `${stabilizationFalseConfidence}%`} / max{' '}
                                                    {studioStabilizationKpiStatus.thresholds.falseConfidenceRateMax}%
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${stabilizationFalseConfidenceMeter}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-metric-card">
                                                <span>Rollback recovery success</span>
                                                <strong>
                                                    {stabilizationRollbackRecovery === null ? 'N/A' : `${stabilizationRollbackRecovery}%`} / min{' '}
                                                    {studioStabilizationKpiStatus.thresholds.rollbackRecoverySuccessRateMin}%
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${stabilizationRollbackMeter}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-metric-card">
                                                <span>Repeat verified resolution</span>
                                                <strong>
                                                    {stabilizationRepeatResolution === null ? 'N/A' : `${stabilizationRepeatResolution}%`} / min{' '}
                                                    {studioStabilizationKpiStatus.thresholds.repeatVerifiedResolutionRateMin}%
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${stabilizationRepeatMeter}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-metric-card">
                                                <span>Repeat resolution with artifact</span>
                                                <strong>
                                                    {stabilizationRepeatWithArtifact === null ? 'N/A' : `${stabilizationRepeatWithArtifact}%`} / min{' '}
                                                    {studioStabilizationKpiStatus.thresholds.repeatVerifiedResolutionRateMin}%
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${Math.max(0, Math.min(100, stabilizationRepeatWithArtifact ?? 0))}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-stats-row">
                                                <div>
                                                    <Activity size={12} />
                                                    <span>
                                                        routes: {studioStabilizationKpiStatus.metrics.routeMatchedWithoutFallback} success /{' '}
                                                        {studioStabilizationKpiStatus.metrics.routeFallbackCount} fallback
                                                    </span>
                                                </div>
                                                <div>
                                                    <Sparkles size={12} />
                                                    <span>
                                                        fallback mix: success {stabilizationFallbackMix?.success ?? 0}, bare{' '}
                                                        {stabilizationFallbackMix?.bare_keyword_only ?? 0}, fix-preview{' '}
                                                        {stabilizationFallbackMix?.fix_preview_fallback ?? 0}, default{' '}
                                                        {stabilizationFallbackMix?.orchestrate_default ?? 0}, other{' '}
                                                        {stabilizationFallbackMix?.other ?? 0}
                                                    </span>
                                                </div>
                                                <div>
                                                    <CheckCircle2 size={12} />
                                                    <span>
                                                        verify path: {studioStabilizationKpiStatus.metrics.verifyPathPresent} / required{' '}
                                                        {studioStabilizationKpiStatus.metrics.verifyRequired}
                                                    </span>
                                                </div>
                                                <div>
                                                    <AlertTriangle size={12} />
                                                    <span>verify-path misses: {stabilizationVerifyPathReasonTopText}</span>
                                                </div>
                                                <div>
                                                    <RotateCw size={12} />
                                                    <span>
                                                        recovery class mix: auto {stabilizationRecoveryClassBreakdown?.auto_rollback ?? 0}, manual{' '}
                                                        {stabilizationRecoveryClassBreakdown?.manual_recovery ?? 0}, unspecified{' '}
                                                        {stabilizationRecoveryClassBreakdown?.unspecified ?? 0}
                                                    </span>
                                                </div>
                                                <div>
                                                    <RotateCw size={12} />
                                                    <span>
                                                        repeated incidents: {studioStabilizationKpiStatus.metrics.repeatVerifiedResolved} verified /{' '}
                                                        {studioStabilizationKpiStatus.metrics.repeatVerifiedWithArtifactReady ?? 0} with artifact /{' '}
                                                        {studioStabilizationKpiStatus.metrics.repeatedIncidentDetected} detected
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="incident-action-row">
                                                <button
                                                    type="button"
                                                    className="incident-btn secondary"
                                                    onClick={() => copyStabilizationSnapshot('markdown', stabilizationSnapshotMarkdown)}
                                                >
                                                    {stabilizationSnapshotCopiedFormat === 'markdown' ? 'Copied Markdown' : 'Copy as Markdown'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="incident-btn secondary"
                                                    onClick={() => copyStabilizationSnapshot('json', stabilizationSnapshotJson)}
                                                >
                                                    {stabilizationSnapshotCopiedFormat === 'json' ? 'Copied JSON' : 'Copy as JSON'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="incident-btn secondary"
                                                    onClick={() => copyStabilizationSnapshot('dashboard-5-1', stabilizationDashboardSection51Markdown)}
                                                >
                                                    {stabilizationSnapshotCopiedFormat === 'dashboard-5-1'
                                                        ? 'Copied Section 5.1'
                                                        : 'Copy for Dashboard Section 5.1'}
                                                </button>
                                            </div>
                                        </details>
                                    ) : null}

                                    {studioReproPackKpiStatus ? (
                                        <details className="incident-collapse incident-collapse--snapshot incident-health-section">
                                            <summary>
                                                <span>Repro Pack KPI gate</span>
                                                <small>{studioReproPackKpiStatus.gates.overallPass ? 'PASS' : 'FAIL'}</small>
                                            </summary>
                                            <div className="incident-metric-card">
                                                <span>Repro pack share rate</span>
                                                <strong>
                                                    {studioReproPackKpiStatus.metrics.reproPackShareRate === null
                                                        ? 'N/A'
                                                        : `${studioReproPackKpiStatus.metrics.reproPackShareRate}%`}{' '}
                                                    / min {studioReproPackKpiStatus.thresholds.reproPackShareRateMin}%
                                                </strong>
                                                <div className="incident-meter">
                                                    <span
                                                        style={{
                                                            width: `${Math.min(
                                                                studioReproPackKpiStatus.metrics.reproPackShareRate ?? 0,
                                                                100
                                                            )}%`,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="incident-metric-card">
                                                <span>Replay-to-resolution rate</span>
                                                <strong>
                                                    {studioReproPackKpiStatus.metrics.replayToResolutionRate === null
                                                        ? 'N/A'
                                                        : `${studioReproPackKpiStatus.metrics.replayToResolutionRate}%`}{' '}
                                                    / min {studioReproPackKpiStatus.thresholds.replayToResolutionRateMin}%
                                                </strong>
                                                <div className="incident-meter">
                                                    <span
                                                        style={{
                                                            width: `${Math.min(
                                                                studioReproPackKpiStatus.metrics.replayToResolutionRate ?? 0,
                                                                100
                                                            )}%`,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="incident-stats-row">
                                                <div>
                                                    <Package size={12} />
                                                    <span>
                                                        captured: {studioReproPackKpiStatus.metrics.reproPackCaptured} / exported:{' '}
                                                        {studioReproPackKpiStatus.metrics.reproPackExported}
                                                    </span>
                                                </div>
                                                <div>
                                                    <RotateCw size={12} />
                                                    <span>
                                                        imported: {studioReproPackKpiStatus.metrics.reproPackImported} / enriched:{' '}
                                                        {studioReproPackKpiStatus.metrics.incidentReplayMemoryEnriched}
                                                    </span>
                                                </div>
                                                <div>
                                                    <Activity size={12} />
                                                    <span>
                                                        evidence: {studioReproPackKpiStatus.gates.telemetryEvidencePass ? 'present' : 'missing'}
                                                    </span>
                                                </div>
                                            </div>
                                        </details>
                                    ) : null}

                                    {releaseReadinessValidationKpiStatus ? (
                                        <details className="incident-collapse incident-collapse--snapshot incident-health-section">
                                            <summary>
                                                <span>Release readiness validation</span>
                                                <small>{releaseReadinessValidationKpiStatus.gates.overallPass ? 'PASS' : 'FAIL'}</small>
                                            </summary>
                                            <div className="incident-metric-card">
                                                <span>Decision accuracy</span>
                                                <strong>
                                                    {releaseDecisionAccuracy === null ? 'N/A' : `${releaseDecisionAccuracy}%`}
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${releaseDecisionAccuracyMeter}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-metric-card">
                                                <span>No-go prevented incident rate</span>
                                                <strong>
                                                    {noGoPreventedIncidentRate === null ? 'N/A' : `${noGoPreventedIncidentRate}%`}
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${noGoPreventedIncidentMeter}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-stats-row">
                                                <div>
                                                    <Package size={12} />
                                                    <span>
                                                        artifacts: {releaseReadinessValidationKpiStatus.metrics.releaseReadinessArtifactsExported} / validated:{' '}
                                                        {releaseReadinessValidationKpiStatus.metrics.decisionsValidated}
                                                    </span>
                                                </div>
                                                <div>
                                                    <CheckCircle2 size={12} />
                                                    <span>
                                                        go: {releaseReadinessValidationKpiStatus.metrics.goDecisionsExported} / no-go:{' '}
                                                        {releaseReadinessValidationKpiStatus.metrics.noGoDecisionsExported}
                                                    </span>
                                                </div>
                                                <div>
                                                    <Activity size={12} />
                                                    <span>
                                                        evidence: {releaseReadinessValidationKpiStatus.gates.telemetryEvidencePass ? 'present' : 'missing'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="incident-action-row">
                                                <button
                                                    type="button"
                                                    className="incident-btn secondary"
                                                    onClick={() => onChatBrainExecuteAction?.('release-readiness-commander')}
                                                >
                                                    Generate release-readiness artifact
                                                </button>
                                            </div>
                                        </details>
                                    ) : null}

                                    {verifiedOutcomeLoopStatus ? (
                                        <details className="incident-collapse incident-collapse--snapshot incident-health-section">
                                            <summary>
                                                <span>Verified outcome loop</span>
                                                <small>{verifiedOutcomeLoopStatus.gates.overallPass ? 'PASS' : 'IN PROGRESS'}</small>
                                            </summary>
                                            <div className="incident-metric-card">
                                                <span>Replay-to-resolution</span>
                                                <strong>
                                                    {loopReplayToResolutionRate === null ? 'N/A' : `${loopReplayToResolutionRate}%`}
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${loopReplayMeter}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-metric-card">
                                                <span>Release decision accuracy</span>
                                                <strong>
                                                    {loopReleaseDecisionAccuracy === null ? 'N/A' : `${loopReleaseDecisionAccuracy}%`}
                                                </strong>
                                                <div className="incident-meter">
                                                    <span style={{ width: `${loopReleaseMeter}%` }} />
                                                </div>
                                            </div>
                                            <div className="incident-stats-row">
                                                <div>
                                                    <CheckCircle2 size={12} />
                                                    <span>verified outcomes: {verifiedOutcomeLoopStatus.verifiedOutcomes}</span>
                                                </div>
                                                <div>
                                                    <RotateCw size={12} />
                                                    <span>
                                                        replay ready: {verifiedOutcomeLoopStatus.reusableArtifacts.replayReady} / memory enriched:{' '}
                                                        {verifiedOutcomeLoopStatus.reusableArtifacts.memoryEnriched}
                                                    </span>
                                                </div>
                                                <div>
                                                    <Package size={12} />
                                                    <span>
                                                        repro exports: {verifiedOutcomeLoopStatus.reusableArtifacts.reproPacksExported} / release artifacts:{' '}
                                                        {verifiedOutcomeLoopStatus.reusableArtifacts.releaseArtifactsExported}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="incident-action-row">
                                                <button
                                                    type="button"
                                                    className="incident-btn secondary"
                                                    onClick={() => onChatBrainExecuteAction?.('incident-repro-pack')}
                                                >
                                                    Export reproducible incident pack
                                                </button>
                                                <button
                                                    type="button"
                                                    className="incident-btn secondary"
                                                    onClick={() => onChatBrainExecuteAction?.('release-readiness-commander')}
                                                >
                                                    Export release-readiness evidence
                                                </button>
                                            </div>
                                        </details>
                                    ) : null}

                                    {hasDoctorSnapshot ? (
                                        <details className="incident-collapse incident-collapse--snapshot incident-health-section">
                                            <summary>
                                                <span>Doctor Overview</span>
                                                <small>{doctorSummary!.issueCount} issue(s)</small>
                                            </summary>
                                            <div className="incident-doctor-snapshot">
                                                <div className="incident-doctor-scoreline">
                                                    <span>Health checks</span>
                                                    <strong>
                                                        ✅ {doctorSummary!.health.passed} · ⚠️ {doctorSummary!.health.warnings} · ❌ {doctorSummary!.health.errors}
                                                    </strong>
                                                </div>
                                                {doctorSummary!.frameworks.length > 0 ? (
                                                    <div className="incident-doctor-frameworks">
                                                        {doctorSummary!.frameworks.slice(0, 4).map((fw) => (
                                                            <span key={fw.name} className="incident-doctor-chip">
                                                                {fw.name} ({fw.count})
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : null}
                                                {doctorSummary!.projects.length > 0 ? (
                                                    <div className="incident-doctor-projects">
                                                        {doctorVisibleProjects.map((project) => (
                                                            <div
                                                                key={project.name}
                                                                className={`incident-doctor-project-item incident-doctor-project-item--${doctorProjectSeverity(project)}`}
                                                            >
                                                                <strong>{project.name}</strong>
                                                                <span>
                                                                    {project.framework || 'unknown framework'} · {project.issues} issue(s)
                                                                    {typeof project.modulesCount === 'number' ? ` · ${project.modulesCount} module(s)` : ''}
                                                                    {typeof project.modulesHealthy === 'boolean'
                                                                        ? ` · modules ${project.modulesHealthy ? 'healthy' : 'needs attention'}`
                                                                        : ''}
                                                                    {typeof project.vulnerabilities === 'number' && project.vulnerabilities > 0
                                                                        ? ` · ${project.vulnerabilities} vuln(s)`
                                                                        : ''}
                                                                </span>
                                                            </div>
                                                        ))}
                                                        {doctorModuleGraphByFramework.length > 0 ? (
                                                            <div className="incident-doctor-fixes">
                                                                <div className="incident-doctor-fixes-head">Installed modules graph</div>
                                                                <div className="incident-action-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
                                                                    <select
                                                                        value={moduleGraphFrameworkFilter}
                                                                        onChange={(event) => setModuleGraphFrameworkFilter(event.target.value)}
                                                                        aria-label="Filter module graph by framework"
                                                                    >
                                                                        <option value="all">All frameworks</option>
                                                                        {doctorModuleGraphFrameworkOptions.map((framework) => (
                                                                            <option key={framework} value={framework}>{framework}</option>
                                                                        ))}
                                                                    </select>
                                                                    <select
                                                                        value={moduleGraphSeverityFilter}
                                                                        onChange={(event) =>
                                                                            setModuleGraphSeverityFilter(
                                                                                event.target.value as 'all' | 'healthy' | 'warning' | 'critical'
                                                                            )
                                                                        }
                                                                        aria-label="Filter module graph by severity"
                                                                    >
                                                                        <option value="all">All severities</option>
                                                                        <option value="healthy">Healthy</option>
                                                                        <option value="warning">Warning</option>
                                                                        <option value="critical">Critical</option>
                                                                    </select>
                                                                    <input
                                                                        type="text"
                                                                        value={moduleGraphSearch}
                                                                        onChange={(event) => setModuleGraphSearch(event.target.value)}
                                                                        placeholder="Search module"
                                                                        aria-label="Search module graph"
                                                                    />
                                                                </div>
                                                                {filteredDoctorModuleGraph.length === 0 ? (
                                                                    <small>No modules match current filters.</small>
                                                                ) : null}
                                                                {filteredDoctorModuleGraph.map((frameworkGroup) => (
                                                                    <div key={frameworkGroup.framework} className="incident-doctor-fix-item">
                                                                        <div>
                                                                            <strong>{frameworkGroup.framework}</strong>
                                                                            <small style={{ display: 'block' }}>
                                                                                {frameworkGroup.projects.length} project(s)
                                                                            </small>
                                                                        </div>
                                                                        <div>
                                                                            {frameworkGroup.projects.map((project) => (
                                                                                <div key={`${frameworkGroup.framework}-${project.name}`} style={{ marginTop: '6px' }}>
                                                                                    <small>
                                                                                        {project.severity === 'critical'
                                                                                            ? 'CRITICAL'
                                                                                            : project.severity === 'warning'
                                                                                                ? 'WARNING'
                                                                                                : 'HEALTHY'}{' '}
                                                                                        {project.name}
                                                                                    </small>
                                                                                    {project.modules.slice(0, 10).map((mod) => (
                                                                                        <code
                                                                                            key={`${project.name}-${mod.slug}-${mod.version}`}
                                                                                            style={{ display: 'block', marginTop: '4px' }}
                                                                                        >
                                                                                            |- {mod.display_name || mod.slug} ({mod.version || 'unknown'})
                                                                                        </code>
                                                                                    ))}
                                                                                    {project.modules.length > 10 ? (
                                                                                        <small>+{project.modules.length - 10} more module(s)</small>
                                                                                    ) : null}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                        {hiddenDoctorProjectsCount > 0 ? (
                                                            <button
                                                                type="button"
                                                                className="incident-btn"
                                                                onClick={() => setShowAllDoctorProjects(true)}
                                                            >
                                                                Show {hiddenDoctorProjectsCount} more project(s)
                                                            </button>
                                                        ) : null}
                                                        {showAllDoctorProjects && doctorProjects.length > 4 ? (
                                                            <button
                                                                type="button"
                                                                className="incident-btn"
                                                                onClick={() => setShowAllDoctorProjects(false)}
                                                            >
                                                                Show less
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                                {doctorSummary!.fixCommands.length > 0 ? (
                                                    <div className="incident-doctor-fixes">
                                                        <div className="incident-doctor-fixes-head">Recommended quick fixes</div>
                                                        {doctorSummary!.fixCommands.slice(0, 3).map((fixCommand, idx) => {
                                                            const normalized = normalizeCommandText(fixCommand);
                                                            const isExecutingFix = !!(
                                                                executingCommand && normalizeCommandText(executingCommand) === normalized
                                                            );
                                                            return (
                                                                <div key={`${fixCommand}-${idx}`} className="incident-doctor-fix-item">
                                                                    <code>{normalized}</code>
                                                                    <div className="incident-command-actions">
                                                                        <button
                                                                            type="button"
                                                                            className="incident-btn"
                                                                            onClick={() => copyCommand(normalized)}
                                                                            disabled={isExecutingFix}
                                                                        >
                                                                            {lastCopiedCommand === normalized ? 'Copied' : 'Copy'}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="incident-btn primary"
                                                                            onClick={() => runCommand(normalized)}
                                                                            disabled={isExecutingFix}
                                                                        >
                                                                            {isExecutingFix ? 'Running' : 'Run'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : null}
                                                <div className="incident-action-row">
                                                    <button type="button" className="incident-btn" onClick={onRunDoctorChecks}>
                                                        Run workspace checks
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="incident-btn"
                                                        onClick={() => onRunDoctorFix?.()}
                                                        disabled={!onRunDoctorFix}
                                                    >
                                                        Apply doctor safe fixes
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="incident-btn"
                                                        onClick={() => onViewComplianceReport?.()}
                                                        disabled={!onViewComplianceReport}
                                                    >
                                                        View compliance report
                                                    </button>
                                                </div>
                                                <div className="incident-doctor-fixes">
                                                    <div className="incident-doctor-fixes-head">CLI action matrix (data-driven)</div>
                                                    {cliActionMatrix.workspace.map((entry) => {
                                                        const normalized = normalizeCommandText(entry.command);
                                                        const isExecuting = !!(
                                                            executingCommand && normalizeCommandText(executingCommand) === normalized
                                                        );
                                                        return (
                                                            <div key={entry.id} className="incident-doctor-fix-item">
                                                                <div>
                                                                    <strong>{entry.label}</strong>
                                                                    <small style={{ display: 'block' }}>{entry.detail}</small>
                                                                    <code>{normalized}</code>
                                                                </div>
                                                                <div className="incident-command-actions">
                                                                    <button
                                                                        type="button"
                                                                        className="incident-btn"
                                                                        onClick={() => copyCommand(normalized)}
                                                                        disabled={isExecuting}
                                                                    >
                                                                        {lastCopiedCommand === normalized ? 'Copied' : 'Copy'}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="incident-btn primary"
                                                                        onClick={() => runCommand(normalized)}
                                                                        disabled={isExecuting}
                                                                    >
                                                                        {isExecuting ? 'Running' : 'Run'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {cliActionMatrix.project.length > 0 ? (
                                                        cliActionMatrix.project.map((entry) => {
                                                            const normalized = normalizeCommandText(entry.command);
                                                            const isExecuting = !!(
                                                                executingCommand && normalizeCommandText(executingCommand) === normalized
                                                            );
                                                            return (
                                                                <div key={entry.id} className="incident-doctor-fix-item">
                                                                    <div>
                                                                        <strong>{entry.label}</strong>
                                                                        <small style={{ display: 'block' }}>{entry.detail}</small>
                                                                        <code>{normalized}</code>
                                                                    </div>
                                                                    <div className="incident-command-actions">
                                                                        <button
                                                                            type="button"
                                                                            className="incident-btn"
                                                                            onClick={() => copyCommand(normalized)}
                                                                            disabled={isExecuting}
                                                                        >
                                                                            {lastCopiedCommand === normalized ? 'Copied' : 'Copy'}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="incident-btn primary"
                                                                            onClick={() => runCommand(normalized)}
                                                                            disabled={isExecuting}
                                                                        >
                                                                            {isExecuting ? 'Running' : 'Run'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <small>Select a project to unlock project-level CLI actions.</small>
                                                    )}
                                                </div>
                                            </div>
                                        </details>
                                    ) : null}

                                    <details className="incident-collapse incident-collapse--snapshot incident-health-section">
                                        <summary>
                                            <span>Proof this worked</span>
                                            <small>{verifySteps.filter((step) => step.done).length}/{verifySteps.length} ready</small>
                                        </summary>
                                        <div className="incident-verify-panel incident-verify-panel--embedded">
                                            <div className="incident-verify-steps">
                                                {verifySteps.map((step) => (
                                                    <div key={step.label} className="incident-verify-step">
                                                        <span className={`incident-verify-dot ${step.done ? 'is-done' : 'is-pending'}`} />
                                                        <span>{step.label}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <button type="button" className="incident-btn primary" onClick={onRunDoctorChecks}>
                                                Run workspace checks
                                            </button>
                                        </div>
                                    </details>

                                    {onboardingSummary?.followupShown ? (
                                        <details className="incident-collapse incident-collapse--snapshot incident-health-section">
                                            <summary>
                                                <span>Guidance</span>
                                                <small>{onboardingSummary.followupClicked}/{onboardingSummary.followupShown} used</small>
                                            </summary>
                                            <div className="incident-onboarding-note incident-onboarding-note--embedded">
                                                Suggested follow-ups used {onboardingSummary.followupClicked} of {onboardingSummary.followupShown} times.
                                            </div>
                                        </details>
                                    ) : null}

                                    {(studioActivityItems.length > 0 || timelineItems.length > 0) ? (
                                        <details className="incident-collapse incident-collapse--snapshot incident-health-section">
                                            <summary>
                                                <span>Usage</span>
                                                <small>{studioActivityItems.length + timelineItems.length} signals</small>
                                            </summary>
                                            <div className="incident-usage-compact incident-usage-compact--embedded">
                                                <div className="incident-usage-pills">
                                                    {studioActivityItems.map((item) => (
                                                        <span key={item.command} className="incident-usage-pill">
                                                            <em>{item.count}</em>{item.label}
                                                        </span>
                                                    ))}
                                                    {timelineItems.map((item) => (
                                                        <span key={item.command} className="incident-usage-pill incident-usage-pill--tool">
                                                            <em>{item.count}</em>{item.label}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </details>
                                    ) : null}
                                </div>
                            ) : null}
                        </main>

                        <aside className="incident-insights-panel">
                            <div className="incident-panel-heading incident-panel-heading--brand">
                                <Send size={13} />
                                <span>Conversation</span>
                                <span className="incident-analysis-status">
                                    {isAnalyzing ? '● Analyzing…' : chatBrainHistory?.length ? `${chatBrainHistory.length} messages` : 'Ready'}
                                </span>
                            </div>

                            <div className="incident-chat-toolbar" role="toolbar" aria-label="Conversation tools">
                                <button
                                    type="button"
                                    className="incident-chat-toolbar-btn"
                                    onClick={onRunDoctorChecks}
                                    title="Run deterministic doctor checks — scans workspace health issues"
                                >
                                    <ShieldCheck size={12} />
                                    <span>Doctor</span>
                                </button>
                                <button
                                    type="button"
                                    className="incident-chat-toolbar-btn"
                                    onClick={() => runStudioAction('terminal-bridge', onRunTerminalBridge)}
                                    title="Inspect logs and runtime signals"
                                >
                                    <Activity size={12} />
                                    <span>Logs</span>
                                </button>
                                <button
                                    type="button"
                                    className="incident-chat-toolbar-btn"
                                    onClick={() => runStudioAction('fix-preview-lite', _onRunFixPreview)}
                                    title="Preview a safe patch before editing"
                                >
                                    <Wrench size={12} />
                                    <span>Fix</span>
                                </button>
                                <button
                                    type="button"
                                    className="incident-chat-toolbar-btn"
                                    onClick={() => runStudioAction('change-impact-lite', _onRunChangeImpact)}
                                    title="Estimate blast radius and rollout risk"
                                >
                                    <BarChart3 size={12} />
                                    <span>Impact</span>
                                </button>
                                <button
                                    type="button"
                                    className="incident-chat-toolbar-btn"
                                    onClick={() => runStudioAction('verify-pack-autopilot')}
                                    title="Generate an AI-built deterministic verify command pack (distinct from Doctor)"
                                >
                                    <ShieldCheck size={12} />
                                    <span>Verify Pack</span>
                                </button>
                            </div>

                            <div className="incident-history-shell">
                                {/* Scrollable conversation thread */}
                                <div className="incident-chat-thread" ref={threadRef} onScroll={handleThreadScroll}>
                                    {aiUnavailable ? (
                                        <div className="incident-fallback-card">
                                            <div className="incident-fallback-title">
                                                <AlertTriangle size={13} />
                                                <span>AI provider currently unreachable</span>
                                            </div>
                                            <p>
                                                Network-level failure detected. Switch to deterministic flow now, keep context intact,
                                                and retry AI once connection recovers.
                                            </p>
                                            <code className="incident-error-code">{lastError}</code>
                                            <div className="incident-fallback-actions">
                                                <button type="button" className="incident-btn primary" onClick={onRunDoctorChecks}>
                                                    Run deterministic checks
                                                </button>
                                                <button type="button" className="incident-btn" onClick={onRunTerminalBridge}>
                                                    Retry bridge
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}

                                    {!chatBrainHistory?.length && !chatBrainStreamText && !isAnalyzing && !aiUnavailable ? (
                                        <div className="incident-chat-empty">
                                            <Sparkles size={22} style={{ opacity: 0.3 }} />
                                            <p>Nothing yet. Ask AI to inspect the workspace, debug an error, or plan your next change.</p>
                                        </div>
                                    ) : null}

                                    {recentConversationEntries.length > 0 ? (
                                        <div className="incident-chat-messages">
                                            {recentConversationEntries.map((entry, index) => {
                                                const isExpanded = !!expandedConversationIds[entry.id];
                                                const isLatest = index === recentConversationEntries.length - 1;
                                                return (
                                                    <div
                                                        key={entry.id}
                                                        className={`incident-msg ${entry.role === 'user' ? 'incident-msg--user' : 'incident-msg--assistant'}${isExpanded ? ' is-expanded' : ' is-collapsed'}`}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="incident-msg-meta incident-msg-toggle"
                                                            onClick={() => toggleConversationEntry(entry.id)}
                                                            aria-expanded={isExpanded}
                                                        >
                                                            {entry.role === 'user' ? (
                                                                <>
                                                                    <span className="incident-msg-avatar incident-msg-avatar--user">You</span>
                                                                    <span className="incident-msg-label">asked</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span className="incident-msg-avatar incident-msg-avatar--ai">AI</span>
                                                                    <span className="incident-msg-label">answered</span>
                                                                </>
                                                            )}
                                                            <span className="incident-msg-time">
                                                                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            {isLatest ? <span className="incident-msg-state">Latest</span> : null}
                                                            <span className="incident-msg-chevron">
                                                                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                            </span>
                                                        </button>
                                                        {isExpanded ? (
                                                            <div className="incident-msg-body">
                                                                {entry.role === 'assistant' ? renderAssistantText(entry.text) : <p>{entry.text}</p>}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : null}

                                    {chatBrainStreamText ? (
                                        <div className="incident-msg incident-msg--assistant incident-msg--streaming">
                                            <div className="incident-msg-meta">
                                                <span className="incident-msg-avatar incident-msg-avatar--ai">AI</span>
                                                <span className="incident-msg-label">is writing</span>
                                                <span className="incident-msg-typing-dots">
                                                    <span />
                                                    <span />
                                                    <span />
                                                </span>
                                            </div>
                                            <div className="incident-msg-body">
                                                {renderAssistantText(chatBrainStreamText)}
                                            </div>
                                        </div>
                                    ) : null}

                                    {chatBrainActionProgress ? (
                                        <div className="incident-onboarding-note">
                                            <RotateCw size={11} />
                                            {chatBrainActionProgress.stage} ({chatBrainActionProgress.progress}%)
                                            {chatBrainActionProgress.note ? ` — ${chatBrainActionProgress.note}` : ''}
                                        </div>
                                    ) : null}

                                    {chatBrainActionResult && actionResultPresentation ? (
                                        <div className={`incident-verify-result ${actionResultPresentation.tone === 'success' ? 'is-success' : actionResultPresentation.tone === 'warning' ? 'is-warning' : 'is-fail'}`}>
                                            <div className="incident-verify-result-title">
                                                {actionResultPresentation.tone === 'success' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                                                <span>{actionResultPresentation.title}</span>
                                            </div>
                                            <p>{actionResultPresentation.description}</p>
                                            {chatBrainActionResult.evidence?.healthScoreText ? (
                                                <div className="incident-verify-evidence">
                                                    <strong>Evidence (doctor report)</strong>
                                                    <p>Health score: {chatBrainActionResult.evidence.healthScoreText}</p>
                                                    {chatBrainActionResult.evidence.generatedAt ? (
                                                        <p>
                                                            Generated: {new Date(chatBrainActionResult.evidence.generatedAt).toLocaleString()}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                            {chatBrainActionResult.diagnosis ? (
                                                <div className="incident-verify-evidence">
                                                    {(() => {
                                                        const diagnosisCriteria = evaluateArtifactSuccessCriteria({
                                                            kind: 'diagnosis',
                                                            confidence:
                                                                chatBrainActionResult.diagnosis!.confidence > 1
                                                                    ? chatBrainActionResult.diagnosis!.confidence / 100
                                                                    : chatBrainActionResult.diagnosis!.confidence,
                                                            confidenceBand: chatBrainActionResult.diagnosis!.confidenceBand,
                                                            relatedFilesCount: chatBrainActionResult.diagnosis!.relatedFiles.length,
                                                            signalSourcesCount: chatBrainActionResult.diagnosis!.signalSources.length,
                                                        });
                                                        return (
                                                            <div className={`incident-rollback-evidence is-${diagnosisCriteria.overallStatus === 'pass' ? 'passed' : diagnosisCriteria.overallStatus === 'partial' ? 'warning' : 'failed'}`}>
                                                                <strong>{diagnosisCriteria.summaryLabel}</strong>
                                                                {diagnosisCriteria.criteria.map((c) => (
                                                                    <p key={c.label}>
                                                                        <span className={`incident-criteria-status is-${c.status}`}>{c.status.toUpperCase()}</span>
                                                                        {' '}{c.label}{c.detail ? ` — ${c.detail}` : ''}
                                                                    </p>
                                                                ))}
                                                            </div>
                                                        );
                                                    })()}
                                                    <p>
                                                        Confidence: {chatBrainActionResult.diagnosis.confidence}% ({chatBrainActionResult.diagnosis.confidenceBand})
                                                    </p>
                                                    {chatBrainActionResult.diagnosis.signalSources.length > 0 ? (
                                                        <p>
                                                            Signals: {chatBrainActionResult.diagnosis.signalSources.slice(0, 5).join(', ')}
                                                        </p>
                                                    ) : null}
                                                    {chatBrainActionResult.diagnosis.relatedFiles.length > 0 ? (
                                                        <p>
                                                            Related files ({chatBrainActionResult.diagnosis.relatedFiles.length}):{' '}
                                                            {chatBrainActionResult.diagnosis.relatedFiles.slice(0, 5).join(', ')}
                                                        </p>
                                                    ) : null}
                                                    {chatBrainActionResult.diagnosis.recommendedFocus ? (
                                                        <p>Focus: {chatBrainActionResult.diagnosis.recommendedFocus}</p>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                            {chatBrainActionResult.decisionClarity ? (() => {
                                                const wordingPolicy = getDecisionClarityWordingPolicy({
                                                    mutationReady: chatBrainActionResult.decisionClarity.mutationReady,
                                                    requiredMissingFields: chatBrainActionResult.decisionClarity.requiredMissingFields,
                                                    verificationRequired: chatBrainActionResult.verificationRequired ?? false,
                                                });
                                                return (
                                                    <div className={`incident-rollback-evidence is-${wordingPolicy.cardState === 'complete' ? 'passed' : 'warning'}`}>
                                                        <strong>{wordingPolicy.cardHeading}</strong>
                                                        <p>
                                                            Situation: {chatBrainActionResult.decisionClarity.situation || 'unknown'}
                                                        </p>
                                                        <p>
                                                            Why: {chatBrainActionResult.decisionClarity.reason || 'unknown'}
                                                        </p>
                                                        <p>
                                                            Impact scope: {chatBrainActionResult.decisionClarity.impactScope.length > 0
                                                                ? chatBrainActionResult.decisionClarity.impactScope.slice(0, 4).join(', ')
                                                                : 'unknown'}
                                                        </p>
                                                        <p>
                                                            Risk: {chatBrainActionResult.decisionClarity.risk.confidenceBand}
                                                            {' · '}
                                                            {chatBrainActionResult.decisionClarity.risk.confidence}%
                                                            {' · '}
                                                            {chatBrainActionResult.decisionClarity.risk.mutating ? 'mutating' : 'non-mutating'}
                                                        </p>
                                                        <p>
                                                            Next: {chatBrainActionResult.decisionClarity.nextStep || 'unknown'}
                                                        </p>
                                                        <p>
                                                            Verify: {chatBrainActionResult.decisionClarity.verifyPlan.length > 0
                                                                ? chatBrainActionResult.decisionClarity.verifyPlan.slice(0, 3).join(' | ')
                                                                : 'unknown'}
                                                        </p>
                                                        <p>
                                                            Rollback: {chatBrainActionResult.decisionClarity.rollbackPlan || 'unknown'}
                                                        </p>
                                                        {chatBrainActionResult.decisionClarity.requiredMissingFields.length > 0 ? (
                                                            <p>
                                                                Missing required fields: {chatBrainActionResult.decisionClarity.requiredMissingFields
                                                                    .map(f => ({
                                                                        situation: 'Incident description',
                                                                        nextStep: 'Next action command',
                                                                        verifyPlan: 'Verify plan',
                                                                        impactScope: 'Impact scope',
                                                                        rollbackPlan: 'Rollback plan',
                                                                    }[f] ?? f))
                                                                    .join(', ')}
                                                            </p>
                                                        ) : wordingPolicy.mutationReadyLabel !== null ? (
                                                            <p>Mutation ready: {wordingPolicy.mutationReadyLabel}</p>
                                                        ) : null}
                                                    </div>
                                                );
                                            })() : null}
                                            {chatBrainActionResult.verifyCommandPack ? (
                                                <div className={`incident-rollback-evidence is-${chatBrainActionResult.verifyCommandPack.readiness === 'ready' ? 'passed' : 'warning'}`}>
                                                    {(() => {
                                                        const verifyCriteria = evaluateArtifactSuccessCriteria({
                                                            kind: 'verify',
                                                            runCompleted: true,
                                                            errors:
                                                                chatBrainActionResult.evidence?.errors ??
                                                                (chatBrainActionResult.success ? 0 : 1),
                                                            warnings: chatBrainActionResult.evidence?.warnings ?? 0,
                                                            passed:
                                                                chatBrainActionResult.evidence?.passed ??
                                                                (chatBrainActionResult.success ? 1 : 0),
                                                        });
                                                        return (
                                                            <>
                                                                <strong>{verifyCriteria.summaryLabel}</strong>
                                                                {verifyCriteria.criteria.map((c) => (
                                                                    <p key={c.label}>
                                                                        <span className={`incident-criteria-status is-${c.status}`}>{c.status.toUpperCase()}</span>
                                                                        {' '}{c.label}{c.detail ? ` — ${c.detail}` : ''}
                                                                    </p>
                                                                ))}
                                                            </>
                                                        );
                                                    })()}
                                                    <strong>Deterministic verify command pack</strong>
                                                    <p>
                                                        Quality score: {chatBrainActionResult.verifyCommandPack.qualityScore}%
                                                        {' · Readiness: '}
                                                        {chatBrainActionResult.verifyCommandPack.readiness}
                                                    </p>
                                                    <p>{chatBrainActionResult.verifyCommandPack.rationale}</p>
                                                    {chatBrainActionResult.verifyCommandPack.commands.length > 0 ? (
                                                        <div className="incident-doctor-fixes">
                                                            {chatBrainActionResult.verifyCommandPack.commands.slice(0, 4).map((entry, index) => {
                                                                const normalized = normalizeCommandText(entry.command);
                                                                const isExecutingVerify = !!(
                                                                    executingCommand && normalizeCommandText(executingCommand) === normalized
                                                                );
                                                                return (
                                                                    <div key={`${entry.command}-${index}`} className="incident-doctor-fix-item">
                                                                        <code>{normalized}</code>
                                                                        <div className={`incident-command-scope incident-command-scope--${entry.scope}`}>
                                                                            {entry.scope === 'project' ? 'Run in project root' : 'Run in workspace root'}
                                                                            {entry.required ? ' · required' : ' · optional'}
                                                                        </div>
                                                                        <div className="incident-command-actions">
                                                                            <button
                                                                                type="button"
                                                                                className="incident-btn"
                                                                                onClick={() => copyCommand(normalized)}
                                                                                disabled={isExecutingVerify}
                                                                            >
                                                                                {lastCopiedCommand === normalized ? 'Copied' : 'Copy'}
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                className="incident-btn primary"
                                                                                onClick={() => runCommand(normalized)}
                                                                                disabled={isExecutingVerify}
                                                                            >
                                                                                {isExecutingVerify ? 'Running' : 'Run'}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : null}
                                                    {chatBrainActionResult.verifyCommandPack.blockedReasons.length > 0 ? (
                                                        <p>
                                                            Blocked reasons: {chatBrainActionResult.verifyCommandPack.blockedReasons.slice(0, 3).join(' | ')}
                                                        </p>
                                                    ) : null}
                                                    <div className="incident-command-actions">
                                                        <button
                                                            type="button"
                                                            className="incident-btn primary"
                                                            onClick={() => runVerifyCommandPack(chatBrainActionResult.verifyCommandPack!)}
                                                        >
                                                            Run required verify commands
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : null}
                                            {chatBrainActionResult.contractRuntimeEvidence ? (
                                                <div className={`incident-rollback-evidence is-${chatBrainActionResult.contractRuntimeEvidence.errors.length > 0 ? 'failed' : chatBrainActionResult.contractRuntimeEvidence.warnings.length > 0 ? 'warning' : 'passed'}`}>
                                                    <strong>C06 contract runtime evidence</strong>
                                                    <p>
                                                        Source: {chatBrainActionResult.contractRuntimeEvidence.source}
                                                        {' · '}Loaded: {chatBrainActionResult.contractRuntimeEvidence.availableKinds.length}
                                                        {' · '}Missing: {chatBrainActionResult.contractRuntimeEvidence.missingKinds.length}
                                                    </p>
                                                    <p>
                                                        Errors: {chatBrainActionResult.contractRuntimeEvidence.errors.length}
                                                        {' · '}Warnings: {chatBrainActionResult.contractRuntimeEvidence.warnings.length}
                                                    </p>
                                                    {chatBrainActionResult.contractRuntimeEvidence.summary ? (
                                                        <p>{chatBrainActionResult.contractRuntimeEvidence.summary}</p>
                                                    ) : null}
                                                    {chatBrainActionResult.contractRuntimeEvidence.availableKinds.length > 0 ? (
                                                        <p>
                                                            Available kinds: {chatBrainActionResult.contractRuntimeEvidence.availableKinds.slice(0, 3).join(', ')}
                                                        </p>
                                                    ) : null}
                                                    {chatBrainActionResult.contractRuntimeEvidence.missingKinds.length > 0 ? (
                                                        <p>
                                                            Missing kinds: {chatBrainActionResult.contractRuntimeEvidence.missingKinds.slice(0, 3).join(', ')}
                                                        </p>
                                                    ) : null}
                                                    {chatBrainActionResult.contractRuntimeEvidence.errors.length > 0 ? (
                                                        <p>
                                                            Contract errors: {chatBrainActionResult.contractRuntimeEvidence.errors.slice(0, 2).join(' | ')}
                                                        </p>
                                                    ) : null}
                                                    {chatBrainActionResult.contractRuntimeEvidence.warnings.length > 0 ? (
                                                        <p>
                                                            Contract warnings: {chatBrainActionResult.contractRuntimeEvidence.warnings.slice(0, 2).join(' | ')}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                            {chatBrainActionResult.rollback ? (() => {
                                                const rollbackCriteria = evaluateArtifactSuccessCriteria({
                                                    kind: 'rollback',
                                                    status: chatBrainActionResult.rollback.status,
                                                    restoredFilesCount: chatBrainActionResult.rollback.restoredFiles.length,
                                                    failedFilesCount: chatBrainActionResult.rollback.failedFiles.length,
                                                });
                                                return (
                                                    <div className={`incident-rollback-evidence is-${rollbackCriteria.overallStatus === 'pass' ? 'passed' : rollbackCriteria.overallStatus === 'partial' ? 'warning' : chatBrainActionResult.rollback!.status}`}>
                                                        <strong>{rollbackCriteria.summaryLabel}</strong>
                                                        {rollbackCriteria.criteria.map((c) => (
                                                            <p key={c.label}>
                                                                <span className={`incident-criteria-status is-${c.status}`}>{c.status.toUpperCase()}</span>
                                                                {' '}{c.label}{c.detail ? ` — ${c.detail}` : ''}
                                                            </p>
                                                        ))}
                                                        {chatBrainActionResult.rollback!.reason ? (
                                                            <p>{chatBrainActionResult.rollback!.reason}</p>
                                                        ) : null}
                                                        {chatBrainActionResult.rollback!.suggestedNextStep ? (
                                                            <p>{chatBrainActionResult.rollback!.suggestedNextStep}</p>
                                                        ) : null}
                                                    </div>
                                                );
                                            })() : null}
                                            {chatBrainActionResult.sandboxSimulation ? (() => {
                                                const sim = chatBrainActionResult.sandboxSimulation!;
                                                const sandboxCriteria = evaluateArtifactSuccessCriteria({
                                                    kind: 'sandbox',
                                                    status: sim.status,
                                                    safeToApply: sim.safeToApply,
                                                    commandCount: sim.commandResults.length,
                                                    failedCommandCount: sim.commandResults.filter((r) => r.exitCode !== 0).length,
                                                });
                                                return (
                                                    <div className={`incident-rollback-evidence is-${sandboxCriteria.overallStatus === 'pass' ? 'passed' : sandboxCriteria.overallStatus === 'partial' ? 'warning' : sim.status}`}>
                                                        <strong>{sandboxCriteria.summaryLabel}</strong>
                                                        {sandboxCriteria.criteria.map((c) => (
                                                            <p key={c.label}>
                                                                <span className={`incident-criteria-status is-${c.status}`}>{c.status.toUpperCase()}</span>
                                                                {' '}{c.label}{c.detail ? ` — ${c.detail}` : ''}
                                                            </p>
                                                        ))}
                                                        <p>Risk class: {sim.riskClass}</p>
                                                        {sim.reason ? <p>{sim.reason}</p> : null}
                                                        {sim.recommendedRollbackPath ? <p>{sim.recommendedRollbackPath}</p> : null}
                                                        <div className="incident-command-actions">
                                                            <button
                                                                type="button"
                                                                className="incident-btn"
                                                                onClick={() => {
                                                                    const sandboxSimulation = chatBrainActionResult.sandboxSimulation;
                                                                    if (sandboxSimulation) {
                                                                        onExportSandboxSimulationEvidence?.(sandboxSimulation);
                                                                    }
                                                                }}
                                                            >
                                                                Export simulation evidence
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })() : null}
                                            {chatBrainActionResult.incidentReproPack ? (() => {
                                                const reproPack = chatBrainActionResult.incidentReproPack!;
                                                const reproCriteria = evaluateArtifactSuccessCriteria({
                                                    kind: 'repro',
                                                    status: reproPack.status,
                                                    redactionApplied: reproPack.redaction.applied,
                                                    secretsLeakCount: 0,
                                                });
                                                return (
                                                    <div className={`incident-rollback-evidence is-${reproCriteria.overallStatus === 'pass' ? 'passed' : reproCriteria.overallStatus === 'partial' ? 'warning' : reproPack.status === 'captured' ? 'passed' : reproPack.status}`}>
                                                        <strong>{reproCriteria.summaryLabel}</strong>
                                                        {reproCriteria.criteria.map((c) => (
                                                            <p key={c.label}>
                                                                <span className={`incident-criteria-status is-${c.status}`}>{c.status.toUpperCase()}</span>
                                                                {' '}{c.label}{c.detail ? ` — ${c.detail}` : ''}
                                                            </p>
                                                        ))}
                                                        <p>Pack ID: {reproPack.packId}</p>
                                                        <p>
                                                            Replay payload: {reproPack.replayPayload.verifyChecklist.length} verify checks
                                                            {' · '}
                                                            {reproPack.replayPayload.blockedReasons.length} blocked reasons
                                                        </p>
                                                        {reproPack.exportHint ? (
                                                            <p>{reproPack.exportHint}</p>
                                                        ) : null}
                                                        <div className="incident-command-actions">
                                                            <button
                                                                type="button"
                                                                className="incident-btn"
                                                                onClick={() => {
                                                                    if (reproPack) {
                                                                        onExportIncidentReproPack?.(reproPack);
                                                                    }
                                                                }}
                                                            >
                                                                Export redacted bundle
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="incident-btn"
                                                                onClick={() => onImportIncidentReproPack?.()}
                                                            >
                                                                Import bundle and replay
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="incident-btn primary"
                                                                onClick={() => {
                                                                    if (reproPack) {
                                                                        const replayQuery = buildReplayQueryFromIncidentReproPack(
                                                                            reproPack
                                                                        );
                                                                        setLastUserQuery(replayQuery);
                                                                        onChatBrainQuery?.(replayQuery);
                                                                    }
                                                                }}
                                                            >
                                                                Replay in Incident Studio
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })() : null}
                                            {chatBrainActionResult.releaseReadinessCommander ? (
                                                <div
                                                    className={`incident-rollback-evidence is-${chatBrainActionResult.releaseReadinessCommander.decision === 'go' ? 'passed' : 'failed'}`}
                                                >
                                                    <strong>Release readiness commander</strong>
                                                    <p>
                                                        Decision: {chatBrainActionResult.releaseReadinessCommander.decision.toUpperCase()}
                                                        {' · Confidence: '}
                                                        {chatBrainActionResult.releaseReadinessCommander.confidence}%
                                                    </p>
                                                    <p>
                                                        Verify contract: {chatBrainActionResult.releaseReadinessCommander.evidence.verifyPackContractStatus}
                                                        {' · Sandbox: '}
                                                        {chatBrainActionResult.releaseReadinessCommander.evidence.sandboxStatus}
                                                    </p>
                                                    <p>
                                                        Scope known: {chatBrainActionResult.releaseReadinessCommander.evidence.scopeKnown ? 'yes' : 'no'}
                                                        {' · Verify path: '}
                                                        {chatBrainActionResult.releaseReadinessCommander.evidence.verifyPathPresent ? 'yes' : 'no'}
                                                        {' · Rollback path: '}
                                                        {chatBrainActionResult.releaseReadinessCommander.evidence.rollbackPathPresent ? 'yes' : 'no'}
                                                    </p>
                                                    {chatBrainActionResult.releaseReadinessCommander.blockingReasons.length > 0 ? (
                                                        <p>
                                                            Blocking reasons:{' '}
                                                            {chatBrainActionResult.releaseReadinessCommander.blockingReasons
                                                                .slice(0, 4)
                                                                .join(', ')}
                                                        </p>
                                                    ) : null}
                                                    <p>{chatBrainActionResult.releaseReadinessCommander.summary.goNoGoRationale}</p>
                                                    <p>{chatBrainActionResult.releaseReadinessCommander.summary.recommendedNextStep}</p>
                                                    <div className="incident-command-actions">
                                                        <button
                                                            type="button"
                                                            className="incident-btn"
                                                            onClick={() => {
                                                                const artifact = chatBrainActionResult.releaseReadinessCommander;
                                                                if (artifact) {
                                                                    onExportReleaseReadinessCommander?.(artifact);
                                                                }
                                                            }}
                                                        >
                                                            Export Go/No-Go artifact
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="incident-btn"
                                                            onClick={() => {
                                                                const artifact = chatBrainActionResult.releaseReadinessCommander;
                                                                if (artifact) {
                                                                    copyReleaseReadinessShare(artifact, 'approval-note');
                                                                }
                                                            }}
                                                        >
                                                            {releaseReadinessCopiedFormat === 'approval-note' &&
                                                                releaseReadinessCopiedArtifactId ===
                                                                chatBrainActionResult.releaseReadinessCommander.artifactId
                                                                ? 'Copied approval note'
                                                                : 'Copy approval note'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="incident-btn"
                                                            onClick={() => {
                                                                const artifact = chatBrainActionResult.releaseReadinessCommander;
                                                                if (artifact) {
                                                                    copyReleaseReadinessShare(artifact, 'signoff');
                                                                }
                                                            }}
                                                        >
                                                            {releaseReadinessCopiedFormat === 'signoff' &&
                                                                releaseReadinessCopiedArtifactId ===
                                                                chatBrainActionResult.releaseReadinessCommander.artifactId
                                                                ? 'Copied signoff packet'
                                                                : 'Copy signoff packet'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="incident-btn"
                                                            onClick={() => {
                                                                const artifact = chatBrainActionResult.releaseReadinessCommander;
                                                                if (artifact) {
                                                                    copyReleaseReadinessShare(artifact, 'json');
                                                                }
                                                            }}
                                                        >
                                                            {releaseReadinessCopiedFormat === 'json' &&
                                                                releaseReadinessCopiedArtifactId ===
                                                                chatBrainActionResult.releaseReadinessCommander.artifactId
                                                                ? 'Copied artifact JSON'
                                                                : 'Copy artifact JSON'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : null}
                                            {chatBrainActionResult.multiFilePatch ? (
                                                <MultiFilePatchCard
                                                    patchResult={chatBrainActionResult.multiFilePatch}
                                                    onApplyPatch={onApplyPatch}
                                                />
                                            ) : null}
                                        </div>
                                    ) : null}

                                    {chatBrainError ? (
                                        <div className="incident-fallback-card">
                                            <div className="incident-fallback-title">
                                                <AlertTriangle size={13} />
                                                <span>Chat Brain error</span>
                                            </div>
                                            <p>{chatBrainError}</p>
                                            {lastUserQuery && chatBrainErrorRetryable ? (
                                                <button
                                                    type="button"
                                                    className="incident-retry-btn"
                                                    onClick={() => onChatBrainQuery?.(lastUserQuery)}
                                                >
                                                    ↻ Retry last query
                                                </button>
                                            ) : null}
                                        </div>
                                    ) : null}

                                    {!shouldAutoScrollThread && (recentConversationEntries.length > 0 || !!chatBrainStreamText) ? (
                                        <button
                                            type="button"
                                            className="incident-jump-latest"
                                            onClick={jumpToLatest}
                                        >
                                            <ChevronDown size={12} />
                                            <span>Jump to latest</span>
                                        </button>
                                    ) : null}

                                </div>
                            </div>

                            <div className="incident-chat-dock">
                                <div className="incident-chat-actions-panel">
                                    <div className="incident-panel-heading incident-panel-heading--chat-actions">
                                        <Wrench size={13} />
                                        <span>Do this next</span>
                                    </div>
                                    <div className="incident-chat-actions-grid">
                                        {intentChips.length > 0 ? (
                                            <div className="incident-chat-quick-actions" role="group" aria-label="Suggested next actions">
                                                {intentChips.slice(0, activeUserMode === 'guided' ? 3 : 4).map((chip) => (
                                                    <button
                                                        key={chip.id}
                                                        type="button"
                                                        className={`incident-chat-quick-action${chip.isPrimary ? ' is-primary' : ''}`}
                                                        onClick={() => handleIntentChipSelect(chip)}
                                                        title={chip.detail}
                                                    >
                                                        <strong>{chip.label}</strong>
                                                        <small>{chip.detail}</small>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}

                                        {chatBrainBoard ? (
                                            <div className="incident-patch-option incident-patch-option--chat" role="group" aria-label="Chat Brain action board">
                                                <strong>{chatBrainBoard.title}</strong>
                                                <span>{chatBrainBoard.summary || 'Pick one action to continue in this Studio.'}</span>
                                                {primaryBoardAction && primaryCtaMode === 'single' ? (
                                                    <div className="incident-primary-action-card incident-primary-action-card--chat" role="group" aria-label="Primary next action">
                                                        <div className="incident-primary-action-head">Do This Next</div>
                                                        <button
                                                            type="button"
                                                            className="incident-btn primary incident-action-btn"
                                                            onClick={() => onChatBrainExecuteAction?.(primaryBoardAction.actionType, primaryBoardAction.id)}
                                                        >
                                                            <span>{primaryBoardAction.label}</span>
                                                            {primaryBoardAction.riskLevel ? (
                                                                <span className={`incident-risk-badge incident-risk-badge--${riskTone(primaryBoardAction.riskLevel)}`}>
                                                                    <span>{primaryBoardAction.riskLevel}</span>
                                                                </span>
                                                            ) : null}
                                                        </button>
                                                        <p className="incident-primary-action-hint">
                                                            {actionExecutionHint(primaryBoardAction.actionType)}
                                                            {primaryBoardGuardHint ? ` ${primaryBoardGuardHint}` : ''}
                                                        </p>
                                                    </div>
                                                ) : null}
                                                {boardGuardHint ? (
                                                    <div className="incident-onboarding-note">
                                                        <ShieldCheck size={11} />
                                                        {boardGuardHint}
                                                    </div>
                                                ) : null}
                                                {(primaryCtaMode === 'single' ? secondaryBoardActions : modeVisibleBoardActions).length > 0 ? (
                                                    <div className="incident-board-actions incident-board-actions--chat">
                                                        {(primaryCtaMode === 'single' ? secondaryBoardActions : modeVisibleBoardActions).map((action) => {
                                                            const tone = riskTone(action.riskLevel);
                                                            return (
                                                                <button
                                                                    key={action.id}
                                                                    type="button"
                                                                    className={`incident-btn incident-action-btn incident-action-btn--chat${primaryCtaMode === 'multi' ? ' primary' : ''}`}
                                                                    onClick={() => onChatBrainExecuteAction?.(action.actionType, action.id)}
                                                                >
                                                                    <span>{action.label}</span>
                                                                    {action.riskLevel ? (
                                                                        <span className={`incident-risk-badge incident-risk-badge--${tone}`}>
                                                                            {tone === 'critical' || tone === 'high' ? <AlertTriangle size={10} /> : null}
                                                                            {tone === 'medium' ? <BarChart3 size={10} /> : null}
                                                                            {tone === 'low' ? <ShieldCheck size={10} /> : null}
                                                                            {tone === 'unknown' ? <Activity size={10} /> : null}
                                                                            <span>{action.riskLevel}</span>
                                                                        </span>
                                                                    ) : null}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : latestStructuredResponse?.nextCommand || latestStructuredResponse?.verifyCommand ? (
                                            <div className="incident-patch-option incident-patch-option--chat" role="group" aria-label="Actions derived from latest answer">
                                                <strong>Derived from latest answer</strong>
                                                <span>The assistant already named the next step. You can run it from here.</span>
                                                <div className="incident-board-actions incident-board-actions--chat">
                                                    {latestStructuredResponse?.nextCommand ? (
                                                        <button
                                                            type="button"
                                                            className="incident-btn primary incident-action-btn incident-action-btn--chat"
                                                            onClick={() => runCommand(latestStructuredResponse.nextCommand!)}
                                                        >
                                                            <span>Run next command</span>
                                                        </button>
                                                    ) : null}
                                                    {latestStructuredResponse?.verifyCommand ? (
                                                        <button
                                                            type="button"
                                                            className="incident-btn incident-action-btn incident-action-btn--chat"
                                                            onClick={() => runCommand(latestStructuredResponse.verifyCommand!)}
                                                        >
                                                            <span>Run verify command</span>
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="incident-fallback-action-grid incident-fallback-action-grid--chat">
                                                <button
                                                    type="button"
                                                    className="incident-btn primary incident-action-btn incident-action-btn--chat"
                                                    onClick={() => runStudioAction('terminal-bridge', onRunTerminalBridge)}
                                                >
                                                    Inspect logs and runtime
                                                </button>
                                                <button
                                                    type="button"
                                                    className="incident-btn incident-action-btn incident-action-btn--chat"
                                                    onClick={() => runStudioAction('fix-preview-lite', _onRunFixPreview)}
                                                >
                                                    Preview a safe fix
                                                </button>
                                                <button
                                                    type="button"
                                                    className="incident-btn incident-action-btn incident-action-btn--chat"
                                                    onClick={() => runStudioAction('change-impact-lite', _onRunChangeImpact)}
                                                >
                                                    Check blast radius
                                                </button>
                                                <button
                                                    type="button"
                                                    className="incident-btn incident-action-btn incident-action-btn--chat"
                                                    onClick={() => runStudioAction('workspace-memory-wizard', _onRunMemoryWizard)}
                                                >
                                                    Save this pattern
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="incident-input-area incident-input-area--sidebar">
                                    <form className="incident-command-input-form" onSubmit={handleChatSubmit}>
                                        <input
                                            type="text"
                                            className="incident-command-input"
                                            placeholder="Describe the problem or next change…"
                                            value={commandInput}
                                            onChange={(e) => setCommandInput(e.target.value)}
                                            autoComplete="off"
                                            disabled={isAnalyzing}
                                        />
                                        <button
                                            type="submit"
                                            className="incident-command-submit"
                                            disabled={!commandInput.trim() || isAnalyzing}
                                            aria-label="Send"
                                        >
                                            <Send size={12} />
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </aside>
                    </div>
                </div>
            ) : null}

            {isLiteDisplay ? (
                <section className="incident-lite-shell" aria-label="Studio Lite summary cards">
                    <article className="incident-lite-card">
                        <div className="incident-lite-head">
                            <small className="incident-lite-kicker">Card 1</small>
                            <h4>What you have</h4>
                        </div>
                        <div className="incident-lite-content">
                            <p><strong>Workspace:</strong> {workspaceName || 'Unknown workspace'}</p>
                            <p><strong>Framework:</strong> {frameworkLabel}</p>
                            <p><strong>Starting point:</strong> {startingPoint || 'Not detected yet'}</p>
                            <p>
                                <strong>Release status:</strong>{' '}
                                <span className={`incident-lite-status ${liteReleaseNoGo ? 'is-failed' : 'is-passed'}`}>
                                    {liteStatusLabel}
                                </span>
                            </p>
                            <p>{liteStatusSummary}</p>
                        </div>
                        {!startingPoint ? (
                            <button type="button" className="incident-btn" onClick={onRunDoctorChecks}>
                                Run workspace checks
                            </button>
                        ) : null}
                        <small className="incident-lite-source">
                            Source: framework → {frameworkSource}; entry-point → {startingPointSource}
                        </small>
                    </article>

                    <article className="incident-lite-card">
                        <div className="incident-lite-head">
                            <small className="incident-lite-kicker">Card 2</small>
                            <h4>What matters now</h4>
                        </div>
                        {liteHardBlockReasons.length > 0 ? (
                            <ol className="incident-lite-list incident-lite-list--blocked">
                                {liteHardBlockReasons.slice(0, 3).map((reason, index) => {
                                    const severity = liteBlockerSeverityMap.get(reason) ?? 'soft';
                                    return (
                                        <li key={`blocked-${index}`}>
                                            <span className={`incident-blocker-severity ${severity}`}>
                                                {severity}
                                            </span>
                                            <strong>Blocker {index + 1}</strong>
                                            <span>{reason}</span>
                                        </li>
                                    );
                                })}
                            </ol>
                        ) : null}
                        {liteRiskItems.length > 0 ? (
                            <ol className="incident-lite-list">
                                {liteRiskItems.map((item, index) => (
                                    <li key={`${item.label}-${index}`}>
                                        <strong>{item.label}</strong>
                                        <span>{item.risk} risk</span>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <div className="incident-lite-empty">
                                <p>No ranked risks yet.</p>
                                <button type="button" className="incident-btn" onClick={onRunDoctorChecks}>
                                    Generate risk signals
                                </button>
                            </div>
                        )}
                        <small className="incident-lite-source">Source: {liteRiskSource}</small>
                    </article>

                    <article className="incident-lite-card">
                        <div className="incident-lite-head">
                            <small className="incident-lite-kicker">Card 3</small>
                            <h4>Do this next</h4>
                        </div>
                        <p className="incident-lite-single-action">{blockerAwarePrimaryActionLabel}</p>
                        {primaryBoardGuardHint ? <small className="incident-lite-guard">{primaryBoardGuardHint}</small> : null}
                        <button type="button" className="incident-btn primary" onClick={runLitePrimaryAction}>
                            {liteTopBlocker
                                ? 'Resolve top blocker'
                                : primaryBoardAction
                                    ? 'Run this next action'
                                    : 'Ask AI for next action'}
                        </button>
                        <small className="incident-lite-source">Source: {litePrimaryActionSource}</small>
                    </article>

                    <article className="incident-lite-card">
                        <div className="incident-lite-head">
                            <small className="incident-lite-kicker">Card 4</small>
                            <h4>Proof of success</h4>
                        </div>
                        <code className="incident-lite-code">{liteVerifyCommand}</code>
                        <button
                            type="button"
                            className="incident-btn primary"
                            onClick={() => runCommand(liteVerifyCommand)}
                        >
                            {liteReleaseNoGo ? 'Run blocker check' : 'Run verify command'}
                        </button>
                        <small className="incident-lite-source">Source: {liteVerifySource}</small>
                    </article>
                </section>
            ) : null}
        </section>
    );
}

// ─── Multi-file patch review card (A02 / A03) ─────────────────────────────────

function MultiFilePatchCard({
    patchResult,
    onApplyPatch,
}: {
    patchResult: MultiFilePatchResult;
    onApplyPatch?: (patchId: string, acceptedPaths: string[], branchSafeApply: boolean) => void;
}) {
    const [accepted, setAccepted] = useState<Set<string>>(
        () => new Set(patchResult.patches.map((p) => p.relativePath))
    );
    const [applied, setApplied] = useState(
        patchResult.patches.some((p) => p.status === 'applied')
    );
    const [branchSafe, setBranchSafe] = useState(true);

    const allPending = patchResult.patches.every(
        (p) => p.status === 'pending' || p.status === 'rejected'
    );

    function togglePath(relPath: string) {
        setAccepted((prev) => {
            const next = new Set(prev);
            if (next.has(relPath)) {
                next.delete(relPath);
            } else {
                next.add(relPath);
            }
            return next;
        });
    }

    function handleApply() {
        if (!onApplyPatch) {
            return;
        }
        onApplyPatch(patchResult.patchId, Array.from(accepted), branchSafe);
        setApplied(true);
    }

    const statusLabel =
        patchResult.appliedCount > 0
            ? `${patchResult.appliedCount} applied · ${patchResult.rejectedCount} rejected · ${patchResult.failedCount} failed`
            : `${patchResult.patches.length} file${patchResult.patches.length !== 1 ? 's' : ''} · review and apply`;

    return (
        <div className="incident-multi-patch-card">
            <div className="incident-multi-patch-header">
                <CheckCircle2 size={13} />
                <strong>Multi-file patch</strong>
                <span className="incident-multi-patch-status">{statusLabel}</span>
            </div>

            {patchResult.branchCreated ? (
                <p className="incident-multi-patch-branch">
                    Branch: <code>{patchResult.branchCreated}</code>
                </p>
            ) : null}

            <ul className="incident-multi-patch-list">
                {patchResult.patches.map((patch: FilePatch) => {
                    const isAccepted = accepted.has(patch.relativePath);
                    const statusClass =
                        patch.status === 'applied'
                            ? 'patch-applied'
                            : patch.status === 'failed'
                                ? 'patch-failed'
                                : isAccepted
                                    ? 'patch-accepted'
                                    : 'patch-rejected';
                    return (
                        <li key={patch.relativePath} className={`incident-patch-file ${statusClass}`}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={isAccepted}
                                    disabled={!allPending || applied}
                                    onChange={() => togglePath(patch.relativePath)}
                                />
                                <code>{patch.relativePath}</code>
                                {patch.isNewFile ? (
                                    <span className="patch-tag new">new</span>
                                ) : null}
                                <span className="patch-tag">{patch.language ?? 'text'}</span>
                            </label>
                            {patch.failReason ? (
                                <p className="patch-fail-reason">{patch.failReason}</p>
                            ) : null}
                        </li>
                    );
                })}
            </ul>

            {allPending && !applied && onApplyPatch ? (
                <div className="incident-multi-patch-controls">
                    <label className="patch-branch-toggle">
                        <input
                            type="checkbox"
                            checked={branchSafe}
                            onChange={(e) => setBranchSafe(e.target.checked)}
                        />
                        Create branch before apply
                    </label>
                    <button
                        type="button"
                        className="incident-apply-patch-btn"
                        disabled={accepted.size === 0}
                        onClick={handleApply}
                    >
                        Apply {accepted.size} of {patchResult.patches.length} file{patchResult.patches.length !== 1 ? 's' : ''}
                    </button>
                </div>
            ) : null}
        </div>
    );
}
