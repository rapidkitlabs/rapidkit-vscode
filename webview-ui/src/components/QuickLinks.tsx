import { useState } from 'react';
import { MessageSquarePlus, Sparkles } from 'lucide-react';

interface QuickLinksProps {
    onOpenProjectModal: (framework: 'fastapi' | 'nestjs' | 'go' | 'springboot', kitName?: string) => void;
}

const POLL_OPTIONS = ['Django', 'Express', 'Ruby on Rails', 'Laravel'] as const;

export function QuickLinks({ onOpenProjectModal }: QuickLinksProps) {
    const [voted, setVoted] = useState<string | null>(null);

    const links: Array<{
        framework: 'fastapi' | 'nestjs' | 'go' | 'springboot';
        className: string;
        title: string;
        subtitle: string;
        icon: string;
        alt: string;
    }> = [
            {
                framework: 'fastapi',
                className: 'fastapi',
                title: 'FastAPI',
                subtitle: 'Python + Async',
                icon: (window as any).FASTAPI_ICON_URI,
                alt: 'FastAPI'
            },
            {
                framework: 'nestjs',
                className: 'nestjs',
                title: 'NestJS',
                subtitle: 'TypeScript + DI',
                icon: (window as any).NESTJS_ICON_URI,
                alt: 'NestJS'
            },
            {
                framework: 'go',
                className: 'go',
                title: 'Go',
                subtitle: 'Go + High Perf',
                icon: (window as any).GO_ICON_URI,
                alt: 'Go'
            },
            {
                framework: 'springboot',
                className: 'springboot',
                title: 'Spring Boot',
                subtitle: 'Java + Spring',
                icon: (window as any).SPRINGBOOT_ICON_URI,
                alt: 'Spring Boot'
            }
        ];

    return (
        <>
            <div className="quick-links-header">
                <span className="quick-links-label">Start a Project</span>
                <span className="quick-links-hint">choose your framework</span>
                <span className="quick-links-ai-hint">
                    <Sparkles size={9} />
                    build with AI
                </span>
            </div>
            <div className="quick-links" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                {links.map((link) => (
                    <button
                        key={link.framework}
                        type="button"
                        className={`quick-link ${link.className}`}
                        onClick={() => onOpenProjectModal(link.framework)}
                        aria-label={`Create ${link.title} project`}
                    >
                        <span className="quick-link-icon" aria-hidden="true">
                            <img src={link.icon} alt={link.alt} />
                        </span>
                        <div className="quick-link-title">{link.title}</div>
                        <div className="quick-link-subtitle">{link.subtitle}</div>
                    </button>
                ))}
            </div>
            <div className="quick-link-poll">
                {voted ? (
                    <>
                        <MessageSquarePlus size={11} className="quick-link-poll-icon" />
                        <span className="quick-link-poll-thanks">Got it! We'll work on</span>
                        <span className="quick-link-poll-winner">{voted}</span>
                        <span className="quick-link-poll-thanks">next.</span>
                    </>
                ) : (
                    <>
                        <MessageSquarePlus size={11} className="quick-link-poll-icon" />
                        <span className="quick-link-poll-question">Which backend next?</span>
                        <div className="quick-link-poll-options">
                            {POLL_OPTIONS.map((opt) => (
                                <button
                                    key={opt}
                                    type="button"
                                    className="quick-link-poll-option"
                                    onClick={() => setVoted(opt)}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
