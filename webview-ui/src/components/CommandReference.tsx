import { useState } from 'react';
import {
    Copy,
    ChevronDown,
    FolderOpen,
    Rocket,
    Package as PackageIcon,
    Settings,
} from 'lucide-react';

interface Command {
    code: string;
    description: string;
}

interface CommandCategory {
    id: string;
    title: string;
    icon: any;
    count: number;
    commands: Command[];
}

type WorkspaceProfile =
    | 'minimal'
    | 'python-only'
    | 'node-only'
    | 'go-only'
    | 'java-only'
    | 'polyglot'
    | 'enterprise';

interface CommandReferenceProps {
    workspaceProfile?: WorkspaceProfile;
    hasActiveWorkspace?: boolean;
    workspaceName?: string;
}

function simplifyCommandForDisplay(command: string): string {
    const compact = command.trim().replace(/\s+/g, ' ');
    if (!compact) {
        return compact;
    }

    return compact
        .replace(/^npx\s+--yes\s+--package\s+rapidkit\s+rapidkit\b/i, 'rapidkit')
        .replace(/^npx\s+rapidkit\b/i, 'rapidkit')
        .trim();
}

function buildWorkspaceCommands(profile: WorkspaceProfile): Command[] {
    const common: Command[] = [
        {
            code: 'npx --yes --package rapidkit rapidkit create workspace my-workspace --yes --profile polyglot',
            description: 'Create a workspace with explicit profile (recommended canonical form)',
        },
        {
            code: `npx --yes --package rapidkit rapidkit bootstrap --profile ${profile}`,
            description: `Sync and bootstrap runtimes for the active profile (${profile})`,
        },
        {
            code: 'npx --yes --package rapidkit rapidkit init',
            description:
                'Full init (workspace + projects). Mirror aliases at workspace root: `workspace init` and `workspace run init`.',
        },
        {
            code: 'npx --yes --package rapidkit rapidkit doctor workspace',
            description: 'Run workspace health checks (canonical doctor contract)',
        },
        {
            code: 'npx --yes --package rapidkit rapidkit cache status',
            description: 'Inspect workspace cache policy and status',
        },
        {
            code: 'npx --yes --package rapidkit rapidkit mirror status',
            description: 'Inspect mirror/offline artifact status',
        },
    ];

    const runtimeByProfile: Record<WorkspaceProfile, Command[]> = {
        'go-only': [
            {
                code: 'npx --yes --package rapidkit rapidkit setup go --warm-deps',
                description: 'Validate Go runtime and pre-warm module dependencies',
            },
        ],
        'java-only': [
            {
                code: 'npx --yes --package rapidkit rapidkit setup java --warm-deps',
                description: 'Validate Java runtime and pre-warm build dependencies',
            },
        ],
        'node-only': [
            {
                code: 'npx --yes --package rapidkit rapidkit setup node --warm-deps',
                description: 'Validate Node runtime and pre-warm dependency cache',
            },
        ],
        'python-only': [
            {
                code: 'npx --yes --package rapidkit rapidkit setup python',
                description: 'Validate Python runtime prerequisites',
            },
        ],
        polyglot: [
            {
                code: 'npx --yes --package rapidkit rapidkit setup python',
                description: 'Validate Python runtime prerequisites',
            },
            {
                code: 'npx --yes --package rapidkit rapidkit setup node --warm-deps',
                description: 'Validate Node runtime and pre-warm dependency cache',
            },
            {
                code: 'npx --yes --package rapidkit rapidkit setup go --warm-deps',
                description: 'Validate Go runtime and pre-warm module dependencies',
            },
            {
                code: 'npx --yes --package rapidkit rapidkit setup java --warm-deps',
                description: 'Validate Java runtime and pre-warm Maven/Gradle dependencies',
            },
        ],
        enterprise: [
            {
                code: 'npx --yes --package rapidkit rapidkit setup python',
                description: 'Validate Python runtime prerequisites',
            },
            {
                code: 'npx --yes --package rapidkit rapidkit setup node --warm-deps',
                description: 'Validate Node runtime and pre-warm dependency cache',
            },
            {
                code: 'npx --yes --package rapidkit rapidkit setup go --warm-deps',
                description: 'Validate Go runtime and pre-warm module dependencies',
            },
            {
                code: 'npx --yes --package rapidkit rapidkit setup java --warm-deps',
                description: 'Validate Java runtime and pre-warm Maven/Gradle dependencies',
            },
            {
                code: 'npx --yes --package rapidkit rapidkit mirror verify',
                description: 'Verify mirrored artifacts and policy compliance (enterprise)',
            },
        ],
        minimal: [
            {
                code: 'npx --yes --package rapidkit rapidkit setup python',
                description: 'Validate Python runtime prerequisites (optional for minimal)',
            },
        ],
    };

    return [...common, ...runtimeByProfile[profile]];
}

export function CommandReference({
    workspaceProfile = 'minimal',
    hasActiveWorkspace = false,
    workspaceName,
}: CommandReferenceProps) {
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['workspace']));
    const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

    const workspaceCommands = buildWorkspaceCommands(workspaceProfile);
    const devCommands: Command[] = [
        {
            code: 'npx --yes --package rapidkit rapidkit doctor workspace --fix',
            description: 'Run doctor with safe auto-fixes for workspace issues',
        },
        {
            code: 'npx --yes --package rapidkit rapidkit --version',
            description: 'Show RapidKit CLI version',
        },
        {
            code: 'npx --yes --package rapidkit rapidkit --help',
            description: 'Display all available commands and options',
        },
        {
            code: 'npx --yes --package rapidkit rapidkit mirror sync',
            description: 'Sync mirror artifacts for offline/controlled environments',
        },
        {
            code: 'npx --yes --package rapidkit rapidkit mirror verify',
            description: 'Verify mirrored artifacts and policy compliance',
        },
    ];

    const categories: CommandCategory[] = [
        {
            id: 'workspace',
            title: 'Workspace Commands',
            icon: FolderOpen,
            count: workspaceCommands.length,
            commands: workspaceCommands,
        },
        {
            id: 'project',
            title: 'Project Commands',
            icon: Rocket,
            count: 7,
            commands: [
                {
                    code: 'npx --yes --package rapidkit rapidkit create project fastapi.standard my-api --output .',
                    description: 'Create FastAPI Standard project in current workspace',
                },
                {
                    code: 'npx --yes --package rapidkit rapidkit create project fastapi.ddd my-ddd-api --output .',
                    description: 'Create FastAPI DDD project with clean architecture',
                },
                {
                    code: 'npx --yes --package rapidkit rapidkit create project nestjs.standard my-service --output .',
                    description: 'Create NestJS project in current workspace',
                },
                {
                    code: 'npx --yes --package rapidkit rapidkit create project gofiber.standard my-go-service --output .',
                    description: 'Create Go/Fiber project in current workspace',
                },
                {
                    code: 'npx --yes --package rapidkit rapidkit create project springboot.standard my-spring-service --output .',
                    description: 'Create Spring Boot project in current workspace',
                },
                {
                    code: 'npx --yes --package rapidkit rapidkit create project springboot.standard billing-api --output ~/projects',
                    description: 'Create standalone Spring Boot project at custom location',
                },
                {
                    code: 'npx --yes --package rapidkit rapidkit init && npx --yes --package rapidkit rapidkit dev',
                    description: 'Initialize dependencies and start development server',
                },
            ],
        },
        {
            id: 'module',
            title: 'Module Commands',
            icon: PackageIcon,
            count: 5,
            commands: [
                {
                    code: 'npx --yes --package rapidkit rapidkit add module auth_core',
                    description: 'Password hashing, token signing, and runtime auth',
                },
                {
                    code: 'npx --yes --package rapidkit rapidkit add module db_postgres',
                    description: 'SQLAlchemy async Postgres with DI and health checks',
                },
                {
                    code: 'npx --yes --package rapidkit rapidkit add module redis',
                    description: 'Redis runtime with async and sync client',
                },
                {
                    code: 'npx --yes --package rapidkit rapidkit add module email',
                    description: 'Email delivery with SMTP support',
                },
                {
                    code: 'npx --yes --package rapidkit rapidkit add module storage',
                    description: 'File storage and media management',
                },
            ],
        },
        {
            id: 'dev',
            title: 'Development & Utilities',
            icon: Settings,
            count: devCommands.length,
            commands: devCommands,
        },
    ];

    const toggleCategory = (categoryId: string) => {
        setExpandedCategories((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(categoryId)) {
                newSet.delete(categoryId);
            } else {
                newSet.add(categoryId);
            }
            return newSet;
        });
    };

    const copyCommand = (command: string) => {
        navigator.clipboard.writeText(command);
        setCopiedCommand(command);
        setTimeout(() => setCopiedCommand(null), 2000);
    };

    return (
        <div className="section command-reference">
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Copy size={18} style={{ color: '#6C5CE7' }} />
                Command Reference
                {hasActiveWorkspace ? (
                    <span
                        className="ws-tag ws-tag--profile"
                        style={{ marginLeft: '6px' }}
                        title="Commands are filtered by the active workspace profile"
                    >
                        {workspaceProfile}
                    </span>
                ) : (
                    <span
                        className="ws-tag"
                        style={{ marginLeft: '6px' }}
                        title="Select a workspace to see profile-specific command suggestions"
                    >
                        Select workspace
                    </span>
                )}
            </div>

            {!hasActiveWorkspace && (
                <div
                    className="command-hint"
                    style={{
                        marginTop: '8px',
                        marginBottom: '10px',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--vscode-panel-border)',
                        background: 'var(--vscode-editor-inactiveSelectionBackground)',
                        fontSize: '11px',
                        color: 'var(--vscode-descriptionForeground)',
                    }}
                >
                    💡 To see profile-specific commands, select a workspace from the{' '}
                    <strong style={{ color: 'var(--vscode-foreground)' }}>WORKSPACES</strong> sidebar panel
                    first.
                </div>
            )}

            {hasActiveWorkspace && workspaceName && (
                <div
                    style={{
                        marginTop: '8px',
                        marginBottom: '10px',
                        fontSize: '11px',
                        color: 'var(--vscode-descriptionForeground)',
                    }}
                >
                    Workspace: <strong style={{ color: 'var(--vscode-foreground)' }}>{workspaceName}</strong>
                </div>
            )}

            {categories.map((category) => {
                const Icon = category.icon;
                const isExpanded = expandedCategories.has(category.id);

                return (
                    <div key={category.id} className="command-category">
                        <div
                            className={`category-header ${isExpanded ? 'expanded' : ''}`}
                            onClick={() => toggleCategory(category.id)}
                        >
                            <div className="category-title">
                                <Icon size={16} className="category-icon-lucide" />
                                <span>{category.title}</span>
                                <span className="category-count">{category.count}</span>
                            </div>
                            <ChevronDown
                                size={16}
                                className="category-toggle"
                                style={{
                                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s',
                                }}
                            />
                        </div>
                        <div className={`category-content ${isExpanded ? 'expanded' : ''}`}>
                            <div className="command-list">
                                {category.commands.map((cmd, index) => (
                                    <div key={index} className="command-item">
                                        <div className="command-header">
                                            <div className="command-code">{simplifyCommandForDisplay(cmd.code)}</div>
                                            <button
                                                className={`command-copy-btn ${copiedCommand === cmd.code ? 'copied' : ''}`}
                                                onClick={() => copyCommand(cmd.code)}
                                                title="Copy command"
                                            >
                                                {copiedCommand === cmd.code ? (
                                                    <>✓ Copied!</>
                                                ) : (
                                                    <>
                                                        <Copy size={12} /> Copy
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                        <div className="command-desc">{cmd.description}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
