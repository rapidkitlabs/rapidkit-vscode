#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const options = {
    output: path.resolve('artifacts/open-issues-report.json'),
    repo: process.env.GITHUB_REPOSITORY || '',
    state: 'open',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--output') {
      options.output = path.resolve(argv[i + 1] || options.output);
      i += 1;
      continue;
    }

    if (arg === '--repo') {
      options.repo = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    if (arg === '--state') {
      const value = String(argv[i + 1] || '').trim().toLowerCase();
      options.state = value || options.state;
      i += 1;
    }
  }

  return options;
}

function normalizeIssue(issue) {
  const labels = Array.isArray(issue?.labels)
    ? issue.labels.map((label) => {
        if (typeof label === 'string') {
          return { name: label };
        }
        return { name: label?.name || '' };
      })
    : [];

  return {
    id: issue?.id ?? issue?.number ?? null,
    number: issue?.number ?? null,
    title: typeof issue?.title === 'string' ? issue.title : '',
    state: typeof issue?.state === 'string' ? issue.state : 'open',
    isOpen: issue?.state !== 'closed',
    labels,
    html_url: issue?.html_url || null,
    created_at: issue?.created_at || null,
    updated_at: issue?.updated_at || null,
    pull_request: issue?.pull_request || null,
  };
}

async function fetchIssues({ repo, token, state }) {
  const allIssues = [];
  let page = 1;

  while (true) {
    const url = new URL(`https://api.github.com/repos/${repo}/issues`);
    url.searchParams.set('state', state);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));

    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'workspai-release-gate',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `GitHub API request failed (${response.status} ${response.statusText}): ${details}`
      );
    }

    const payload = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) {
      break;
    }

    allIssues.push(...payload);

    if (payload.length < 100) {
      break;
    }
    page += 1;
  }

  return allIssues;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.repo) {
    throw new Error('Missing repository. Provide --repo <owner/name> or set GITHUB_REPOSITORY.');
  }

  const token = process.env.GITHUB_TOKEN || '';
  const issues = await fetchIssues({ repo: options.repo, token, state: options.state });

  const report = {
    generatedAt: new Date().toISOString(),
    source: 'github-rest-v3',
    repository: options.repo,
    state: options.state,
    issueCount: issues.length,
    issues: issues.map(normalizeIssue),
  };

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  console.log(
    `[open-issues-report] wrote ${report.issueCount} issue(s) to ${options.output} for ${options.repo}.`
  );
}

main().catch((error) => {
  console.error(`[open-issues-report] ${error.message}`);
  process.exit(1);
});