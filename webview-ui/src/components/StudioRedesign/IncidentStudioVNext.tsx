/**
 * IncidentStudioVNext: Main wrapper component
 * 3-column fullscreen layout: TopBar | PhaseStepper | ActivityBar + Sidebar + ContextPanel + ChatSurface (flex)
 * Input is fixed at bottom of chat, messages scroll independently.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
    createInitialState,
    IncidentStudioState,
    IncidentPhase,
    UserMode,
    ChatMessage,
    ActionItem,
    canTransitionToPhase,
} from './state/studioState';
import { colorTokens, fontTokens, layout } from './styles/designTokens';
import { getActiveTheme, loadThemePreference, saveThemePreference, ThemeMode } from './styles/themeSystem';
import { GlobalStyles } from './styles/globalStyles';
import { ErrorBoundary } from './ErrorBoundary';
import { TopBar } from './regions/TopBar';
import { PhaseStepper } from './regions/PhaseStepper';
import { ActivityBar } from './regions/ActivityBar';
import { WorkspaceSidebar } from './regions/WorkspaceSidebar';
import { ContextPanel } from './regions/ContextPanel';
import { ChatSurface } from './regions/ChatSurface';

interface IncidentStudioVNextProps {
    onSendMessage?: (message: string) => void;
    initialState?: Partial<IncidentStudioState>;
}

export const IncidentStudioVNext: React.FC<IncidentStudioVNextProps> = ({
    onSendMessage,
    initialState,
}) => {
    const [state, setState] = useState<IncidentStudioState>(
        createInitialState(initialState),
    );
    const [viewportWidth, setViewportWidth] = useState<number>(
        typeof window !== 'undefined' ? window.innerWidth : 1366,
    );
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadThemePreference());
    const [, setThemeTick] = useState(0);
    const themeSignatureRef = useRef<string>('');
    const phaseTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);

        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        return () => {
            if (phaseTransitionTimeoutRef.current) {
                clearTimeout(phaseTransitionTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const applyTheme = () => {
            const nextTheme = getActiveTheme(themeMode);
            const nextSignature = JSON.stringify(nextTheme);
            if (themeSignatureRef.current === nextSignature) {
                return;
            }

            themeSignatureRef.current = nextSignature;
            Object.assign(colorTokens, nextTheme);
            setThemeTick((v) => v + 1);
        };

        applyTheme();

        if (themeMode !== 'auto' || typeof MutationObserver === 'undefined' || typeof document === 'undefined') {
            return;
        }

        const observer = new MutationObserver(() => {
            applyTheme();
        });

        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['class', 'data-vscode-theme-kind'],
            });
        }
        if (document.documentElement) {
            observer.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'style', 'data-vscode-theme-kind'],
            });
        }

        if (document.head) {
            observer.observe(document.head, {
                childList: true,
                subtree: true,
                characterData: true,
            });
        }

        // Some VS Code theme switches only update CSS variables; poll a tiny signature as fallback.
        const intervalId = window.setInterval(() => {
            applyTheme();
        }, 500);

        return () => {
            observer.disconnect();
            window.clearInterval(intervalId);
        };
    }, [themeMode]);

    const handleThemeModeChange = useCallback((mode: ThemeMode) => {
        saveThemePreference(mode);
        setThemeMode(mode);
    }, []);

    const sidebarItems = useMemo(
        () => [
            { id: 'decision-layer', name: 'Decision Layer', type: 'workspace' as const },
            { id: 'action-matrix', name: 'Action Matrix', type: 'workspace' as const },
            { id: 'doctor-evidence', name: 'Doctor Evidence', type: 'module' as const },
            { id: 'module-graph', name: 'Module Graph', type: 'module' as const },
            { id: 'release-gates', name: 'Release Gates', type: 'module' as const },
            { id: 'evidence-export', name: 'Evidence Export', type: 'project' as const },
            { id: 'predictive-warnings', name: 'Predictive Warnings [Soon]', type: 'project' as const },
            { id: 'sandbox-simulation', name: 'Sandbox Simulation [Soon]', type: 'project' as const },
            { id: 'incident-archive', name: 'Incident Archive [Soon]', type: 'project' as const },
        ],
        [],
    );
    const [selectedSidebarItem, setSelectedSidebarItem] = useState<string>('decision-layer');
    const [activeTool, setActiveTool] = useState<string | undefined>(undefined);

    // Keep side regions available in common VS Code tab widths.
    const showSidebar = viewportWidth >= 1180;
    const showContextPanel = viewportWidth >= 980;
    const compactTopBar = viewportWidth < 1380;
    const compactStudio = viewportWidth < 1320;
    const shellPadding = '0px';
    const shellGap = '0px';
    const sidebarWidth = viewportWidth >= 1540 ? '272px' : viewportWidth >= 1260 ? '252px' : '224px';
    const contextPanelWidth = viewportWidth >= 1540 ? '320px' : viewportWidth >= 1260 ? '292px' : '244px';

    // Phase transitions
    const handlePhaseSelect = useCallback((phase: IncidentPhase) => {
        setState((prev) => {
            // Check if transition is valid
            if (!canTransitionToPhase(prev.currentPhase, phase, prev.policyGates)) {
                console.warn(
                    `Cannot transition from ${prev.currentPhase} to ${phase}`,
                );
                return prev;
            }

            return {
                ...prev,
                currentPhase: phase,
                isPhaseTransitioning: true,
            };
        });

        // Clear transitioning flag after animation
        if (phaseTransitionTimeoutRef.current) {
            clearTimeout(phaseTransitionTimeoutRef.current);
        }

        phaseTransitionTimeoutRef.current = setTimeout(() => {
            setState((prev) => ({
                ...prev,
                isPhaseTransitioning: false,
            }));
            phaseTransitionTimeoutRef.current = null;
        }, 300);
    }, []);

    // User mode changes
    const handleUserModeChange = useCallback((mode: UserMode) => {
        setState((prev) => ({
            ...prev,
            userMode: mode,
        }));
    }, []);

    // Action items — cross-session retention hook
    const handleAddActionItem = useCallback((text: string) => {
        const item: ActionItem = {
            id: `action-${Date.now()}`,
            text,
            done: false,
            createdAt: new Date().toISOString(),
        };
        setState((prev) => ({
            ...prev,
            actionItems: [...prev.actionItems, item],
        }));
    }, []);

    const handleToggleActionItem = useCallback((id: string) => {
        setState((prev) => ({
            ...prev,
            actionItems: prev.actionItems.map((a) =>
                a.id === id ? { ...a, done: !a.done } : a,
            ),
        }));
    }, []);

    // Scope changes
    const handleScopeChange = useCallback((scope: 'workspace' | 'project') => {
        setState((prev) => ({
            ...prev,
            scopeType: scope,
        }));
    }, []);

    // Message handling
    const handleSendMessage = useCallback(
        (content: string) => {
            const newMessage: ChatMessage = {
                id: Date.now().toString(),
                role: 'user',
                content,
                timestamp: new Date().toISOString(),
            };

            setState((prev) => ({
                ...prev,
                messages: [...prev.messages, newMessage],
                isStreaming: true,
            }));

            // Call parent handler if provided — parent owns the response lifecycle
            if (onSendMessage) {
                onSendMessage(content);
                return;
            }

            // No external handler: surface an "unconnected" indicator without simulation
            setState((prev) => ({
                ...prev,
                messages: [
                    ...prev.messages,
                    {
                        id: (Date.now() + 1).toString(),
                        role: 'assistant' as const,
                        content: '⚠ Studio is not connected to an AI backend. Wire `onSendMessage` to enable live responses.',
                        timestamp: new Date().toISOString(),
                        phase: prev.currentPhase,
                    },
                ],
                isStreaming: false,
            }));
        },
        [onSendMessage],
    );

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                width: '100vw',
                background: colorTokens.canvas,
                color: colorTokens.text.primary,
                fontFamily: fontTokens.ui,
                padding: 0,
            }}
        >
            <GlobalStyles />

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    background: 'transparent',
                }}
            >
                {/* Top Bar */}
                <TopBar
                    currentPhase={state.currentPhase}
                    policyGates={state.policyGates}
                    userMode={state.userMode}
                    themeMode={themeMode}
                    scopeType={state.scopeType}
                    workspaceName={state.workspaceName || 'rapidkit-core'}
                    releasePosture={state.releasePosture}
                    compactMode={compactTopBar}
                    onUserModeChange={handleUserModeChange}
                    onThemeModeChange={handleThemeModeChange}
                    onScopeChange={handleScopeChange}
                />

                <PhaseStepper
                    currentPhase={state.currentPhase}
                    compactMode={compactStudio}
                    onSelectPhase={handlePhaseSelect}
                />

                {/* Main Layout: 4-region shell */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: shellGap, padding: shellPadding }}>
                    {/* Activity Bar (tool launcher) */}
                    <div style={{ width: layout.activityBar, flexShrink: 0, overflow: 'hidden' }}>
                        <ErrorBoundary region="Activity Bar">
                            <ActivityBar
                                activeTool={activeTool}
                                onToolSelect={setActiveTool}
                            />
                        </ErrorBoundary>
                    </div>

                    {showSidebar ? (
                        <div style={{ width: sidebarWidth, flexShrink: 0, overflow: 'hidden', marginLeft: '-1px' }}>
                            <ErrorBoundary region="Workspace Sidebar">
                                <WorkspaceSidebar
                                    items={sidebarItems}
                                    selectedItemId={selectedSidebarItem}
                                    onItemSelect={setSelectedSidebarItem}
                                    actionItems={state.actionItems}
                                    onToggleActionItem={handleToggleActionItem}
                                />
                            </ErrorBoundary>
                        </div>
                    ) : null}

                    {showContextPanel ? (
                        <div
                            style={{
                                width: contextPanelWidth,
                                flexShrink: 0,
                                overflow: 'hidden',
                                display: 'flex',
                                marginLeft: '-1px',
                            }}
                        >
                            <ErrorBoundary region="Context Panel">
                                <ContextPanel
                                    health={state.health}
                                    relatedFiles={state.relatedFiles}
                                    policyGates={state.policyGates}
                                    userMode={state.userMode}
                                />
                            </ErrorBoundary>
                        </div>
                    ) : null}

                    {/* Chat Surface (flex, always visible) - Input pinned at bottom */}
                    <div
                        style={{
                            flex: 1,
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            marginLeft: showSidebar || showContextPanel ? '-1px' : '0px',
                        }}
                    >
                        <ErrorBoundary region="Chat Surface">
                            <ChatSurface
                                messages={state.messages}
                                isStreaming={state.isStreaming}
                                currentPhase={state.currentPhase}
                                scopeType={state.scopeType}
                                onSendMessage={handleSendMessage}
                                userMode={state.userMode}
                                compactMode={compactStudio}
                                onPhaseAdvance={handlePhaseSelect}
                                onAddActionItem={handleAddActionItem}
                            />
                        </ErrorBoundary>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IncidentStudioVNext;
