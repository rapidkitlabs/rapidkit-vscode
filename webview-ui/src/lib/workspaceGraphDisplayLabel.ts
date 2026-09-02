import type { WorkspaceGraphEntityProjection } from '@workspai-contracts/workspaceGraphProjection';

const LANGUAGE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  c: 'C',
  'c#': 'C#',
  cpp: 'C++',
  'c++': 'C++',
  csharp: 'C#',
  css: 'CSS',
  dart: 'Dart',
  elixir: 'Elixir',
  fsharp: 'F#',
  go: 'Go',
  html: 'HTML',
  java: 'Java',
  javascript: 'JavaScript',
  kotlin: 'Kotlin',
  lua: 'Lua',
  'objective-c': 'Objective-C',
  php: 'PHP',
  python: 'Python',
  ruby: 'Ruby',
  rust: 'Rust',
  scala: 'Scala',
  shell: 'Shell',
  sql: 'SQL',
  swift: 'Swift',
  typescript: 'TypeScript',
};

function compactMiddle(value: string, maximum: number): string {
  const codepoints = Array.from(value);
  if (codepoints.length <= maximum) {
    return value;
  }
  const suffixLength = Math.max(5, Math.floor(maximum * 0.34));
  const prefixLength = Math.max(5, maximum - suffixLength - 1);
  return `${codepoints.slice(0, prefixLength).join('')}…${codepoints.slice(-suffixLength).join('')}`;
}

function languageDisplayLabel(label: string): string {
  const declared = /(?:programming\s+language|language)\s*:\s*(.+)$/iu.exec(label)?.[1]?.trim();
  const candidate = declared || label;
  const known = LANGUAGE_DISPLAY_NAMES[candidate.toLocaleLowerCase('en-US')];
  if (known) {
    return known;
  }
  const codepoints = Array.from(candidate);
  return codepoints.length
    ? `${codepoints[0].toLocaleUpperCase('en-US')}${codepoints.slice(1).join('')}`
    : candidate;
}

function pathDisplayLabel(value: string, maximum: number): string {
  const normalized = value.replace(/\\/gu, '/').replace(/\/+$/gu, '');
  const segments = normalized.split('/').filter(Boolean);
  const compact = segments.length > 1 ? segments.slice(-2).join('/') : normalized;
  return compactMiddle(compact, maximum);
}

/**
 * Produce a compact canvas label without changing the canonical Graph label.
 * Search, details, evidence, exports, and agent consumers retain entity.label.
 */
export function workspaceGraphDisplayLabel(
  entity: WorkspaceGraphEntityProjection,
  maximum = 28
): string {
  const boundedMaximum = Math.max(12, Math.min(48, Math.floor(maximum)));
  const label = entity.label.replace(/\s+/gu, ' ').trim() || entity.id;
  if (entity.kind === 'language') {
    return compactMiddle(languageDisplayLabel(label), boundedMaximum);
  }
  if (entity.kind === 'file') {
    return pathDisplayLabel(entity.path || label, boundedMaximum);
  }
  return compactMiddle(label, boundedMaximum);
}
