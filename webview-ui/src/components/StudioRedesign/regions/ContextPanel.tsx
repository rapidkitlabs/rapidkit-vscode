/**
 * ContextPanel: Health summary, policy gates, related files with badges
 * Enterprise right-side information panel
 */

import React, { useMemo, useState } from 'react';
import { Clock, TrendingDown, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import {
    colorTokens,
    spacing,
    typography,
    borderRadius,
    transitions,
} from '../styles/designTokens';
import {
    HealthMetrics,
    PolicyGateState,
    RelatedFile,
    RELEASE_GATE_LABELS,
} from '../state/studioState';

interface ContextPanelProps {
    health: HealthMetrics;
    relatedFiles: RelatedFile[];
    policyGates: PolicyGateState;
    userMode: 'guided' | 'standard' | 'expert';
}

interface ModuleGraphItem {
    id: string;
    name: string;
    framework: 'fastapi' | 'nestjs' | 'shared';
    severity: 'healthy' | 'warning' | 'critical';
    freshness: string;
    summary: string;
}

const MODULE_GRAPH_SEED: ModuleGraphItem[] = [
    {
        id: 'stripe-payment',
        name: 'Stripe Payment',
        framework: 'nestjs',
        severity: 'healthy',
        freshness: '1m ago',
        summary: 'Billing defaults, retry policy, and webhook health.',
    },
    {
        id: 'notifications',
        name: 'Notifications',
        framework: 'fastapi',
        severity: 'warning',
        freshness: '3m ago',
        summary: 'Delivery adapters and retry surfaces.',
    },
    {
        id: 'security-headers',
        name: 'Security Headers',
        framework: 'shared',
        severity: 'healthy',
        freshness: '5m ago',
        summary: 'Security defaults and health shim wiring.',
    },
    {
        id: 'rate-limiting',
        name: 'Rate Limiting',
        framework: 'fastapi',
        severity: 'critical',
        freshness: '8m ago',
        summary: 'Throttle rules and guardrails under load.',
    },
    {
        id: 'ai-assistant',
        name: 'AI Assistant',
        framework: 'nestjs',
        severity: 'warning',
        freshness: '7m ago',
        summary: 'Provider-agnostic assistant orchestration.',
    },
];

export const ContextPanel: React.FC<ContextPanelProps> = ({
    health,
    relatedFiles,
    policyGates,
    userMode,
}) => {
    const [frameworkFilter, setFrameworkFilter] = useState<'all' | ModuleGraphItem['framework']>('all');
    const [severityFilter, setSeverityFilter] = useState<'all' | ModuleGraphItem['severity']>('all');
    const [moduleSearch, setModuleSearch] = useState('');

    const totalModules = health.modulesOk + health.modulesWarning + health.modulesError;
    const healthPercent = totalModules > 0
        ? Math.round((health.modulesOk / totalModules) * 100)
        : 0;

    const getFileHealthBadge = (health: string) => {
        switch (health) {
            case 'ok':
                return { color: colorTokens.health.ok, label: '✓ OK' };
            case 'warning':
                return { color: colorTokens.health.warning, label: '⚠ WARN' };
            case 'error':
                return { color: colorTokens.health.error, label: '✗ ERR' };
            default:
                return { color: colorTokens.text.quaternary, label: '? UNK' };
        }
    };

    const frameworkOptions = useMemo(
        () => Array.from(new Set(MODULE_GRAPH_SEED.map((item) => item.framework))),
        [],
    );

    const filteredModules = useMemo(
        () =>
            MODULE_GRAPH_SEED.filter((item) => {
                const frameworkMatch = frameworkFilter === 'all' || item.framework === frameworkFilter;
                const severityMatch = severityFilter === 'all' || item.severity === severityFilter;
                const searchMatch = moduleSearch.trim().length === 0 ||
                    `${item.name} ${item.summary}`.toLowerCase().includes(moduleSearch.toLowerCase());
                return frameworkMatch && severityMatch && searchMatch;
            }),
        [frameworkFilter, moduleSearch, severityFilter],
    );

    const moduleGroups = useMemo(() => {
        return frameworkOptions.map((framework) => ({
            framework,
            modules: filteredModules.filter((item) => item.framework === framework),
        })).filter((group) => group.modules.length > 0);
    }, [filteredModules, frameworkOptions]);

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: colorTokens.surface3,
                border: `1px solid ${colorTokens.border.subtle}`,
                borderRadius: '0px',
                height: '100%',
                overflowY: 'auto',
                overflowX: 'hidden',
                boxShadow: 'none',
            }}
        >
            {/* Health Summary Card */}
            <div
                style={{
                    padding: spacing.md,
                    borderBottom: `1px solid ${colorTokens.border.subtle}`,
                }}
            >
                <div
                    style={{
                        ...typography.labelSmall,
                        marginBottom: spacing.md,
                        color: colorTokens.text.quaternary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                    }}
                >
                    System Health
                </div>

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.lg,
                        marginBottom: spacing.md,
                        padding: spacing.md,
                        backgroundColor: colorTokens.surface3,
                        borderRadius: borderRadius.md,
                        border: `1px solid ${colorTokens.border.subtle}`,
                    }}
                >
                    {/* Health Ring */}
                    <div
                        style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            backgroundColor: colorTokens.surface2,
                            border: `2px solid ${colorTokens.health.ok}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <div
                            style={{
                                width: '56px',
                                height: '56px',
                                borderRadius: '50%',
                                backgroundColor: colorTokens.surface2,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <span
                                style={{
                                    ...typography.h3,
                                    color: colorTokens.health.ok,
                                    fontWeight: 700,
                                }}
                            >
                                {healthPercent}%
                            </span>
                        </div>
                    </div>

                    {/* Stats */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: spacing.md,
                            }}
                        >
                            <div
                                style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    backgroundColor: colorTokens.health.ok,
                                }}
                            />
                            <span style={{ ...typography.body, color: colorTokens.text.secondary }}>
                                {health.modulesOk} Healthy
                            </span>
                        </div>
                        {health.modulesWarning > 0 && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: spacing.md,
                                }}
                            >
                                <div
                                    style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        backgroundColor: colorTokens.health.warning,
                                    }}
                                />
                                <span style={{ ...typography.body, color: colorTokens.text.secondary }}>
                                    {health.modulesWarning} Warning
                                </span>
                            </div>
                        )}
                        {health.modulesError > 0 && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: spacing.md,
                                }}
                            >
                                <div
                                    style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        backgroundColor: colorTokens.health.error,
                                    }}
                                />
                                <span style={{ ...typography.body, color: colorTokens.text.secondary }}>
                                    {health.modulesError} Error
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {health.systemLastCheck && (
                    <div
                        style={{
                            ...typography.caption,
                            color: colorTokens.text.quaternary,
                            textAlign: 'center',
                        }}
                    >
                        Last check: {health.systemLastCheck}
                    </div>
                )}
            </div>

            {/* Policy Gates Card */}
            <div
                style={{
                    padding: spacing.md,
                    borderBottom: `1px solid ${colorTokens.border.subtle}`,
                }}
            >
                <div
                    style={{
                        ...typography.labelSmall,
                        marginBottom: spacing.md,
                        color: colorTokens.text.quaternary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                    }}
                >
                    Policy Gates
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                    <PolicyGateBadge
                        label="Flow State"
                        state={policyGates.flowState}
                    />
                    <PolicyGateBadge
                        label="Telemetry"
                        state={policyGates.telemetryState}
                    />

                    <div
                        style={{
                            padding: spacing.md,
                            backgroundColor: colorTokens.surface3,
                            borderRadius: borderRadius.md,
                            border: `1px solid ${colorTokens.border.subtle}`,
                        }}
                    >
                        <div
                            style={{
                                ...typography.caption,
                                marginBottom: spacing.md,
                                color: colorTokens.text.quaternary,
                                textTransform: 'uppercase',
                                letterSpacing: '0.3px',
                            }}
                        >
                            Release Posture
                        </div>
                        <div
                            style={{
                                ...typography.h3,
                                color:
                                    policyGates.releasePosture === 'go'
                                        ? colorTokens.health.ok
                                        : policyGates.releasePosture === 'no-go'
                                            ? colorTokens.error
                                            : colorTokens.warning,
                                fontWeight: 700,
                                marginBottom: spacing.md,
                            }}
                        >
                            {RELEASE_GATE_LABELS[policyGates.releasePosture]}
                        </div>
                        {policyGates.artifactId && userMode === 'expert' && (
                            <div
                                style={{
                                    ...typography.code,
                                    color: colorTokens.text.quaternary,
                                    wordBreak: 'break-all',
                                    padding: spacing.sm,
                                    backgroundColor: colorTokens.surface1,
                                    borderRadius: borderRadius.sm,
                                    border: `1px solid ${colorTokens.border.subtle}`,
                                    ...typography.captionSmall,
                                }}
                            >
                                {policyGates.artifactId}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {userMode === 'expert' ? (
                <>
                    {/* Active Signals */}
                    <div
                        style={{
                            padding: spacing.sm,
                            borderBottom: `1px solid ${colorTokens.border.subtle}`,
                        }}
                    >
                        <div
                            style={{
                                ...typography.labelSmall,
                                marginBottom: spacing.sm,
                                color: colorTokens.text.quaternary,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                            }}
                        >
                            Active Signals
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                            <SignalRow icon={<TrendingDown size={13} />} label="Error rate" value="0.02%" tone="ok" />
                            <SignalRow icon={<AlertTriangle size={13} />} label="Latency P95" value="342ms" tone="warning" />
                            <SignalRow icon={<CheckCircle2 size={13} />} label="Deploy gate" value="Passed" tone="ok" />
                            <SignalRow icon={<ShieldAlert size={13} />} label="Security scan" value="Pending" tone="neutral" />
                            <SignalRow icon={<Clock size={13} />} label="Last event" value="2m ago" tone="neutral" />
                        </div>
                    </div>

                    {/* Traceability Snapshot */}
                    <div
                        style={{
                            padding: spacing.sm,
                            borderBottom: `1px solid ${colorTokens.border.subtle}`,
                        }}
                    >
                        <div
                            style={{
                                ...typography.labelSmall,
                                marginBottom: spacing.sm,
                                color: colorTokens.text.quaternary,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                            }}
                        >
                            Traceability
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: spacing.xs }}>
                            <TraceabilityTile label="Evidence coverage" value={`${relatedFiles.length} sources`} />
                            <TraceabilityTile label="Confidence band" value="High fidelity" />
                            <TraceabilityTile label="Drill-down" value="Enabled" />
                            <TraceabilityTile label="Export readiness" value="Ready" />
                        </div>
                    </div>

                    {/* Module Graph */}
                    <div
                        style={{
                            padding: spacing.sm,
                            borderBottom: `1px solid ${colorTokens.border.subtle}`,
                        }}
                    >
                        <div
                            style={{
                                ...typography.labelSmall,
                                marginBottom: spacing.sm,
                                color: colorTokens.text.quaternary,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                            }}
                        >
                            Module Graph
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, marginBottom: spacing.md }}>
                            <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
                                <select
                                    aria-label="Filter module graph by framework"
                                    value={frameworkFilter}
                                    onChange={(e) => setFrameworkFilter(e.target.value as 'all' | ModuleGraphItem['framework'])}
                                    style={{
                                        flex: '1 1 120px',
                                        padding: `${spacing.sm} ${spacing.md}`,
                                        borderRadius: borderRadius.sm,
                                        backgroundColor: colorTokens.surface3,
                                        border: `1px solid ${colorTokens.border.medium}`,
                                        color: colorTokens.text.primary,
                                        ...typography.caption,
                                    }}
                                >
                                    <option value="all">All frameworks</option>
                                    {frameworkOptions.map((framework) => (
                                        <option key={framework} value={framework}>{framework}</option>
                                    ))}
                                </select>
                                <select
                                    aria-label="Filter module graph by severity"
                                    value={severityFilter}
                                    onChange={(e) => setSeverityFilter(e.target.value as 'all' | ModuleGraphItem['severity'])}
                                    style={{
                                        flex: '1 1 120px',
                                        padding: `${spacing.sm} ${spacing.md}`,
                                        borderRadius: borderRadius.sm,
                                        backgroundColor: colorTokens.surface3,
                                        border: `1px solid ${colorTokens.border.medium}`,
                                        color: colorTokens.text.primary,
                                        ...typography.caption,
                                    }}
                                >
                                    <option value="all">All severities</option>
                                    <option value="healthy">Healthy</option>
                                    <option value="warning">Warning</option>
                                    <option value="critical">Critical</option>
                                </select>
                            </div>
                            <input
                                aria-label="Search module graph"
                                type="text"
                                placeholder="Search modules"
                                value={moduleSearch}
                                onChange={(e) => setModuleSearch(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: `${spacing.sm} ${spacing.md}`,
                                    borderRadius: borderRadius.sm,
                                    backgroundColor: colorTokens.surface3,
                                    border: `1px solid ${colorTokens.border.medium}`,
                                    color: colorTokens.text.primary,
                                    ...typography.caption,
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                            {moduleGroups.length === 0 ? (
                                <div style={{ ...typography.body, color: colorTokens.text.quaternary, textAlign: 'center', padding: `${spacing.lg} ${spacing.md}` }}>
                                    No modules match current filters.
                                </div>
                            ) : (
                                moduleGroups.map((group) => (
                                    <div
                                        key={group.framework}
                                        style={{
                                            padding: spacing.md,
                                            borderRadius: borderRadius.md,
                                            backgroundColor: colorTokens.surface3,
                                            border: `1px solid ${colorTokens.border.subtle}`,
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                                            <div style={{ ...typography.bodySmall, color: colorTokens.text.primary, fontWeight: 600, textTransform: 'capitalize' }}>
                                                {group.framework}
                                            </div>
                                            <span style={{ ...typography.captionSmall, color: colorTokens.text.quaternary }}>
                                                {group.modules.length} module{group.modules.length === 1 ? '' : 's'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                                            {group.modules.map((module) => (
                                                <div
                                                    key={module.id}
                                                    style={{
                                                        padding: spacing.sm,
                                                        borderRadius: borderRadius.sm,
                                                        border: `1px solid ${colorTokens.border.subtle}`,
                                                        backgroundColor: colorTokens.surface2,
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                                                        <span style={{ ...typography.bodySmall, color: colorTokens.text.primary, fontWeight: 500 }}>
                                                            {module.name}
                                                        </span>
                                                        <span
                                                            style={{
                                                                ...typography.captionSmall,
                                                                color:
                                                                    module.severity === 'healthy'
                                                                        ? colorTokens.health.ok
                                                                        : module.severity === 'warning'
                                                                            ? colorTokens.health.warning
                                                                            : colorTokens.error,
                                                                textTransform: 'uppercase',
                                                            }}
                                                        >
                                                            {module.severity}
                                                        </span>
                                                    </div>
                                                    <div style={{ ...typography.caption, color: colorTokens.text.secondary, marginTop: spacing.xs }}>
                                                        {module.summary}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, gap: spacing.sm, flexWrap: 'wrap' }}>
                                                        <span style={{ ...typography.captionSmall, color: colorTokens.text.quaternary }}>
                                                            {module.freshness}
                                                        </span>
                                                        <span style={{ ...typography.captionSmall, color: colorTokens.text.quaternary, textTransform: 'uppercase' }}>
                                                            {module.framework}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <div
                    style={{
                        padding: spacing.sm,
                        borderBottom: `1px solid ${colorTokens.border.subtle}`,
                    }}
                >
                    <div
                        style={{
                            ...typography.labelSmall,
                            marginBottom: spacing.sm,
                            color: colorTokens.text.quaternary,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                        }}
                    >
                        Quick Insight
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: spacing.xs }}>
                        <TraceabilityTile label="Coverage" value={`${relatedFiles.length} sources`} />
                        <TraceabilityTile label="Release" value={RELEASE_GATE_LABELS[policyGates.releasePosture]} />
                    </div>
                </div>
            )}

            {/* Related Files */}
            <div
                style={{
                    padding: spacing.sm,
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                }}
            >
                <div
                    style={{
                        ...typography.labelSmall,
                        marginBottom: spacing.sm,
                        color: colorTokens.text.quaternary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        position: 'sticky',
                        top: 0,
                        backgroundColor: colorTokens.surface1,
                        paddingBottom: spacing.md,
                    }}
                >
                    Related Files
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                    {relatedFiles.length === 0 ? (
                        <div
                            style={{
                                ...typography.body,
                                color: colorTokens.text.quaternary,
                                textAlign: 'center',
                                padding: `${spacing.md} ${spacing.sm}`,
                                opacity: 0.6,
                            }}
                        >
                            No related files
                        </div>
                    ) : (
                        relatedFiles.map((file, idx) => {
                            const badge = getFileHealthBadge(file.health);
                            return (
                                <div
                                    key={idx}
                                    style={{
                                        padding: spacing.md,
                                        backgroundColor: colorTokens.surface3,
                                        borderRadius: borderRadius.md,
                                        border: `1px solid ${colorTokens.border.subtle}`,
                                        cursor: 'pointer',
                                        transition: transitions.standard,
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = colorTokens.primary;
                                        e.currentTarget.style.backgroundColor = colorTokens.surface4;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = colorTokens.border.subtle;
                                        e.currentTarget.style.backgroundColor = colorTokens.surface3;
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            marginBottom: spacing.sm,
                                        }}
                                    >
                                        <span
                                            style={{
                                                ...typography.caption,
                                                flex: 1,
                                                color: colorTokens.text.primary,
                                                fontWeight: 500,
                                                wordBreak: 'break-word',
                                            }}
                                        >
                                            {file.path}
                                        </span>
                                        <span
                                            style={{
                                                ...typography.captionSmall,
                                                color: badge.color,
                                                fontWeight: 700,
                                                marginLeft: spacing.md,
                                                flexShrink: 0,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.2px',
                                            }}
                                        >
                                            {badge.label}
                                        </span>
                                    </div>
                                    {file.freshness && (
                                        <span
                                            style={{
                                                ...typography.caption,
                                                color: colorTokens.text.quaternary,
                                            }}
                                        >
                                            {file.freshness}
                                        </span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

const TraceabilityTile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div
        style={{
            padding: spacing.md,
            borderRadius: borderRadius.md,
            backgroundColor: colorTokens.surface2,
            border: `1px solid ${colorTokens.border.subtle}`,
        }}
    >
        <div style={{ ...typography.captionSmall, color: colorTokens.text.quaternary }}>{label}</div>
        <div style={{ ...typography.bodySmall, color: colorTokens.text.primary, marginTop: spacing.xs }}>
            {value}
        </div>
    </div>
);

interface PolicyGateBadgeProps {
    label: string;
    state: 'passing' | 'warning' | 'blocking' | 'complete' | 'partial' | 'stale';
}

const PolicyGateBadge: React.FC<PolicyGateBadgeProps> = ({ label, state }) => {
    const getStateColor = (s: string) => {
        switch (s) {
            case 'passing':
            case 'complete':
                return colorTokens.health.ok;
            case 'warning':
            case 'partial':
                return colorTokens.health.warning;
            case 'blocking':
            case 'stale':
                return colorTokens.error;
            default:
                return colorTokens.text.quaternary;
        }
    };

    const getBgColor = (s: string) => {
        switch (s) {
            case 'passing':
            case 'complete':
                return colorTokens.successBg;
            case 'warning':
            case 'partial':
                return colorTokens.warningBg;
            case 'blocking':
            case 'stale':
                return colorTokens.errorBg;
            default:
                return colorTokens.surface2;
        }
    };

    return (
        <div
            style={{
                padding: spacing.md,
                backgroundColor: getBgColor(state),
                borderRadius: borderRadius.md,
                border: `1px solid ${getStateColor(state)}33`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: 'none',
            }}
        >
            <span style={{ ...typography.label, color: colorTokens.text.secondary }}>
                {label}
            </span>
            <span
                style={{
                    ...typography.label,
                    color: getStateColor(state),
                    fontWeight: 700,
                    fontSize: '11px',
                    letterSpacing: '0.3px',
                    textTransform: 'uppercase',
                }}
            >
                {state.toUpperCase()}
            </span>
        </div>
    );
};

interface SignalRowProps {
    icon: React.ReactNode;
    label: string;
    value: string;
    tone: 'ok' | 'warning' | 'error' | 'neutral';
}

const SignalRow: React.FC<SignalRowProps> = ({ icon, label, value, tone }) => {
    const toneColor = {
        ok: colorTokens.health.ok,
        warning: colorTokens.health.warning,
        error: colorTokens.health.error,
        neutral: colorTokens.text.tertiary,
    }[tone];

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.md,
                padding: `${spacing.sm} ${spacing.md}`,
                borderRadius: borderRadius.sm,
                backgroundColor: colorTokens.surface2,
                border: `1px solid ${colorTokens.border.subtle}`,
            }}
        >
            <span style={{ color: toneColor, flexShrink: 0, display: 'flex' }}>{icon}</span>
            <span style={{ ...typography.caption, color: colorTokens.text.secondary, flex: 1 }}>
                {label}
            </span>
            <span style={{ ...typography.label, color: toneColor, fontSize: '11px', fontWeight: 600 }}>
                {value}
            </span>
        </div>
    );
};
