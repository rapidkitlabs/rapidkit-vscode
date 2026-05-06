import { Sparkles, Wand2, Bug, Terminal, BookOpen, Package, Layers, BrainCircuit } from 'lucide-react';

interface AIActionsProps {
    onRunFixPreview?: () => void;
    onRunChangeImpact?: () => void;
    onRunTerminalBridge?: () => void;
    onOpenIncidentStudio?: () => void;
}

const CARDS = [
    {
        icon: <Wand2 size={14} />,
        label: 'AI Create',
        tag: 'Scaffold',
        desc: 'Describe your project — AI plans the workspace and scaffolds everything.',
        color: '#6C5CE7',
        accent: 'violet',
    },
    {
        icon: <Bug size={14} />,
        label: 'Fix Preview',
        tag: 'Debug',
        desc: 'Smallest safe patch preview — root cause and edits before touching code.',
        color: '#e17055',
        accent: 'orange',
        action: 'fix-preview',
    },
    {
        icon: <Layers size={14} />,
        label: 'Change Impact',
        tag: 'Risk',
        desc: 'What can break before a change — risk level and safe rollout checklist.',
        color: '#a78bfa',
        accent: 'purple',
        action: 'change-impact',
    },
    {
        icon: <Terminal size={14} />,
        label: 'Terminal Bridge',
        tag: 'Errors',
        desc: 'Stack traces → AI root-cause and fix guidance, instantly.',
        color: '#00cec9',
        accent: 'teal',
        action: 'terminal-bridge',
    },
    {
        icon: <BookOpen size={14} />,
        label: 'Memory Wizard',
        tag: 'Context',
        desc: 'Capture conventions — injected into every AI answer automatically.',
        color: '#00b894',
        accent: 'green',
    },
    {
        icon: <Package size={14} />,
        label: 'Recipe Packs',
        tag: 'Workflows',
        desc: '10 reusable AI workflows: debug, endpoint planning, auth hardening.',
        color: '#fdcb6e',
        accent: 'yellow',
    },
];

export function AIActions({ onRunFixPreview, onRunChangeImpact, onRunTerminalBridge, onOpenIncidentStudio }: AIActionsProps) {
    const isActionCard = (action: unknown): action is 'fix-preview' | 'change-impact' | 'terminal-bridge' =>
        action === 'fix-preview' || action === 'change-impact' || action === 'terminal-bridge';

    const runAction = (action: unknown) => {
        if (action === 'fix-preview') {
            onRunFixPreview?.();
        } else if (action === 'change-impact') {
            onRunChangeImpact?.();
        } else if (action === 'terminal-bridge') {
            onRunTerminalBridge?.();
        }
    };

    return (
        <div className="ai-actions-section">
            <div className="ai-actions-header">
                <Sparkles size={13} style={{ color: '#6C5CE7' }} />
                <span>AI Features</span>
                <span className="ai-actions-badge">Free · Powered by Copilot</span>
            </div>

            <button
                type="button"
                className="ai-incident-studio-card"
                onClick={onOpenIncidentStudio}
            >
                <span className="ai-incident-studio-icon">
                    <BrainCircuit size={16} />
                </span>
                <span className="ai-incident-studio-body">
                    <span className="ai-incident-studio-title">Workspai Incident Studio</span>
                    <span className="ai-incident-studio-desc">Full-context AI debugging — architecture map, health checks, and guided fix recommendations in one place.</span>
                </span>
                <span className="ai-incident-studio-arrow">→</span>
            </button>

            <div className="ai-features-grid">
                {CARDS.map((c) => (
                    <div
                        key={c.label}
                        className={`ai-feature-card ai-feature-card--${c.accent}`}
                        role={isActionCard(c.action) ? 'button' : undefined}
                        aria-label={
                            c.action === 'fix-preview'
                                ? 'Run AI Fix Preview'
                                : c.action === 'change-impact'
                                    ? 'Run AI Change Impact'
                                    : c.action === 'terminal-bridge'
                                        ? 'Run Terminal to AI Bridge'
                                        : undefined
                        }
                        tabIndex={isActionCard(c.action) ? 0 : undefined}
                        onClick={() => runAction(c.action)}
                        onKeyDown={(event) => {
                            if (isActionCard(c.action) && (event.key === 'Enter' || event.key === ' ')) {
                                event.preventDefault();
                                runAction(c.action);
                            }
                        }}
                    >
                        <div className="ai-feature-card-row">
                            <span className="ai-feature-card-icon-wrap" style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 14%, transparent)` }}>
                                {c.icon}
                            </span>
                            <span className="ai-feature-card-label">{c.label}</span>
                            <span className="ai-feature-card-tag" style={{ color: c.color, borderColor: `color-mix(in srgb, ${c.color} 30%, transparent)`, background: `color-mix(in srgb, ${c.color} 10%, transparent)` }}>
                                {c.tag}
                            </span>
                        </div>
                        <span className="ai-feature-card-desc">{c.desc}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
