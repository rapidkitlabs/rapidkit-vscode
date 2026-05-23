/**
 * ErrorBoundary: Class-based React error boundary for Studio regions.
 * Catches render errors and shows a stable fallback instead of a blank panel.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { colorTokens, spacing, typography, borderRadius, shadows } from './styles/designTokens';

interface Props {
    children: ReactNode;
    /** Label shown in the fallback UI, e.g. "Context Panel" */
    region?: string;
}

interface State {
    hasError: boolean;
    errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, errorMessage: '' };
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            errorMessage: error?.message ?? 'Unknown render error',
        };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // Surface to VS Code extension host if a logger is wired in the future
        console.error(`[IncidentStudio] ErrorBoundary caught in "${this.props.region}"`, error, info);
    }

    private handleReset = () => {
        this.setState({ hasError: false, errorMessage: '' });
    };

    render(): ReactNode {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return (
            <div
                role="alert"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    padding: spacing.xxl,
                    gap: spacing.lg,
                    backgroundColor: colorTokens.surface1,
                    color: colorTokens.text.secondary,
                    textAlign: 'center',
                }}
            >
                <div
                    style={{
                        padding: `${spacing.sm} ${spacing.lg}`,
                        backgroundColor: colorTokens.errorBg,
                        border: `1px solid ${colorTokens.error}40`,
                        borderRadius: borderRadius.md,
                        ...typography.bodySmall,
                        color: colorTokens.error,
                    }}
                >
                    {this.props.region ? `${this.props.region} — ` : ''}Render error
                </div>
                <div
                    style={{
                        ...typography.caption,
                        color: colorTokens.text.quaternary,
                        maxWidth: '240px',
                        wordBreak: 'break-word',
                        padding: spacing.md,
                        backgroundColor: colorTokens.surface2,
                        borderRadius: borderRadius.md,
                        border: `1px solid ${colorTokens.border.subtle}`,
                        boxShadow: shadows.elevation1,
                        fontFamily: 'var(--vscode-editor-font-family, monospace)',
                    }}
                >
                    {this.state.errorMessage}
                </div>
                <button
                    type="button"
                    onClick={this.handleReset}
                    style={{
                        padding: `${spacing.sm} ${spacing.lg}`,
                        backgroundColor: colorTokens.surface2,
                        border: `1px solid ${colorTokens.border.medium}`,
                        borderRadius: borderRadius.md,
                        color: colorTokens.text.secondary,
                        ...typography.label,
                        cursor: 'pointer',
                    }}
                >
                    Retry
                </button>
            </div>
        );
    }
}
