import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Primary review navigation and accessibility', () => {
  it('puts Dashboard before the two intelligence views and preserves setup deep linking', () => {
    const source = readFileSync('webview-ui/src/App.tsx', 'utf8');
    const tabs = source.slice(source.indexOf('const workspaiViewTabs ='));
    const labels = [...tabs.matchAll(/workspai-view-tab-label">([^<]+)</g)].map(
      (match) => match[1]
    );
    expect(labels.slice(0, 3)).toEqual(['Dashboard', 'Analyze Repo', 'Review Changes']);
    const initial = source.slice(
      source.indexOf('function resolveInitialActiveView'),
      source.indexOf('export function App')
    );
    expect(initial).toContain("return 'dashboard'");
    expect(initial).toContain("return 'setup'");
  });
  it('announces analysis progress without making the entire interactive graph a live region', () => {
    const source = readFileSync('webview-ui/src/components/RepositoryAnalysisPanel.tsx', 'utf8');
    expect(source).not.toContain('aria-live="polite"');
    expect(source).toContain("role={error ? 'alert' : 'status'}");
    expect(source).toContain('aria-describedby="repository-analysis-url-help"');
  });
});
