// @vitest-environment jsdom

import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AIIncidentStudio } from '../../webview-ui/src/components/AIIncidentStudio';

function buildBaseProps(
  overrides: Partial<ComponentProps<typeof AIIncidentStudio>> = {}
): ComponentProps<typeof AIIncidentStudio> {
  return {
    workspaceName: 'Acme Workspace',
    isAnalyzing: false,
    conversationTurns: 0,
    studioDisplayMode: 'full',
    telemetry: null,
    chatBrainStreamText: '',
    chatBrainHistory: [],
    chatBrainSuggestedQuestions: [],
    chatBrainBoard: null,
    chatBrainActionProgress: null,
    chatBrainActionResult: null,
    chatBrainSystemGraphSnapshot: null,
    chatBrainImpactAssessment: null,
    chatBrainPredictiveWarning: null,
    chatBrainReleaseGateEvidence: null,
    chatBrainError: null,
    incidentResume: null,
    onRunTerminalBridge: () => {},
    onRunFixPreview: () => {},
    onRunChangeImpact: () => {},
    onRunMemoryWizard: () => {},
    onRunDoctorChecks: () => {},
    ...overrides,
  };
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (entry) => entry.textContent?.trim() === label
  );

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button as HTMLButtonElement;
}

function findCheckboxByLabel(container: HTMLElement, text: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll('label')).find((entry) =>
    entry.textContent?.includes(text)
  );

  const checkbox = label?.querySelector('input[type="checkbox"]');
  if (!(checkbox instanceof HTMLInputElement)) {
    throw new Error(`Checkbox not found for label: ${text}`);
  }

  return checkbox;
}

describe('AIIncidentStudio interactions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    Object.defineProperty(HTMLDivElement.prototype, 'scrollTo', {
      value: vi.fn(),
      configurable: true,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('routes repro-pack export, import, and replay clicks to the expected handlers', () => {
    const onExportIncidentReproPack = vi.fn();
    const onImportIncidentReproPack = vi.fn();
    const onChatBrainQuery = vi.fn();

    act(() => {
      root.render(
        createElement(
          AIIncidentStudio,
          buildBaseProps({
            onExportIncidentReproPack,
            onImportIncidentReproPack,
            onChatBrainQuery,
            chatBrainActionResult: {
              success: false,
              outputSummary: 'Captured repro pack for auth regression.',
              incidentReproPack: {
                packId: 'repro-pack-42',
                status: 'captured',
                capturedAt: '2026-05-11T04:00:00Z',
                schemaVersion: 'v1',
                workspacePath: '/workspace/acme',
                conversationId: 'conv-1',
                actionId: 'action-1',
                redaction: {
                  policy: 'strict',
                  applied: true,
                  redactedFields: ['token'],
                },
                summary: {
                  historyTurns: 4,
                  hasDoctorEvidence: true,
                  hasRollbackEvidence: false,
                  hasSandboxEvidence: false,
                  hasPredictiveWarning: true,
                  verifySuccess: false,
                  affectedFilesCount: 2,
                  blockedReasonCount: 1,
                },
                replayPayload: {
                  workspacePath: '/workspace/acme',
                  conversationId: 'conv-1',
                  actionType: 'doctor-fix',
                  riskLevel: 'high',
                  likelyFailureMode: 'authorization regression',
                  verifyChecklist: ['npm run test:integration'],
                  blockedReasons: ['scope unknown'],
                  relatedFiles: ['src/orders/service.ts'],
                },
                exportHint: 'Bundle is redacted and safe to share.',
              },
            },
          })
        )
      );
    });

    act(() => {
      findButton(container, 'Export redacted bundle').dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });
    expect(onExportIncidentReproPack).toHaveBeenCalledTimes(1);
    expect(onExportIncidentReproPack.mock.calls[0]?.[0]?.packId).toBe('repro-pack-42');

    act(() => {
      findButton(container, 'Import bundle and replay').dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });
    expect(onImportIncidentReproPack).toHaveBeenCalledTimes(1);

    act(() => {
      findButton(container, 'Replay in Incident Studio').dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });
    expect(onChatBrainQuery).toHaveBeenCalledTimes(1);
    expect(onChatBrainQuery.mock.calls[0]?.[0]).toContain('Pack ID: repro-pack-42');
    expect(onChatBrainQuery.mock.calls[0]?.[0]).toContain('Verification checklist:');
  });

  it('applies only the accepted patch paths and preserves host-confirmed apply state semantics', () => {
    const onApplyPatch = vi.fn();

    act(() => {
      root.render(
        createElement(
          AIIncidentStudio,
          buildBaseProps({
            onApplyPatch,
            chatBrainActionResult: {
              success: false,
              outputSummary: 'Generated patch set for review.',
              multiFilePatch: {
                patchId: 'patch-123',
                generatedAt: '2026-05-11T04:10:00Z',
                actionId: 'action-2',
                patches: [
                  {
                    relativePath: 'src/orders/service.ts',
                    language: 'typescript',
                    isNewFile: false,
                    patchedContent: 'patched service',
                    hunks: [],
                    status: 'pending',
                  },
                  {
                    relativePath: 'src/orders/controller.ts',
                    language: 'typescript',
                    isNewFile: false,
                    patchedContent: 'patched controller',
                    hunks: [],
                    status: 'pending',
                  },
                ],
                verificationPassed: false,
                appliedCount: 0,
                rejectedCount: 0,
                failedCount: 0,
              },
            },
          })
        )
      );
    });

    const serviceCheckbox = findCheckboxByLabel(container, 'src/orders/service.ts');
    act(() => {
      serviceCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const branchCheckbox = findCheckboxByLabel(container, 'Create branch before apply');
    act(() => {
      branchCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    act(() => {
      findButton(container, 'Apply 1 of 2 files').dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    expect(onApplyPatch).toHaveBeenCalledTimes(1);
    expect(onApplyPatch).toHaveBeenCalledWith('patch-123', ['src/orders/controller.ts'], false);

    expect(findButton(container, 'Apply 1 of 2 files')).toBeTruthy();
  });
});
