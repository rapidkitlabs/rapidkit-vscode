import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import {
    borderRadius,
    colorTokens,
    motionTokens,
    shadows,
    spacing,
    transitions,
    typography,
} from '../styles/designTokens';
import {
    IncidentPhase,
    PolicyGateState,
    ReleaseGatePosture,
    ScopeType,
    UserMode,
} from '../state/studioState';
import { ThemeMode } from '../styles/themeSystem';

interface TopBarProps {
    currentPhase: IncidentPhase;
    policyGates: PolicyGateState;
    userMode: UserMode;
    themeMode: ThemeMode;
    scopeType: ScopeType;
    workspaceName?: string;
    releasePosture: ReleaseGatePosture;
    compactMode?: boolean;
    onUserModeChange: (mode: UserMode) => void;
    onThemeModeChange: (mode: ThemeMode) => void;
    onScopeChange: (scope: ScopeType) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
    policyGates,
    userMode,
    themeMode,
    scopeType,
    workspaceName,
    releasePosture,
    compactMode = false,
    onUserModeChange,
    onThemeModeChange,
    onScopeChange,
}) => {
    const [isScopeOpen, setIsScopeOpen] = useState(false);
    const scopeContainerRef = useRef<HTMLDivElement | null>(null);
    const scopeTriggerRef = useRef<HTMLButtonElement | null>(null);
    const scopeOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const scopeOptions: ScopeType[] = ['workspace', 'project'];

    useEffect(() => {
        if (!isScopeOpen) {
            return;
        }

        const handleDocumentMouseDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (scopeContainerRef.current && target && !scopeContainerRef.current.contains(target)) {
                setIsScopeOpen(false);
            }
        };

        const handleDocumentKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsScopeOpen(false);
            }
        };

        document.addEventListener('mousedown', handleDocumentMouseDown);
        document.addEventListener('keydown', handleDocumentKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleDocumentMouseDown);
            document.removeEventListener('keydown', handleDocumentKeyDown);
        };
    }, [isScopeOpen]);

    useEffect(() => {
        if (!isScopeOpen) {
            return;
        }

        const selectedIndex = scopeOptions.indexOf(scopeType);
        const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;
        scopeOptionRefs.current[focusIndex]?.focus();
    }, [isScopeOpen, scopeType]);

    const handleScopeTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsScopeOpen(true);
        }
    };

    const handleScopeOptionKeyDown = (
        event: React.KeyboardEvent<HTMLButtonElement>,
        index: number,
        scope: ScopeType,
    ) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            setIsScopeOpen(false);
            scopeTriggerRef.current?.focus();
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onScopeChange(scope);
            setIsScopeOpen(false);
            scopeTriggerRef.current?.focus();
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            const nextIndex = (index + direction + scopeOptions.length) % scopeOptions.length;
            scopeOptionRefs.current[nextIndex]?.focus();
        }
    };

    const releaseColor =
        releasePosture === 'go'
            ? colorTokens.health.ok
            : releasePosture === 'no-go'
                ? colorTokens.error
                : colorTokens.warning;

    const releaseLabel =
        releasePosture === 'go'
            ? 'Release Ready'
            : releasePosture === 'no-go'
                ? 'Blocked'
                : 'Evaluating';

    return (
        <header
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.md,
                padding: `${spacing.sm} ${spacing.xl}`,
                borderBottom: `1px solid ${colorTokens.border.subtle}`,
                backgroundColor: colorTokens.surface3,
                backdropFilter: 'none',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                minHeight: '44px',
                flexWrap: 'nowrap',
                animation: `studioEnterUp ${motionTokens.durations.headerEnter}ms ${motionTokens.easing.emphasized} both`,
            }}
        >
            {/* Brand + workspace identity */}
            <Sparkles size={13} color={colorTokens.primary} style={{ flexShrink: 0 }} />
            <span style={{ ...typography.captionSmall, color: colorTokens.text.tertiary, flexShrink: 0, letterSpacing: '0.3px' }}>
                Incident Studio
            </span>
            <span style={{ color: colorTokens.border.medium, fontSize: '14px', flexShrink: 0, userSelect: 'none' }}>·</span>
            <span style={{ ...typography.label, color: colorTokens.text.primary, fontWeight: 600, flexShrink: 0 }}>
                {workspaceName || 'rapidkit-core'}
            </span>

            {/* Scope selector */}
            <div ref={scopeContainerRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                    ref={scopeTriggerRef}
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={isScopeOpen}
                    aria-controls="studio-scope-selector"
                    onClick={() => setIsScopeOpen((open) => !open)}
                    onKeyDown={handleScopeTriggerKeyDown}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.xs,
                        padding: `2px ${spacing.sm}`,
                        borderRadius: borderRadius.md,
                        border: `1px solid ${colorTokens.border.medium}`,
                        background: colorTokens.surface3,
                        color: colorTokens.text.secondary,
                        cursor: 'pointer',
                        transition: transitions.microInteraction,
                    }}
                >
                    <span style={{ ...typography.captionSmall, color: colorTokens.text.quaternary }}>Scope</span>
                    <span style={{ ...typography.captionSmall, color: colorTokens.text.primary }}>
                        {scopeType === 'workspace' ? 'Workspace' : 'Project'}
                    </span>
                    <ChevronDown
                        size={11}
                        color={colorTokens.text.quaternary}
                        style={{
                            transform: isScopeOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: transitions.microInteraction,
                        }}
                    />
                </button>

                {isScopeOpen && (
                    <div
                        id="studio-scope-selector"
                        role="listbox"
                        aria-label="Scope selector"
                        style={{
                            position: 'absolute',
                            top: 'calc(100% + 6px)',
                            left: 0,
                            minWidth: '200px',
                            overflow: 'hidden',
                            borderRadius: borderRadius.md,
                            border: `1px solid ${colorTokens.border.medium}`,
                            backgroundColor: colorTokens.surface3,
                            boxShadow: 'none',
                            zIndex: 110,
                        }}
                    >
                        {scopeOptions.map((scope, index) => (
                            <button
                                key={scope}
                                ref={(el) => {
                                    scopeOptionRefs.current[index] = el;
                                }}
                                type="button"
                                role="option"
                                aria-selected={scopeType === scope}
                                onClick={() => {
                                    onScopeChange(scope);
                                    setIsScopeOpen(false);
                                    scopeTriggerRef.current?.focus();
                                }}
                                onKeyDown={(event) => handleScopeOptionKeyDown(event, index, scope)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    gap: spacing.xs,
                                    padding: `${spacing.md} ${spacing.lg}`,
                                    border: 'none',
                                    borderBottom: scope === 'workspace' ? `1px solid ${colorTokens.border.subtle}` : 'none',
                                    background: scopeType === scope ? colorTokens.primaryInverse : 'transparent',
                                    color: colorTokens.text.primary,
                                    cursor: 'pointer',
                                    transition: transitions.microInteraction,
                                }}
                            >
                                <span style={{ ...typography.label, color: scopeType === scope ? colorTokens.primary : colorTokens.text.primary }}>
                                    {scope === 'workspace' ? 'Workspace Aggregated' : 'Project Scoped'}
                                </span>
                                <span style={{ ...typography.caption, color: colorTokens.text.tertiary }}>
                                    {scope === 'workspace'
                                        ? 'Cross-module signals and fleet-level traceability.'
                                        : 'Focused execution against the active module.'}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Release posture — inline pill */}
            <div
                role="status"
                aria-label={`Release posture: ${releaseLabel}`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    padding: `3px ${spacing.md}`,
                    borderRadius: borderRadius.md,
                    border: `1px solid ${releaseColor}33`,
                    backgroundColor: `${releaseColor}0f`,
                    flexShrink: 0,
                }}
            >
                <span
                    style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: releaseColor,
                        flexShrink: 0,
                        animation: releasePosture === 'pending' ? `pulse ${motionTokens.durations.pulse}ms infinite` : undefined,
                    }}
                />
                <span style={{ ...typography.captionSmall, color: releaseColor, fontWeight: 600 }}>{releaseLabel}</span>
                <span style={{ color: colorTokens.border.medium, ...typography.captionSmall, userSelect: 'none' }}>·</span>
                <span style={{ ...typography.captionSmall, color: colorTokens.text.tertiary }}>
                    {policyGates.flowState === 'passing' ? 'Flow verified' : policyGates.flowState === 'warning' ? 'Flow degraded' : 'Flow blocked'}
                </span>
            </div>

            {/* Theme mode toggle */}
            <div
                role="group"
                aria-label="Theme mode"
                style={{
                    display: 'flex',
                    gap: '2px',
                    padding: '3px',
                    borderRadius: borderRadius.md,
                    border: `1px solid ${colorTokens.border.medium}`,
                    background: colorTokens.surface2,
                    flexShrink: 0,
                }}
            >
                {(['auto', 'light', 'dark'] as ThemeMode[]).map((mode) => {
                    const isActive = themeMode === mode;
                    return (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => onThemeModeChange(mode)}
                            aria-pressed={isActive}
                            title={mode === 'auto' ? 'Follow VS Code theme' : mode === 'light' ? 'Force light theme' : 'Force dark theme'}
                            style={{
                                padding: `3px ${spacing.md}`,
                                borderRadius: borderRadius.sm,
                                border: isActive ? `1px solid ${colorTokens.primary}66` : '1px solid transparent',
                                background: isActive ? colorTokens.primaryInverse : 'transparent',
                                color: isActive ? colorTokens.text.primary : colorTokens.text.quaternary,
                                cursor: 'pointer',
                                transition: transitions.microInteraction,
                                ...typography.captionSmall,
                                fontWeight: isActive ? 600 : 400,
                                textTransform: 'capitalize',
                            }}
                        >
                            {mode}
                        </button>
                    );
                })}
            </div>

            {/* User mode toggle */}
            {!compactMode ? (
                <div
                    role="group"
                    aria-label="User mode"
                    style={{
                        display: 'flex',
                        gap: '2px',
                        padding: '3px',
                        borderRadius: borderRadius.md,
                        border: `1px solid ${colorTokens.border.medium}`,
                        background: colorTokens.surface2,
                        flexShrink: 0,
                    }}
                >
                    {(['guided', 'standard', 'expert'] as UserMode[]).map((mode) => {
                        const isActive = userMode === mode;
                        return (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => onUserModeChange(mode)}
                                aria-pressed={isActive}
                                title={
                                    mode === 'guided'
                                        ? 'Safe step-by-step workflow'
                                        : mode === 'standard'
                                            ? 'Balanced control and automation'
                                            : 'Advanced detail and operator control'
                                }
                                style={{
                                    padding: `3px ${spacing.md}`,
                                    borderRadius: borderRadius.sm,
                                    border: isActive ? `1px solid ${colorTokens.primary}66` : '1px solid transparent',
                                    background: isActive ? colorTokens.primaryInverse : 'transparent',
                                    color: isActive ? colorTokens.text.primary : colorTokens.text.quaternary,
                                    cursor: 'pointer',
                                    transition: transitions.microInteraction,
                                    ...typography.captionSmall,
                                    fontWeight: isActive ? 600 : 400,
                                }}
                            >
                                {mode === 'guided' ? 'Guided' : mode === 'standard' ? 'Standard' : 'Expert'}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() =>
                        onUserModeChange(
                            userMode === 'guided'
                                ? 'standard'
                                : userMode === 'standard'
                                    ? 'expert'
                                    : 'guided',
                        )
                    }
                    title="Cycle user mode"
                    style={{
                        padding: `4px ${spacing.md}`,
                        borderRadius: borderRadius.md,
                        border: `1px solid ${colorTokens.border.medium}`,
                        background: colorTokens.surface2,
                        color: colorTokens.text.secondary,
                        ...typography.captionSmall,
                    }}
                >
                    Mode: {userMode}
                </button>
            )}
        </header>
    );
};

