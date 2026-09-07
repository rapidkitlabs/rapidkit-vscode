import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  INCIDENT_STUDIO_SESSION_KEY_PREFIX,
  readIncidentStudioSession,
  writeIncidentStudioSession,
} from '../ui/panels/incidentStudioSessionPersistenceBridge';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((entry) => fs.remove(entry)));
});

describe('incident studio session persistence', () => {
  it('persists sessions under globalStorageUri and clears legacy globalState', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-incident-store-'));
    tempRoots.push(storageRoot);
    const workspacePath = '/tmp/managed-workspace';
    const legacyKey = `${INCIDENT_STUDIO_SESSION_KEY_PREFIX}${workspacePath}`;
    const globalState = new Map<string, unknown>([
      [
        legacyKey,
        {
          workspacePath,
          phase: 'diagnose',
          approvalAuditEvents: [],
          proofEvents: [],
          executionTranscripts: [],
          chatMessages: [{ id: 'm1', role: 'user', content: 'hello', timestamp: '2026-01-01' }],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    ]);

    const context = {
      globalStorageUri: { fsPath: storageRoot },
      globalState: {
        get: vi.fn((key: string) => globalState.get(key)),
        update: vi.fn(async (key: string, value: unknown) => {
          if (value === undefined) {
            globalState.delete(key);
          } else {
            globalState.set(key, value);
          }
        }),
      },
    };

    const migrated = readIncidentStudioSession(context as never, workspacePath);
    expect(migrated.phase).toBe('diagnose');
    expect(migrated.chatMessages).toHaveLength(1);

    const written = await writeIncidentStudioSession(context as never, workspacePath, {
      ...migrated,
      phase: 'plan',
      chatMessages: [
        ...migrated.chatMessages,
        {
          id: 'm2',
          role: 'assistant',
          content: 'ack',
          timestamp: '2026-01-02T00:00:00.000Z',
        },
      ],
    });

    expect(written.phase).toBe('plan');
    expect(globalState.has(legacyKey)).toBe(false);
    expect(context.globalState.update).toHaveBeenCalledWith(legacyKey, undefined);

    const sessionFiles = await fs.readdir(path.join(storageRoot, 'incident-studio-sessions'));
    expect(sessionFiles).toHaveLength(1);

    // Subsequent reads must come from the file, not the cleared memento.
    globalState.clear();
    const reloaded = readIncidentStudioSession(context as never, workspacePath);
    expect(reloaded.phase).toBe('plan');
    expect(reloaded.chatMessages.map((message) => message.id)).toEqual(['m1', 'm2']);
  });
});
