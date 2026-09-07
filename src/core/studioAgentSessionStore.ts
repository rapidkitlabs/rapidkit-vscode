import type * as vscode from 'vscode';
import * as fs from 'fs-extra';
import path from 'node:path';

import type { StudioAgentPersistedSession } from './studioAgentEvents.js';
import type { StudioAgentSessionStore } from './studioAgentSession.js';

const STORAGE_KEY = 'workspai.studioAgentSessions.v1';
const MAX_SESSIONS = 24;
const MAX_EVENTS_PER_SESSION = 500;
const MAX_SESSION_BYTES = 4 * 1024 * 1024;
const STORE_FILE_NAME = 'studio-agent-sessions.v1.json';

type StoredSessions = {
  schemaVersion: 'workspai.studio-agent-session-store.v1';
  sessions: StudioAgentPersistedSession[];
};

const contextOperations = new WeakMap<object, Promise<void>>();

function isStoredSessions(value: unknown): value is StoredSessions {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as StoredSessions).schemaVersion === 'workspai.studio-agent-session-store.v1' &&
    Array.isArray((value as StoredSessions).sessions)
  );
}

function storeFilePath(context: vscode.ExtensionContext): string | undefined {
  const storagePath = context.storageUri?.fsPath;
  return storagePath ? path.join(storagePath, STORE_FILE_NAME) : undefined;
}

async function persistStore(
  context: vscode.ExtensionContext,
  store: StoredSessions
): Promise<void> {
  const filePath = storeFilePath(context);
  if (!filePath) {
    await context.workspaceState.update(STORAGE_KEY, store);
    return;
  }

  await fs.ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await fs.writeJSON(tempPath, store);
    await fs.move(tempPath, filePath, { overwrite: true });
  } finally {
    await fs.remove(tempPath).catch(() => undefined);
  }
  // Migrate legacy state out of VS Code's synchronous workspace memento. Large
  // agent transcripts otherwise inflate extension-host hydration on every load.
  await context.workspaceState.update(STORAGE_KEY, undefined);
}

async function readStore(context: vscode.ExtensionContext): Promise<StoredSessions> {
  const filePath = storeFilePath(context);
  if (filePath && (await fs.pathExists(filePath))) {
    const stored = await fs.readJSON(filePath).catch(() => undefined);
    if (isStoredSessions(stored)) {
      return stored;
    }
  }

  const stored = context.workspaceState.get<StoredSessions>(STORAGE_KEY);
  if (isStoredSessions(stored)) {
    if (filePath) {
      await persistStore(context, stored);
    }
    return stored;
  }
  return { schemaVersion: 'workspai.studio-agent-session-store.v1', sessions: [] };
}

async function serializeStoreOperation<T>(
  context: vscode.ExtensionContext,
  operation: () => Promise<T>
): Promise<T> {
  const previous = contextOperations.get(context) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  contextOperations.set(
    context,
    current.then(
      () => undefined,
      () => undefined
    )
  );
  return current;
}

function boundedSession(session: StudioAgentPersistedSession): StudioAgentPersistedSession {
  const bounded: StudioAgentPersistedSession = {
    ...structuredClone(session),
    events: session.events.slice(-MAX_EVENTS_PER_SESSION),
  };
  while (
    bounded.events.length > 1 &&
    Buffer.byteLength(JSON.stringify(bounded), 'utf8') > MAX_SESSION_BYTES
  ) {
    bounded.events.shift();
  }
  if (Buffer.byteLength(JSON.stringify(bounded), 'utf8') > MAX_SESSION_BYTES) {
    const latest = bounded.events.at(-1);
    bounded.events = latest
      ? [
          {
            ...latest,
            data: {
              truncated: true,
              summary: 'The latest Studio Agent event exceeded the durable storage budget.',
            },
          },
        ]
      : [];
  }
  return bounded;
}

export class VSCodeStudioAgentSessionStore implements StudioAgentSessionStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async save(session: StudioAgentPersistedSession): Promise<void> {
    await serializeStoreOperation(this.context, async () => {
      const store = await readStore(this.context);
      const sessions = store.sessions.filter((entry) => entry.id !== session.id);
      sessions.unshift(boundedSession(session));
      await persistStore(this.context, {
        schemaVersion: 'workspai.studio-agent-session-store.v1',
        sessions: sessions.slice(0, MAX_SESSIONS),
      } satisfies StoredSessions);
    });
  }

  async load(sessionId: string): Promise<StudioAgentPersistedSession | undefined> {
    return serializeStoreOperation(this.context, async () => {
      const session = (await readStore(this.context)).sessions.find(
        (entry) => entry.id === sessionId
      );
      return session ? structuredClone(session) : undefined;
    });
  }

  async list(workspacePath?: string): Promise<StudioAgentPersistedSession[]> {
    return serializeStoreOperation(this.context, async () => {
      const sessions = (await readStore(this.context)).sessions;
      return sessions
        .filter((session) => !workspacePath || session.workspacePath === workspacePath)
        .map((session) => structuredClone(session));
    });
  }
}
