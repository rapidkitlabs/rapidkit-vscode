import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { IncidentStudioVNext } from '@/components/StudioRedesign';
import '@/styles-tailwind.css';

declare global {
    interface Window {
        INCIDENT_STUDIO_WORKSPACE_NAME?: string;
    }
}

const root = document.getElementById('root');

if (root) {
    const workspaceName = window.INCIDENT_STUDIO_WORKSPACE_NAME || 'rapidkit-core';

    createRoot(root).render(
        <StrictMode>
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
                onSendMessage={() => {
                    // Dedicated vNext preview panel is currently UI-only.
                }}
            />
        </StrictMode>
    );
}
