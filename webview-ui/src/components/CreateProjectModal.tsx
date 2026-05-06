import { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, Package, Sparkles, Loader2 } from 'lucide-react';
import { vscode } from '@/vscode';
import type { Kit } from '@/types';
import type { WorkspaceToolStatus } from '@/types';

interface CreateProjectModalProps {
    isOpen: boolean;
    framework: 'fastapi' | 'nestjs' | 'go' | 'springboot';
    availableKits: Kit[];
    onClose: () => void;
    onCreate: (name: string, framework: 'fastapi' | 'nestjs' | 'go' | 'springboot', kitName: string) => void;
    onSwitchToAI?: () => void;
    toolStatus?: WorkspaceToolStatus | null;
}

export function CreateProjectModal({ isOpen, framework, availableKits, onClose, onCreate, onSwitchToAI, toolStatus }: CreateProjectModalProps) {
    const [projectName, setProjectName] = useState('');
    const [selectedKit, setSelectedKit] = useState('');
    const [error, setError] = useState('');
    const [aiSuggestions, setAiSuggestions] = useState<{ slug: string; reason: string }[]>([]);
    const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
    const [aiSuggestError, setAiSuggestError] = useState('');
    const suggestListenerRef = useRef<((e: MessageEvent) => void) | null>(null);

    // Filter kits by framework
    const frameworkKits = availableKits.filter(kit => kit.category === framework);
    const isKitsLoading = isOpen && frameworkKits.length === 0;

    useEffect(() => {
        if (isOpen) {
            setProjectName('');
            setError('');
            setAiSuggestions([]);
            setAiSuggestError('');
            setAiSuggestLoading(false);
            // Auto-select first kit
            const kits = availableKits.filter(kit => kit.category === framework);
            setSelectedKit(kits.length > 0 ? kits[0].name : '');
        }
    }, [isOpen, framework, availableKits]);

    useEffect(() => {
        return () => {
            if (suggestListenerRef.current) {
                window.removeEventListener('message', suggestListenerRef.current);
                suggestListenerRef.current = null;
            }
        };
    }, []);

    const handleAISuggest = () => {
        setAiSuggestLoading(true);
        setAiSuggestions([]);
        setAiSuggestError('');

        // Remove previous listener
        if (suggestListenerRef.current) {
            window.removeEventListener('message', suggestListenerRef.current);
        }

        const listener = (e: MessageEvent) => {
            if (e.data?.command === 'aiModuleSuggestions') {
                const { loading, suggestions, error: err } = e.data.data ?? {};
                if (!loading) {
                    setAiSuggestLoading(false);
                    if (err) { setAiSuggestError(err); }
                    else { setAiSuggestions(suggestions ?? []); }
                    window.removeEventListener('message', listener);
                    suggestListenerRef.current = null;
                }
            }
        };
        suggestListenerRef.current = listener;
        window.addEventListener('message', listener);

        vscode.postMessage('aiSuggestModules', { framework, projectName });
    };

    const frameworkInfo = {
        fastapi: {
            iconUrl: (window as any).FASTAPI_ICON_URI,
            title: 'FastAPI Project',
            subtitle: 'Python + Async',
            color: '#009688',
            description: 'Modern, fast (high-performance) Python web framework'
        },
        nestjs: {
            iconUrl: (window as any).NESTJS_ICON_URI,
            title: 'NestJS Project',
            subtitle: 'TypeScript + DI',
            color: '#E0234E',
            description: 'Progressive Node.js framework for building scalable applications'
        },
        go: {
            iconUrl: (window as any).GO_ICON_URI,
            title: 'Go Project',
            subtitle: 'Go + High Performance',
            color: '#00ADD8',
            description: 'High-performance Go web service using Fiber or Gin'
        },
        springboot: {
            iconUrl: (window as any).SPRINGBOOT_ICON_URI,
            title: 'Spring Boot Project',
            subtitle: 'Java + Enterprise',
            color: '#6DB33F',
            description: 'Production-ready Java service with Spring Boot and Maven/Gradle'
        }
    };

    const info = frameworkInfo[framework];

    const validateName = (name: string): boolean => {
        if (!name.trim()) {
            setError('Project name is required');
            return false;
        }

        if (name.length < 2) {
            setError('Name must be at least 2 characters');
            return false;
        }

        if (name.length > 50) {
            setError('Name must be less than 50 characters');
            return false;
        }

        // Check for invalid characters (allow alphanumeric, hyphens, underscores)
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            setError('Only letters, numbers, hyphens, and underscores allowed');
            return false;
        }

        setError('');
        return true;
    };

    const handleCreate = () => {
        if (validateName(projectName) && selectedKit) {
            onCreate(projectName, framework, selectedKit);
            onClose();
        }
    };

    const handleRetryKits = () => {
        vscode.postMessage('requestAvailableKits');
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCreate();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) { return null; }

    return (
        <>
            {/* Backdrop */}
            <div
                className="modal-backdrop"
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9998,
                    animation: 'fadeIn 0.2s ease-out',
                }}
            />

            {/* Modal */}
            <div
                className="modal-container"
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 9999,
                    animation: 'slideUp 0.3s ease-out',
                }}
            >
                <div
                    className="modal-content"
                    style={{
                        backgroundColor: 'var(--vscode-editor-background)',
                        border: '1px solid var(--vscode-panel-border)',
                        borderRadius: '12px',
                        width: '500px',
                        maxWidth: '90vw',
                        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '20px 24px',
                            borderBottom: '1px solid var(--vscode-panel-border)',
                            background: `linear-gradient(135deg, ${info.color}10, transparent)`,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '8px',
                                background: `${info.color}15`,
                                border: `1px solid ${info.color}30`,
                                padding: '8px'
                            }}>
                                <img
                                    src={info.iconUrl}
                                    alt={framework}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'contain',
                                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
                                    }}
                                />
                            </div>
                            <div>
                                <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                                    {info.title}
                                </h2>
                                <p style={{
                                    fontSize: '12px',
                                    margin: '4px 0 0 0',
                                    color: 'var(--vscode-descriptionForeground)',
                                    opacity: 0.8
                                }}>
                                    {info.subtitle}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--vscode-foreground)',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                opacity: 0.7,
                                transition: 'opacity 0.2s',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div style={{ padding: '24px' }}>
                        {/* Framework Description */}
                        <div style={{
                            marginBottom: framework === 'springboot' && toolStatus && !toolStatus.javaAvailable ? '12px' : '20px',
                            padding: '12px 16px',
                            backgroundColor: 'var(--vscode-textCodeBlock-background)',
                            borderLeft: `3px solid ${info.color}`,
                            borderRadius: '4px',
                            fontSize: '13px',
                            color: 'var(--vscode-descriptionForeground)',
                        }}>
                            {info.description}
                        </div>

                        {/* Spring Boot Java readiness gate */}
                        {framework === 'springboot' && toolStatus && !toolStatus.javaAvailable && (
                            <div style={{
                                marginBottom: '20px',
                                padding: '10px 14px',
                                backgroundColor: 'color-mix(in srgb, #f59e0b 12%, var(--vscode-editor-background))',
                                border: '1px solid color-mix(in srgb, #f59e0b 35%, transparent)',
                                borderRadius: '6px',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '8px',
                            }}>
                                <AlertCircle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '1px' }} />
                                <div>
                                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>Java (JDK) not detected. </span>
                                    <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
                                        Spring Boot projects require JDK 17+.{' '}
                                    </span>
                                    <button
                                        onClick={() => vscode.postMessage('openSetup')}
                                        style={{
                                            background: 'none', border: 'none', padding: 0,
                                            color: '#6C5CE7', fontWeight: 600, fontSize: '12px',
                                            cursor: 'pointer', textDecoration: 'underline',
                                        }}
                                    >
                                        Open Setup Panel
                                    </button>
                                </div>
                            </div>
                        )}


                        {/* Project Name Input */}
                        <div style={{ marginBottom: '20px' }}>
                            <label
                                htmlFor="project-name"
                                style={{
                                    display: 'block',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    marginBottom: '8px',
                                    color: 'var(--vscode-foreground)',
                                }}
                            >
                                Project Name
                            </label>
                            <input
                                id="project-name"
                                type="text"
                                value={projectName}
                                onChange={(e) => {
                                    setProjectName(e.target.value);
                                    validateName(e.target.value);
                                }}
                                onKeyDown={handleKeyPress}
                                placeholder={
                                    framework === 'fastapi'
                                        ? 'my-fastapi-api'
                                        : framework === 'nestjs'
                                            ? 'my-nestjs-app'
                                            : framework === 'go'
                                                ? 'my-go-service'
                                                : 'my-spring-service'
                                }
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    fontSize: '14px',
                                    backgroundColor: 'var(--vscode-input-background)',
                                    color: 'var(--vscode-input-foreground)',
                                    border: `1px solid ${error ? '#f44336' : 'var(--vscode-input-border)'}`,
                                    borderRadius: '6px',
                                    outline: 'none',
                                    transition: 'border-color 0.2s',
                                    fontFamily: 'var(--vscode-font-family)',
                                }}
                                onFocus={(e) => {
                                    if (!error) {
                                        e.target.style.borderColor = info.color;
                                    }
                                }}
                                onBlur={(e) => {
                                    if (!error) {
                                        e.target.style.borderColor = 'var(--vscode-input-border)';
                                    }
                                }}
                            />
                            {error && (
                                <div
                                    style={{
                                        marginTop: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        color: '#f44336',
                                        fontSize: '12px',
                                    }}
                                >
                                    <AlertCircle size={14} />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>

                        {/* Kit Selection */}
                        <div style={{ marginBottom: '20px' }}>
                            <label
                                htmlFor="kit-select"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    marginBottom: '8px',
                                    color: 'var(--vscode-foreground)',
                                }}
                            >
                                <Package size={14} />
                                Kit Template
                            </label>
                            <select
                                id="kit-select"
                                value={selectedKit}
                                onChange={(e) => setSelectedKit(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    fontSize: '14px',
                                    backgroundColor: 'var(--vscode-input-background)',
                                    color: 'var(--vscode-input-foreground)',
                                    border: '1px solid var(--vscode-input-border)',
                                    borderRadius: '6px',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    fontFamily: 'var(--vscode-font-family)',
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = info.color;
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'var(--vscode-input-border)';
                                }}
                            >
                                {frameworkKits.length === 0 && (
                                    <option value="">Loading kits...</option>
                                )}
                                {frameworkKits.map((kit) => (
                                    <option key={kit.name} value={kit.name}>
                                        {kit.display_name} {kit.tags && kit.tags.length > 0 && `— ${kit.tags.join(', ')}`}
                                    </option>
                                ))}
                            </select>
                            {isKitsLoading && (
                                <div
                                    style={{
                                        marginTop: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '8px',
                                        fontSize: '12px',
                                        color: 'var(--vscode-descriptionForeground)',
                                    }}
                                >
                                    <span>Fetching kits for {framework}...</span>
                                    <button
                                        type="button"
                                        onClick={handleRetryKits}
                                        style={{
                                            background: 'transparent',
                                            border: '1px solid var(--vscode-input-border)',
                                            borderRadius: '4px',
                                            color: 'var(--vscode-foreground)',
                                            cursor: 'pointer',
                                            fontSize: '11px',
                                            padding: '2px 8px',
                                        }}
                                    >
                                        Retry
                                    </button>
                                </div>
                            )}
                            {selectedKit && frameworkKits.find(k => k.name === selectedKit) && (
                                <div
                                    style={{
                                        marginTop: '8px',
                                        padding: '8px 10px',
                                        backgroundColor: `${info.color}08`,
                                        border: `1px solid ${info.color}20`,
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        color: 'var(--vscode-descriptionForeground)',
                                        lineHeight: '1.4',
                                    }}
                                >
                                    {frameworkKits.find(k => k.name === selectedKit)?.description}
                                </div>
                            )}
                        </div>

                        {/* Quick Tips */}
                        <div
                            style={{
                                padding: '12px',
                                backgroundColor: 'var(--vscode-textCodeBlock-background)',
                                borderRadius: '6px',
                                fontSize: '12px',
                                color: 'var(--vscode-descriptionForeground)',
                                lineHeight: '1.5',
                            }}
                        >
                            <div style={{ fontWeight: 600, marginBottom: '4px', color: info.color }}>
                                💡 Quick Tips:
                            </div>
                            <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                                <li>Use lowercase letters, numbers, hyphens, or underscores</li>
                                <li>
                                    Examples:{' '}
                                    {framework === 'fastapi'
                                        ? 'my-api, backend-service, api_v2'
                                        : framework === 'nestjs'
                                            ? 'my-app, admin-panel, service_core'
                                            : framework === 'go'
                                                ? 'my-service, go-api, fiber_app'
                                                : 'orders-service, billing-api, spring-core'}
                                </li>
                                <li>Project will be created in the current workspace</li>
                            </ul>
                        </div>

                        {/* AI Module Suggestions */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button
                                onClick={handleAISuggest}
                                disabled={aiSuggestLoading}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    padding: '7px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                                    cursor: aiSuggestLoading ? 'wait' : 'pointer',
                                    background: 'color-mix(in srgb, #6C5CE7 8%, var(--vscode-editor-background))',
                                    border: '1px solid color-mix(in srgb, #6C5CE7 25%, transparent)',
                                    color: '#8B7CF8',
                                    transition: 'all 0.15s',
                                    opacity: aiSuggestLoading ? 0.6 : 1,
                                }}
                            >
                                {aiSuggestLoading
                                    ? <><Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> Asking AI…</>
                                    : <><Sparkles size={11} /> Suggest modules with AI</>
                                }
                            </button>

                            {aiSuggestError && (
                                <div style={{ fontSize: '11px', color: 'var(--vscode-errorForeground)', opacity: 0.8 }}>
                                    {aiSuggestError}
                                </div>
                            )}

                            {aiSuggestions.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--vscode-descriptionForeground)', opacity: 0.6 }}>
                                        AI Recommended Modules
                                    </div>
                                    {aiSuggestions.map((s) => (
                                        <div key={s.slug} style={{
                                            display: 'flex', alignItems: 'flex-start', gap: '8px',
                                            padding: '6px 10px', borderRadius: '6px', fontSize: '11px',
                                            background: 'color-mix(in srgb, #22c55e 6%, var(--vscode-editor-background))',
                                            border: '1px solid color-mix(in srgb, #22c55e 18%, transparent)',
                                        }}>
                                            <span style={{ color: '#4ade80', fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>{s.slug}</span>
                                            <span style={{ color: 'var(--vscode-descriptionForeground)', opacity: 0.8 }}>{s.reason}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '16px 24px',
                            borderTop: '1px solid var(--vscode-panel-border)',
                        }}
                    >
                        {/* AI switch link */}
                        {onSwitchToAI ? (
                            <button
                                onClick={onSwitchToAI}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    background: 'transparent', border: 'none',
                                    color: '#6C5CE7', cursor: 'pointer',
                                    fontSize: '11px', fontWeight: 600,
                                    opacity: 0.75, padding: 0,
                                    transition: 'opacity 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                onMouseLeave={e => (e.currentTarget.style.opacity = '0.75')}
                            >
                                <Sparkles size={12} />
                                Use AI instead
                            </button>
                        ) : <span />}
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={onClose}
                                style={{
                                    padding: '8px 16px',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    borderRadius: '6px',
                                    border: '1px solid var(--vscode-button-border)',
                                    backgroundColor: 'var(--vscode-button-secondaryBackground)',
                                    color: 'var(--vscode-button-secondaryForeground)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor =
                                        'var(--vscode-button-secondaryHoverBackground)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor =
                                        'var(--vscode-button-secondaryBackground)';
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={!projectName.trim() || !!error || !selectedKit}
                                style={{
                                    padding: '8px 20px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: projectName.trim() && !error && selectedKit ? info.color : '#555',
                                    color: 'white',
                                    cursor: projectName.trim() && !error && selectedKit ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.2s',
                                    opacity: projectName.trim() && !error && selectedKit ? 1 : 0.5,
                                }}
                                onMouseEnter={(e) => {
                                    if (projectName.trim() && !error && selectedKit) {
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                        e.currentTarget.style.boxShadow = `0 4px 12px ${info.color}40`;
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                Create Project
                            </button>
                        </div>  {/* end buttons row */}
                    </div>  {/* end footer */}
                </div>
            </div>

            {/* CSS animations (same as CreateWorkspaceModal) */}
            <style>
                {`
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes slideUp {
                        from { 
                            opacity: 0;
                            transform: translate(-50%, -45%);
                        }
                        to { 
                            opacity: 1;
                            transform: translate(-50%, -50%);
                        }
                    }
                `}
            </style>
        </>
    );
}
