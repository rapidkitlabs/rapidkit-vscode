import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { IncidentStudioVNext } from '@/components/StudioRedesign';
import AnalyzeReportViewer from '@/components/AnalyzeReportViewer';
import { vscode } from '@/vscode';
import '@/styles-tailwind.css';

declare global {
    interface Window {
        INCIDENT_STUDIO_WORKSPACE_PATH?: string;
        INCIDENT_STUDIO_WORKSPACE_NAME?: string;
    }
}

interface AnalyzeReport {
  schemaVersion: string;
  generatedAt: string;
  workspacePath: string;
  summary: {
    score: number;
    verdict: 'ready' | 'needs-attention' | 'blocked';
    projectCount: number;
    runtimeCount: number;
    findings: {
      fail: number;
      warn: number;
      info: number;
    };
  };
  findings: Array<{
    id: string;
    severity: 'fail' | 'warn' | 'info';
    target: string;
    title: string;
    detail: string;
    remediation: string;
  }>;
  enterpriseControls?: {
    ciGateCommand: string;
    releaseGateCommand: string;
    evidencePath?: string;
  };
  [key: string]: unknown;
}

/**
 * App wrapper to manage initialization and report checking/loading
 */
const IncidentStudioApp = () => {
    const workspacePath = window.INCIDENT_STUDIO_WORKSPACE_PATH || '';
    const workspaceName = window.INCIDENT_STUDIO_WORKSPACE_NAME || 'Unknown Workspace';
    
    // Report state
    const [reportExists, setReportExists] = useState<boolean | null>(null);
    const [reportData, setReportData] = useState<AnalyzeReport | null>(null);
    const [reportError, setReportError] = useState<string | null>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [showStudio, setShowStudio] = useState(false);

    // Check if analyze report exists and load it on mount
    useEffect(() => {
        if (!workspacePath) return;

        // First, check if report exists
        vscode.postMessage('checkReportExists', { workspacePath });

        // Then try to load it
        setReportLoading(true);
        vscode.postMessage('loadReport', { workspacePath });
    }, [workspacePath]);

    // Listen for messages from extension
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            switch (message.command) {
                case 'reportExistsResult':
                    setReportExists(message.exists);
                    break;

                case 'reportLoaded':
                    setReportLoading(false);
                    if (message.error) {
                        setReportError(message.error);
                        setReportData(null);
                    } else {
                        setReportData(message.data);
                        setReportError(null);
                        if (message.data) {
                            setShowStudio(true);
                        }
                    }
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleSendMessage = (message: string) => {
        // Check if this is a special command
        if (message.startsWith('/runAnalyze')) {
            vscode.postMessage('runAnalyze', { workspacePath });
        } else {
            // Regular message handling
            console.log('Message from Studio:', message);
        }
    };

    const handleRunAnalyzeClick = () => {
        vscode.postMessage('runAnalyze', { workspacePath });
    };

    const handleCopyCommand = (text: string) => {
        vscode.postMessage('copyText', { text });
    };

    const handleRevealEvidence = (path: string) => {
        vscode.postMessage('revealEvidence', { path, workspacePath });
    };

    const handleShowStudio = () => {
        setShowStudio(true);
    };

    // If report exists and we should show it, render the report viewer
    if (reportExists && reportData) {
        return (
            <StrictMode>
                <AnalyzeReportViewer 
                    report={reportData} 
                    isLoading={reportLoading}
                    error={reportError}
                    onRunAnalyze={handleRunAnalyzeClick}
                    onCopyCommand={handleCopyCommand}
                    onRevealEvidence={handleRevealEvidence}
                />
            </StrictMode>
        );
    }

    // Otherwise show the studio with banner
    return (
        <StrictMode>
            {/* Report Missing Banner */}
            {!reportExists && workspacePath && (
                <div style={{
                    background: 'var(--vscode-inputValidation-warningBackground, #5f7e0f)',
                    color: 'var(--vscode-inputValidation-warningForeground, #fff)',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--vscode-inputValidation-warningBorder, #444)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    fontSize: '13px',
                }}>
                    <span>
                        <strong>Workspace analysis not found.</strong> Run <code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '3px' }}>rapidkit analyze</code> to get started with full workspace health diagnostics.
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handleRunAnalyzeClick}
                            style={{
                                background: 'var(--vscode-button-background, #0078d4)',
                                color: 'var(--vscode-button-foreground, #fff)',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            Run Analyze
                        </button>
                    </div>
                </div>
            )}

            {/* Report Error Banner */}
            {reportError && !reportData && (
                <div style={{
                    background: 'rgba(241, 76, 76, 0.1)',
                    color: 'var(--vscode-foreground)',
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(241, 76, 76, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    fontSize: '13px',
                }}>
                    <span>
                        <strong>⚠️ Error:</strong> {reportError}
                    </span>
                    <button
                        onClick={handleRunAnalyzeClick}
                        style={{
                            background: 'var(--vscode-button-background, #0078d4)',
                            color: 'var(--vscode-button-foreground, #fff)',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Retry
                    </button>
                </div>
            )}

            <IncidentStudioVNext
                initialState={{
                    workspaceName,
                    userMode: 'expert',
                    health: {
                        modulesOk: 12,
                        modulesWarning: 2,
                        modulesError: 1,
                        systemLastCheck: 'just now',
                    },
                    relatedFiles: [
                        { path: 'src/core/doctor/evidence.ts', health: 'ok', freshness: '1m ago' },
                        { path: 'src/core/release/gates.ts', health: 'warning', freshness: '2m ago' },
                        { path: 'src/kits/incident/studio.ts', health: 'error', freshness: '5m ago' },
                    ],
                    policyGates: {
                        flowState: 'warning',
                        telemetryState: 'partial',
                        releasePosture: 'pending',
                        artifactId: 'artifact://incident-studio/preview',
                    },
                }}
                onSendMessage={handleSendMessage}
            />
        </StrictMode>
    );
};

const root = document.getElementById('root');

if (root) {
    createRoot(root).render(<IncidentStudioApp />);
}
