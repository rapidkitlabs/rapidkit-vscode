export type IncidentMemoryReuseSnapshot = {
  heading: string;
  bullets: string[];
};

export type IncidentMemoryReuseInput = {
  workspaceMemoryContext?: string;
  conventions?: string[];
  decisions?: string[];
  doctorFixCommands?: string[];
};

export type IncidentReplayLearningInput = {
  packId: string;
  actionType: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  likelyFailureMode?: string;
  verifyChecklist?: string[];
  blockedReasons?: string[];
  relatedFiles?: string[];
};

export type IncidentMemoryDocument = {
  context: string;
  conventions: string[];
  decisions: string[];
  lastUpdated: string;
};

const REUSE_HEADING = 'Worked previously in this workspace:';

function compactLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function shortenLine(value: string, maxLength = 140): string {
  const compacted = compactLine(value);
  if (!compacted) {
    return '';
  }
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, maxLength - 1).trim()}...`;
}

function dedupeKeepOrder(lines: string[], maxItems: number): string[] {
  return [...new Set(lines.map((line) => compactLine(line)).filter(Boolean))].slice(0, maxItems);
}

export function buildIncidentMemoryReuseSnapshot(
  input: IncidentMemoryReuseInput
): IncidentMemoryReuseSnapshot | null {
  const bullets: string[] = [];

  const context = shortenLine(input.workspaceMemoryContext || '', 160);
  if (context) {
    bullets.push(`Project context: ${context}`);
  }

  const decisions = (input.decisions || [])
    .map((line) => shortenLine(line))
    .filter(Boolean)
    .slice(0, 2)
    .map((line) => `Decision: ${line}`);
  bullets.push(...decisions);

  const conventions = (input.conventions || [])
    .map((line) => shortenLine(line))
    .filter(Boolean)
    .slice(0, 2)
    .map((line) => `Convention: ${line}`);
  bullets.push(...conventions);

  const doctorFixCommands = (input.doctorFixCommands || [])
    .map((line) => shortenLine(line))
    .filter(Boolean)
    .slice(0, 2)
    .map((line) => `Previously useful fix command: ${line}`);
  bullets.push(...doctorFixCommands);

  const dedupedBullets = [...new Set(bullets)].slice(0, 5);
  if (dedupedBullets.length === 0) {
    return null;
  }

  return {
    heading: REUSE_HEADING,
    bullets: dedupedBullets,
  };
}

export function shouldAttachIncidentMemoryReuse(
  queryCount: number,
  snapshot: IncidentMemoryReuseSnapshot | null
): boolean {
  return queryCount === 1 && !!snapshot;
}

export function buildIncidentMemoryPromptHint(
  snapshot: IncidentMemoryReuseSnapshot | null
): string {
  if (!snapshot) {
    return '';
  }

  const bullets = snapshot.bullets
    .slice(0, 3)
    .map((line) => `- ${line}`)
    .join('\n');

  return [
    'FIRST_RESPONSE_MEMORY_RULE:',
    `- On the first assistant response in this incident session, start with exactly: "${snapshot.heading}"`,
    '- Then include 1-3 concise bullets derived from this workspace memory before the diagnosis body.',
    '- Reuse hints:',
    bullets,
  ].join('\n');
}

export function prependIncidentMemoryReuseBlock(
  assistantText: string,
  snapshot: IncidentMemoryReuseSnapshot | null
): string {
  if (!snapshot) {
    return assistantText;
  }

  const trimmed = assistantText.trim();
  if (!trimmed) {
    return assistantText;
  }

  const hasHeading = trimmed.toLowerCase().includes(snapshot.heading.toLowerCase());
  if (hasHeading) {
    return trimmed;
  }

  const bulletBlock = snapshot.bullets.map((line) => `- ${line}`).join('\n');
  return `${snapshot.heading}\n${bulletBlock}\n\n${trimmed}`;
}

export function mergeIncidentReplayLearningIntoMemory(
  memory: IncidentMemoryDocument,
  learning: IncidentReplayLearningInput
): IncidentMemoryDocument {
  const verifyStep = shortenLine(learning.verifyChecklist?.[0] || '', 120);
  const blockedReason = shortenLine(learning.blockedReasons?.[0] || '', 110);
  const relatedFiles = dedupeKeepOrder(learning.relatedFiles || [], 2).join(', ');
  const summary = shortenLine(
    [
      `Incident replay ${learning.packId} (${learning.riskLevel})`,
      learning.likelyFailureMode
        ? `resolved ${learning.likelyFailureMode}`
        : `verified ${learning.actionType}`,
      verifyStep ? `Verify with: ${verifyStep}` : '',
      blockedReason ? `Watch for: ${blockedReason}` : '',
      relatedFiles ? `Files: ${relatedFiles}` : '',
    ]
      .filter(Boolean)
      .join(' — '),
    220
  );

  if (!summary) {
    return memory;
  }

  const nextDecisions = dedupeKeepOrder([summary, ...(memory.decisions || [])], 12);
  const nextConventions = verifyStep
    ? dedupeKeepOrder(
        [`Replay verify-first rule: ${verifyStep}`, ...(memory.conventions || [])],
        12
      )
    : memory.conventions || [];

  return {
    context: compactLine(memory.context || ''),
    conventions: nextConventions,
    decisions: nextDecisions,
    lastUpdated: memory.lastUpdated,
  };
}
