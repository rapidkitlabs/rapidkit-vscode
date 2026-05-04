import { useEffect, useMemo, useRef, useState } from 'react';

import {
    Activity,
    AlertTriangle,
    BarChart3,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Clock3,
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
} from '../lib/incidentStudioVerifyPolicy';
import { buildIncidentArchitectureLens } from '../lib/incidentArchitectureLens';
import {
    buildIncidentArchitectureNavigator,
    type IncidentArchitectureNavigatorItem,
} from '../lib/incidentImpactNavigator';
import type {
    NormalizedIncidentActionResultPayload,
    NormalizedIncidentImpactAssessmentPayload,
    NormalizedIncidentPredictiveWarningPayload,
    NormalizedIncidentReleaseGateEvidencePayload,
    NormalizedIncidentSystemGraphSnapshotPayload,
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
            framework?: string;
            issues: number;
            depsInstalled?: boolean;
        }>;
        fixCommands: string[];
    } | null;
}

interface AIIncidentStudioProps {
    workspaceName?: string;
    modelId?: string | null;
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
    hasProjectSelected?: boolean;
    userMode?: IncidentUserMode;
    onUserModeChange?: (mode: IncidentUserMode) => void;
}

type StructuredIncidentResponse = {
    whatHappened?: string;
    why?: string;
    nextCommand?: string;
    verifyCommand?: string;
};

type PrimaryCtaMode = 'single' | 'multi';
type IncidentUserMode = 'guided' | 'standard' | 'expert';

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

function buildReplayQueryFromIncidentReproPack(
    reproPack: NonNullable<NormalizedIncidentActionResultPayload['incidentReproPack']>
): string {
    const replay = reproPack.replayPayload;
    const verifyList = replay.verifyChecklist.length > 0
        ? replay.verifyChecklist.map((item, index) => `${index + 1}. ${item}`).join('\n')
        : '1. Run deterministic verification checks for this flow.';
    const blockedReasons = replay.blockedReasons.length > 0
        ? replay.blockedReasons.map((item, index) => `${index + 1}. ${item}`).join('\n')
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
    modelId,
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
    hasProjectSelected = false,
    userMode = 'standard',
    onUserModeChange,
}: AIIncidentStudioProps) {
    const [commandInput, setCommandInput] = useState('');
    const [lastCopiedCommand, setLastCopiedCommand] = useState<string | null>(null);
    const [lastUserQuery, setLastUserQuery] = useState<string | null>(null);
    const [expandedConversationIds, setExpandedConversationIds] = useState<Record<string, boolean>>({});
    const [showAllSidebarIssues, setShowAllSidebarIssues] = useState(false);
    const [shouldAutoScrollThread, setShouldAutoScrollThread] = useState(true);
    const threadRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom whenever history grows or streaming is active
    const [activeUserMode, setActiveUserMode] = useState<IncidentUserMode>(userMode);
    const cycleUserMode = () =>
        setActiveUserMode((currentMode) => {
            const nextMode =
                currentMode === 'guided' ? 'standard' : currentMode === 'standard' ? 'expert' : 'guided';
            onUserModeChange?.(nextMode);
            return nextMode;
        });

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
    const aiUnavailable = isNetworkFailure(lastError);
    const analysisDepth = Math.min(100, 45 + conversationTurns * 8);
    const confidence = aiUnavailable ? 42 : Math.min(94, 68 + conversationTurns * 5);
    const commandSummary = telemetry?.commandSummary ?? null;
    const onboardingSummary = telemetry?.onboardingSummary ?? null;
    const ctaVariantBreakdown = telemetry?.ctaVariantBreakdown ?? null;
    const studioHardGateStatus = telemetry?.studioHardGateStatus ?? null;
    const studioRollbackKpiStatus = telemetry?.studioRollbackKpiStatus ?? null;
    const studioReproPackKpiStatus = telemetry?.studioReproPackKpiStatus ?? null;
    const doctorSummary = telemetry?.doctorSummary ?? null;
    const hasDoctorSnapshot = Boolean(doctorSummary);
    const snapshotHealthPercent = hasDoctorSnapshot ? doctorSummary!.health.percent : confidence;
    const projectsWithIssuesRatio =
        hasDoctorSnapshot && doctorSummary!.projectCount > 0
            ? Math.round((doctorSummary!.projectsWithIssues / doctorSummary!.projectCount) * 100)
            : analysisDepth;
    const incidentCount = Math.max(
        3,
        commandSummary?.totalEvents
            ? Math.min(99, Math.ceil(commandSummary.totalEvents / 3))
            : 1 + Math.floor(conversationTurns / 2)
    );
    const hardGateVerifyReach = studioHardGateStatus?.metrics.verifyPhaseReach ?? null;
    const hardGateBridgeCompletion = studioHardGateStatus?.metrics.bridgeRouteCompletionRate ?? null;
    const hardGateVerifyMeter = Math.max(0, Math.min(100, hardGateVerifyReach ?? 0));
    const hardGateBridgeMeter = Math.max(0, Math.min(100, hardGateBridgeCompletion ?? 0));
    const rollbackAutoSuccessRate = studioRollbackKpiStatus?.metrics.verifyAutoRollbackSuccessRate ?? null;
    const rollbackFalseConfidenceRate = studioRollbackKpiStatus?.metrics.falseConfidenceRate ?? null;
    const rollbackSuccessMeter = Math.max(0, Math.min(100, rollbackAutoSuccessRate ?? 0));
    const rollbackFalseConfidenceMeter = Math.max(0, Math.min(100, rollbackFalseConfidenceRate ?? 0));

    const studioEventLabelMap: Record<string, string> = {
        'workspai.studio.next_action_clicked': 'Actions triggered',
        'workspai.studio.loop_started': 'Sessions started',
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

    const verifySteps = [
        { label: 'Context packet prepared', done: true },
        { label: 'Patch candidate scored', done: !aiUnavailable && (isAnalyzing || conversationTurns > 0) },
        { label: 'Risk and blast-radius check', done: !aiUnavailable && conversationTurns > 1 },
        { label: 'Deterministic validation ready', done: true },
    ];

    const sortedBoardActions = useMemo(() => {
        const rawActions = chatBrainBoard?.actions || [];
        return [...rawActions].sort((a, b) => {
            const byRisk = riskPriority(a.riskLevel) - riskPriority(b.riskLevel);
            if (byRisk !== 0) {
                return byRisk;
            }
            return a.label.localeCompare(b.label);
        });
    }, [chatBrainBoard?.actions]);
    const primaryBoardAction = sortedBoardActions[0];
    const secondaryBoardActions = sortedBoardActions.slice(1, 4);
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

    const phaseProgress = useMemo(() => {
        const steps = [
            {
                key: 'detect',
                label: 'Detect',
                done: true,
                cue: doctorSummary?.generatedAt
                    ? `Doctor ${formatRelativeCue(doctorSummary.generatedAt)}`
                    : 'Workspace signals loaded',
            },
            {
                key: 'diagnose',
                label: 'Diagnose',
                done: conversationTurns > 0 || isAnalyzing,
                cue: isAnalyzing
                    ? 'AI reading context'
                    : conversationTurns > 0
                        ? `${conversationTurns} turn${conversationTurns === 1 ? '' : 's'}`
                        : 'Awaiting first query',
            },
            {
                key: 'plan',
                label: 'Plan',
                done: !aiUnavailable && conversationTurns > 1,
                cue: sortedBoardActions.length > 0
                    ? `${sortedBoardActions.length} action${sortedBoardActions.length === 1 ? '' : 's'} queued`
                    : 'No action plan yet',
            },
            {
                key: 'verify',
                label: 'Verify',
                done: commandSummary?.totalEvents ? commandSummary.totalEvents > 3 : false,
                cue: chatBrainActionResult?.success
                    ? 'Proof captured'
                    : latestStructuredResponse?.verifyCommand
                        ? 'Verify command ready'
                        : 'Verification pending',
            },
            {
                key: 'learn',
                label: 'Learn',
                done: Boolean(onboardingSummary?.followupClicked),
                cue: onboardingSummary?.followupClicked
                    ? `${onboardingSummary.followupClicked} pattern${onboardingSummary.followupClicked === 1 ? '' : 's'} reused`
                    : 'Capture next reusable pattern',
            },
        ];
        // Enforce sequential progression: a step is only done if all prior steps are done
        let priorAllDone = true;
        for (const step of steps) {
            if (!priorAllDone) {
                step.done = false;
            } else if (!step.done) {
                priorAllDone = false;
            }
        }

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
        sortedBoardActions.length,
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
    const nextActionLabel = sortedBoardActions[0]?.label ?? 'Ask AI for the next step';
    const summaryTitle = aiUnavailable
        ? 'AI is temporarily unavailable'
        : isAnalyzing
            ? 'AI is analyzing this workspace'
            : sortedBoardActions.length > 0
                ? 'AI found the next actions for you'
                : 'Ask AI to inspect the current workspace';
    const summaryText = aiUnavailable
        ? 'Switch to deterministic checks now, then retry AI when the connection recovers.'
        : isAnalyzing
            ? 'Stay here. The conversation and action list will update in this Studio.'
            : sortedBoardActions.length > 0
                ? `Current phase: ${activePhase}. Start with "${nextActionLabel}" or ask a follow-up below.`
                : 'Use the input below to describe a bug, add a service, inspect risk, or debug a failing flow.';
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
    const focusNarrative = latestStructuredResponse?.whatHappened || latestAssistantEntry?.text || summaryText;
    const focusReason = latestStructuredResponse?.why || null;
    const focusHeadline = latestStructuredResponse?.whatHappened ? 'Latest diagnosis' : summaryTitle;
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
            addChip({
                id: 'fallback-inspect-logs',
                label: 'Inspect logs',
                detail: 'Start with runtime evidence to reduce guesswork in the next step.',
                kind: 'terminal-bridge',
            });
            addChip({
                id: 'fallback-preview-fix',
                label: 'Preview safe fix',
                detail: 'Generate a patch proposal before editing the workspace.',
                kind: 'fix-preview',
            });
            addChip({
                id: 'fallback-blast-radius',
                label: 'Check blast radius',
                detail: 'Review impact before rollout or refactor.',
                kind: 'change-impact',
            });
            addChip({
                id: 'fallback-save-pattern',
                label: 'Save incident pattern',
                detail: 'Store the diagnosis path as reusable workspace memory.',
                kind: 'memory-wizard',
            });
        }

        const maxChips = activeUserMode === 'guided' ? 3 : activeUserMode === 'expert' ? 7 : 5;
        return chips.slice(0, maxChips).map((chip, index) => ({
            ...chip,
            isPrimary: primaryCtaMode === 'single' ? index === 0 : true,
        }));
    }, [
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

    const runStudioAction = (
        actionType: 'terminal-bridge' | 'fix-preview-lite' | 'change-impact-lite' | 'workspace-memory-wizard',
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
        <section className="incident-studio" aria-label="AI Incident Studio">
            <div className="incident-studio-header">
                <div className="incident-studio-title-wrap">
                    <Sparkles size={14} style={{ color: '#00b894' }} />
                    <span className="incident-studio-title">AI Incident Studio</span>
                    <span className="incident-studio-subtitle">
                        {workspaceName ? workspaceName : 'No active workspace'}
                    </span>
                </div>
                <div className="incident-studio-status-wrap">
                    <span className={`incident-studio-badge ${aiUnavailable ? 'is-risk' : 'is-ok'}`}>
                        {aiUnavailable ? 'Needs fallback' : isAnalyzing ? 'Analyzing now' : 'Ready'}
                    </span>
                    {modelId ? <span className="incident-studio-model">{modelId}</span> : null}
                    <button
                        type="button"
                        className={`incident-mode-toggle incident-mode-toggle--${activeUserMode}`}
                        onClick={cycleUserMode}
                        title="Switch mode: Guided → Standard → Expert"
                    >
                        {activeUserMode === 'guided' ? '🧭 Guided' : activeUserMode === 'expert' ? '⚡ Expert' : '⚙ Standard'}
                    </button>
                </div>
            </div>

            <ol className="incident-phase-rail" aria-label="Incident lifecycle">
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

            <div className="incident-studio-grid">
                <main className="incident-analysis-panel">
                    <div className="incident-panel-heading incident-panel-heading--brand">
                        <Activity size={13} />
                        <span>Live Diagnosis</span>
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
                                    <h3>{latestAssistantEntry ? 'Current diagnosis' : 'Workspace ready for incident analysis'}</h3>
                                    <p>{focusNarrative}</p>
                                    <small className="incident-mode-hint">{modeHint}</small>
                                </div>
                                {focusReason ? (
                                    <div className="incident-focus-reason">
                                        <strong>Why this is likely</strong>
                                        <p>{focusReason}</p>
                                    </div>
                                ) : null}
                            </details>
                            {architectureLens ? (
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

                    <div className="incident-health-snapshot">
                        <div className="incident-panel-heading">
                            <BarChart3 size={13} />
                            <span>Workspace Health Snapshot</span>
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
                                <small>{snapshotHealthPercent}%</small>
                            </summary>
                            <div className="incident-metric-card">
                                <span>{hasDoctorSnapshot ? 'Workspace health' : 'AI confidence'}</span>
                                <strong>{snapshotHealthPercent}%</strong>
                                <div className="incident-meter">
                                    <span style={{ width: `${snapshotHealthPercent}%` }} />
                                </div>
                            </div>
                            <div className="incident-metric-card">
                                <span>{hasDoctorSnapshot ? 'Projects with issues' : 'Analysis progress'}</span>
                                <strong>
                                    {hasDoctorSnapshot
                                        ? `${doctorSummary!.projectsWithIssues}/${doctorSummary!.projectCount}`
                                        : `${analysisDepth}%`}
                                </strong>
                                <div className="incident-meter">
                                    <span style={{ width: `${projectsWithIssuesRatio}%` }} />
                                </div>
                            </div>
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
                                            ? `${doctorSummary!.issueCount} issue(s) detected`
                                            : `${incidentCount} items tracked`}
                                    </span>
                                </div>
                                <div>
                                    <RotateCw size={12} />
                                    <span>
                                        {isAnalyzing
                                            ? 'AI is updating this view'
                                            : hasDoctorSnapshot
                                                ? 'Doctor evidence loaded from workspace'
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
                                            {doctorSummary!.projects.slice(0, 4).map((project) => (
                                                <div
                                                    key={project.name}
                                                    className={`incident-doctor-project-item incident-doctor-project-item--${doctorProjectSeverity(project)}`}
                                                >
                                                    <strong>{project.name}</strong>
                                                    <span>
                                                        {project.framework || 'unknown framework'} · {project.issues} issue(s)
                                                    </span>
                                                </div>
                                            ))}
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
                            title="Run deterministic workspace checks"
                        >
                            <ShieldCheck size={12} />
                            <span>Checks</span>
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
                                            <strong>Diagnosis confidence</strong>
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
                                    {chatBrainActionResult.rollback ? (
                                        <div className={`incident-rollback-evidence is-${chatBrainActionResult.rollback.status}`}>
                                            <strong>Rollback evidence</strong>
                                            <p>
                                                Status: {chatBrainActionResult.rollback.status}
                                                {chatBrainActionResult.rollback.attempted ? ' (auto attempted)' : ''}
                                            </p>
                                            {chatBrainActionResult.rollback.reason ? (
                                                <p>{chatBrainActionResult.rollback.reason}</p>
                                            ) : null}
                                            {chatBrainActionResult.rollback.restoredFiles.length > 0 ? (
                                                <p>
                                                    Restored files ({chatBrainActionResult.rollback.restoredFiles.length}):{' '}
                                                    {chatBrainActionResult.rollback.restoredFiles.slice(0, 4).join(', ')}
                                                </p>
                                            ) : null}
                                            {chatBrainActionResult.rollback.failedFiles.length > 0 ? (
                                                <p>
                                                    Pending manual restore ({chatBrainActionResult.rollback.failedFiles.length}):{' '}
                                                    {chatBrainActionResult.rollback.failedFiles.slice(0, 3).join(', ')}
                                                </p>
                                            ) : null}
                                            {chatBrainActionResult.rollback.suggestedNextStep ? (
                                                <p>{chatBrainActionResult.rollback.suggestedNextStep}</p>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    {chatBrainActionResult.sandboxSimulation ? (
                                        <div className={`incident-rollback-evidence is-${chatBrainActionResult.sandboxSimulation.status}`}>
                                            <strong>Sandbox simulation evidence</strong>
                                            <p>
                                                Status: {chatBrainActionResult.sandboxSimulation.status}
                                                {chatBrainActionResult.sandboxSimulation.safeToApply
                                                    ? ' · safe to apply'
                                                    : ' · keep apply blocked'}
                                            </p>
                                            <p>
                                                Risk class: {chatBrainActionResult.sandboxSimulation.riskClass}
                                                {' · '}
                                                Commands: {chatBrainActionResult.sandboxSimulation.commandResults.length}
                                            </p>
                                            {chatBrainActionResult.sandboxSimulation.reason ? (
                                                <p>{chatBrainActionResult.sandboxSimulation.reason}</p>
                                            ) : null}
                                            {chatBrainActionResult.sandboxSimulation.recommendedRollbackPath ? (
                                                <p>{chatBrainActionResult.sandboxSimulation.recommendedRollbackPath}</p>
                                            ) : null}
                                            {chatBrainActionResult.sandboxSimulation.commandResults.length > 0 ? (
                                                <p>
                                                    Command outcomes:{' '}
                                                    {chatBrainActionResult.sandboxSimulation.commandResults
                                                        .slice(0, 3)
                                                        .map((result) => `${result.command} (${result.exitCode === 0 ? 'pass' : 'fail'})`)
                                                        .join(', ')}
                                                </p>
                                            ) : null}
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
                                    ) : null}
                                    {chatBrainActionResult.incidentReproPack ? (
                                        <div className={`incident-rollback-evidence is-${chatBrainActionResult.incidentReproPack.status === 'captured' ? 'passed' : chatBrainActionResult.incidentReproPack.status}`}>
                                            <strong>Incident repro pack</strong>
                                            <p>
                                                Status: {chatBrainActionResult.incidentReproPack.status}
                                                {' · Pack ID: '}
                                                {chatBrainActionResult.incidentReproPack.packId}
                                            </p>
                                            <p>
                                                Redaction: {chatBrainActionResult.incidentReproPack.redaction.applied ? 'applied' : 'not applied'}
                                                {' · fields: '}
                                                {chatBrainActionResult.incidentReproPack.redaction.redactedFields.length > 0
                                                    ? chatBrainActionResult.incidentReproPack.redaction.redactedFields.slice(0, 5).join(', ')
                                                    : 'none'}
                                            </p>
                                            <p>
                                                Replay payload: {chatBrainActionResult.incidentReproPack.replayPayload.verifyChecklist.length} verify checks
                                                {' · '}
                                                {chatBrainActionResult.incidentReproPack.replayPayload.blockedReasons.length} blocked reasons
                                            </p>
                                            {chatBrainActionResult.incidentReproPack.exportHint ? (
                                                <p>{chatBrainActionResult.incidentReproPack.exportHint}</p>
                                            ) : null}
                                            <div className="incident-command-actions">
                                                <button
                                                    type="button"
                                                    className="incident-btn"
                                                    onClick={() => {
                                                        const reproPack = chatBrainActionResult.incidentReproPack;
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
                                                        const reproPack = chatBrainActionResult.incidentReproPack;
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
                                    ) : null}
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
                                        {(primaryCtaMode === 'single' ? secondaryBoardActions : sortedBoardActions).length > 0 ? (
                                            <div className="incident-board-actions incident-board-actions--chat">
                                                {(primaryCtaMode === 'single' ? secondaryBoardActions : sortedBoardActions).map((action) => {
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
