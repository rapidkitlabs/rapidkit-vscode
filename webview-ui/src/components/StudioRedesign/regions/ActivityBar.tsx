/**
 * ActivityBar: Tool launcher strip — quick-access to studio tools
 * Provides fast access to Terminal Bridge, Context Scan, Memory, and Settings.
 * NOT a phase navigator — PhaseStepper handles phases.
 */

import React, { useState } from 'react';
import { Terminal, ScanLine, Brain, Settings, HelpCircle, LucideIcon } from 'lucide-react';
import {
    colorTokens,
    spacing,
    borderRadius,
    transitions,
} from '../styles/designTokens';

interface Tool {
    id: string;
    icon: LucideIcon;
    label: string;
    shortcut: string;
}

const TOOLS: Tool[] = [
    { id: 'terminal', icon: Terminal, label: 'Terminal Bridge', shortcut: '⌘T' },
    { id: 'scan', icon: ScanLine, label: 'Context Scan', shortcut: '⌘S' },
    { id: 'memory', icon: Brain, label: 'Memory', shortcut: '⌘M' },
    { id: 'settings', icon: Settings, label: 'Settings', shortcut: '⌘,' },
];

interface ActivityBarProps {
    activeTool?: string;
    onToolSelect?: (toolId: string) => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
    activeTool,
    onToolSelect,
}) => {
    const [hovered, setHovered] = useState<string | null>(null);

    return (
        <nav
            aria-label="Studio tools"
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: spacing.sm,
                padding: `${spacing.lg} ${spacing.sm}`,
                backgroundColor: colorTokens.surface3,
                border: `1px solid ${colorTokens.border.medium}`,
                borderRadius: '0px',
                height: '100%',
                justifyContent: 'space-between',
                boxShadow: 'none',
                backdropFilter: 'none',
            }}
        >
            {/* Main tools */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: spacing.xs,
                }}
            >
                {TOOLS.slice(0, 3).map((tool) => (
                    <ToolButton
                        key={tool.id}
                        tool={tool}
                        isActive={activeTool === tool.id}
                        isHovered={hovered === tool.id}
                        onHover={setHovered}
                        onSelect={onToolSelect}
                    />
                ))}
            </div>

            {/* Bottom tools — settings + help */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: spacing.xs,
                }}
            >
                <ToolButton
                    tool={TOOLS[3]}
                    isActive={activeTool === TOOLS[3].id}
                    isHovered={hovered === TOOLS[3].id}
                    onHover={setHovered}
                    onSelect={onToolSelect}
                />
                <ToolButton
                    tool={{ id: 'help', icon: HelpCircle, label: 'Documentation', shortcut: '' }}
                    isActive={activeTool === 'help'}
                    isHovered={hovered === 'help'}
                    onHover={setHovered}
                    onSelect={onToolSelect}
                />
            </div>
        </nav>
    );
};

interface ToolButtonProps {
    tool: Tool;
    isActive: boolean;
    isHovered: boolean;
    onHover: (id: string | null) => void;
    onSelect?: (id: string) => void;
}

const ToolButton: React.FC<ToolButtonProps> = ({
    tool,
    isActive,
    isHovered,
    onHover,
    onSelect,
}) => {
    const Icon = tool.icon;
    return (
        <button
            type="button"
            aria-label={tool.label + (tool.shortcut ? ` (${tool.shortcut})` : '')}
            aria-pressed={isActive}
            title={tool.label + (tool.shortcut ? `  ${tool.shortcut}` : '')}
            onClick={() => onSelect?.(tool.id)}
            onMouseEnter={() => onHover(tool.id)}
            onMouseLeave={() => onHover(null)}
            style={{
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isActive
                    ? colorTokens.primary
                    : isHovered
                        ? colorTokens.surface2
                        : 'transparent',
                color: isActive
                    ? colorTokens.root
                    : isHovered
                        ? colorTokens.text.secondary
                        : colorTokens.text.tertiary,
                border: isActive
                    ? `1px solid ${colorTokens.primary}80`
                    : '1px solid transparent',
                borderRadius: borderRadius.md,
                cursor: 'pointer',
                transition: transitions.microInteraction,
                boxShadow: 'none',
                position: 'relative',
                flexShrink: 0,
            }}
        >
            <Icon size={16} />
            {/* Active indicator dot */}
            {isActive && (
                <div
                    style={{
                        position: 'absolute',
                        left: '-1px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '3px',
                        height: '16px',
                        backgroundColor: colorTokens.primary,
                        borderRadius: '0 2px 2px 0',
                    }}
                />
            )}
        </button>
    );
};
