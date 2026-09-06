import { useEffect, useRef, useState } from 'react';
import {
  GitCompareArrows,
  FolderGit2,
  ShieldCheck,
  Files,
  Network,
  ListChecks,
  Copy,
  RefreshCw,
  Search,
  Info,
  Loader2,
} from 'lucide-react';
import type { ChangeReview } from '@workspai-contracts/changeReview';
import { vscode } from '@/vscode';
import { reviewScopeMatches, summarizeReviewFiles } from '@/lib/changeReviewPresentation';
import '../styles/workspai-change-review.css';

export function ChangeReviewPanel() {
  const [base, setBase] = useState('HEAD');
  const [report, setReport] = useState<ChangeReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [checkedAt, setCheckedAt] = useState(0);
  const request = useRef('');
  const activeCommand = useRef('');
  const scopeMatches = report ? reviewScopeMatches(report, base) : false;
  const counts = summarizeReviewFiles(report?.files ?? []);
  const visibleFiles =
    report?.files.filter((file) => file.path.toLowerCase().includes(filter.toLowerCase())) ?? [];
  const send = (command: string, data: Record<string, unknown> = {}) => {
    if (activeCommand.current) return;
    activeCommand.current = command;
    request.current = crypto.randomUUID();
    setBusy(true);
    setError('');
    setMessage('');
    vscode.postMessage(command, { ...data, requestId: request.current });
  };
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const { command, data } = event.data ?? {};
      if (!data || data.requestId !== request.current) return;
      if (
        command !== 'changeReviewProgress' &&
        !(command === 'changeReviewFreshness' && activeCommand.current === 'copyChangeReview')
      ) {
        activeCommand.current = '';
      }
      if (command === 'changeReviewProgress') setMessage(data.message);
      if (command === 'changeReviewCompleted') {
        setReport(data.report);
        setFilter('');
        setCheckedAt(Date.now());
        setStale(false);
        setBusy(false);
        setMessage('Observed at the time below. Recheck after editing.');
      }
      if (command === 'changeReviewFreshness') {
        setStale(data.stale);
        setCheckedAt(Date.now());
        if (activeCommand.current !== 'copyChangeReview') setBusy(false);
        setMessage(
          data.stale ? 'Files changed. Refresh this review.' : 'Contents still match this review.'
        );
      }
      if (command === 'changeReviewCopied') {
        setCheckedAt(Date.now());
        setBusy(false);
        setMessage('Review copied, including limitations and unexecuted checks.');
      }
      if (command === 'changeReviewCancelled') {
        setBusy(false);
        setMessage('Selection cancelled.');
      }
      if (command === 'changeReviewFailed') {
        setError(data.error);
        setBusy(false);
        setStale(true);
      }
    };
    window.addEventListener('message', listener);
    // Returning from the editor invalidates the presentation until an explicit recheck.
    const invalidate = () => setStale(true);
    window.addEventListener('blur', invalidate);
    return () => {
      window.removeEventListener('message', listener);
      window.removeEventListener('blur', invalidate);
    };
  }, []);
  useEffect(() => {
    if (!report) return;
    const timer = window.setTimeout(() => setStale(true), 30_000);
    return () => window.clearTimeout(timer);
  }, [report, checkedAt]);
  return (
    <section className="change-review" aria-label="Review Changes" aria-busy={busy}>
      <header className="change-review__hero">
        <div className="change-review__heading">
          <span className="change-review__mark">
            <GitCompareArrows size={23} aria-hidden="true" />
          </span>
          <div>
            <span className="change-review__eyebrow">LOCAL CHANGE INTELLIGENCE</span>
            <h1>Review your changes.</h1>
          </div>
        </div>
        <p>See what changed, where it may matter, and what to check before handing it over.</p>
        <form
          className="change-review__actions change-review__scope"
          onSubmit={(event) => {
            event.preventDefault();
            if (report) send('refreshChangeReview', { base, reviewId: report.id });
            else send('reviewLocalChanges', { base });
          }}
        >
          <label>
            Compare against
            <input
              value={base}
              maxLength={160}
              disabled={busy}
              onChange={(e) => {
                setBase(e.target.value);
                setStale(true);
              }}
              aria-label="Comparison branch or commit"
              aria-describedby="review-base-help"
            />
          </label>
          <button type="submit" className="ws-btn ws-btn--primary" disabled={busy}>
            {busy ? (
              <Loader2 size={15} className="change-review__spinner" aria-hidden="true" />
            ) : (
              <FolderGit2 size={15} aria-hidden="true" />
            )}
            {busy ? 'Working…' : report ? 'Update comparison' : 'Choose repository'}
          </button>
          {report && (
            <button
              type="button"
              className="ws-btn"
              disabled={busy}
              onClick={() => send('reviewLocalChanges', { base })}
            >
              Change repository
            </button>
          )}
          <small id="review-base-help">
            HEAD = your latest commit.
            <br />
            Or enter a local branch, tag or commit.
          </small>
        </form>
        <div className="change-review__trust">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>Local analysis · no model needed · no project scripts executed</span>
        </div>
        <details className="change-review__requirements">
          <summary>Supported repositories &amp; scope</summary>
          <p>
            Choose the Git root of a Workspai workspace with an existing intelligence snapshot.
            Includes working-tree and untracked files, not only staged changes. CLI evidence reports
            are refreshed. Linked workspaces without matching Git evidence are unsupported.
          </p>
        </details>
      </header>
      {message && (
        <p className="change-review__notice" role="status">
          <Info size={15} aria-hidden="true" />
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="change-review__notice change-review__warning">
          {error}
        </p>
      )}
      {!report && (
        <div className="change-review__empty">
          <div>
            <Files size={22} aria-hidden="true" />
            <span>01 · CHANGES</span>
            <h2>Know the scope</h2>
            <p>Tracked edits and new files, compared against the commit you choose.</p>
          </div>
          <div>
            <Network size={22} aria-hidden="true" />
            <span>02 · IMPACT</span>
            <h2>Follow the evidence</h2>
            <p>CLI-discovered project relationships, with reasons you can inspect.</p>
          </div>
          <div>
            <ListChecks size={22} aria-hidden="true" />
            <span>03 · HANDOFF</span>
            <h2>Make the next step clear</h2>
            <p>A copyable report of suggested checks and what remains unverified.</p>
          </div>
        </div>
      )}
      {report && (
        <>
          <div className="change-review__summary">
            <div>
              <h2>
                <FolderGit2 size={18} aria-hidden="true" />{' '}
                {report.repositoryPath.split(/[\\/]/).pop()}
              </h2>
              <small className="change-review__path">{report.repositoryPath}</small>
              <p>
                {report.files.length} changed paths ·{' '}
                {report.impactAvailable
                  ? `${report.impact.length} CLI impact items`
                  : 'Impact unavailable'}{' '}
                · Tests not run
              </p>
              <small>
                <time dateTime={report.observedAt} title={report.observedAt}>
                  {new Date(report.observedAt).toLocaleString()}
                </time>{' '}
                · Base {report.base.slice(0, 12)} · HEAD {report.head.slice(0, 12)}
              </small>
            </div>
            <strong className="change-review__badge">
              {!scopeMatches
                ? 'Comparison changed · refresh required'
                : stale
                  ? 'Recheck required'
                  : 'Snapshot observed · not verified'}
            </strong>
          </div>
          <div className="change-review__metrics" aria-label="Change summary">
            <div>
              <strong>{report.files.length}</strong>
              <span>
                <Files size={14} aria-hidden="true" /> Changed paths
              </span>
              <small>
                {counts.modified} modified · {counts.added} added · {counts.deleted} deleted ·{' '}
                {counts.untracked} untracked{counts.other ? ` · ${counts.other} other` : ''}
              </small>
            </div>
            <div>
              <strong>{report.impactAvailable ? report.impact.length : '—'}</strong>
              <span>
                <Network size={14} aria-hidden="true" /> CLI impact items
              </span>
              <small>
                {report.impactAvailable
                  ? 'Project-level evidence, not line-level coverage'
                  : 'Unavailable, not zero impact'}
              </small>
            </div>
            <div>
              <strong>{report.checks.length}</strong>
              <span>
                <ListChecks size={14} aria-hidden="true" /> Suggested checks
              </span>
              <small>
                {report.checks.filter((check) => check.required).length} required by CLI · none
                executed
              </small>
            </div>
          </div>
          <div className="change-review__actions">
            <button
              className="ws-btn"
              disabled={busy}
              onClick={() => send('refreshChangeReview', { base, reviewId: report.id })}
            >
              <RefreshCw size={14} aria-hidden="true" /> Refresh review
            </button>
            <button
              className="ws-btn"
              disabled={busy || !scopeMatches}
              onClick={() => send('checkChangeReviewFreshness', { reviewId: report.id })}
            >
              Check for new edits
            </button>
            <button
              className="ws-btn ws-btn--primary"
              disabled={busy || stale || !scopeMatches}
              title={
                stale || !scopeMatches
                  ? 'Refresh or check for new edits before copying this report.'
                  : 'Copy evidence and unexecuted checks for your reviewer or agent.'
              }
              onClick={() => send('copyChangeReview', { reviewId: report.id })}
            >
              <Copy size={14} aria-hidden="true" /> Copy handoff report
            </button>
          </div>
          {(stale || !scopeMatches) && (
            <p className="change-review__next-action">
              {!scopeMatches
                ? 'Update the comparison to use the new branch or commit.'
                : 'Check for new edits to enable handoff. If files changed, refresh the review.'}
            </p>
          )}
          <div className="change-review__grid">
            <section>
              <h2>Changed paths</h2>
              <p>Includes untracked files and working-tree changes, not just the index.</p>
              <label className="change-review__filter">
                <span>
                  <Search size={13} aria-hidden="true" /> Find a changed path
                </span>
                <input
                  type="search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filter paths…"
                />
              </label>
              <small role="status">
                {visibleFiles.length} of {report.files.length} paths
              </small>
              {filter && (
                <button className="ws-btn" onClick={() => setFilter('')}>
                  Clear filter
                </button>
              )}
              <ul className="change-review__files">
                {visibleFiles.map((f) => (
                  <li key={f.path}>
                    <span className="change-review__status" data-status={f.status}>
                      {(
                        {
                          M: 'Modified',
                          A: 'Added',
                          D: 'Deleted',
                          '?': 'Untracked',
                          T: 'Type changed',
                        } as Record<string, string>
                      )[f.status] ?? f.status}
                    </span>
                    <code>{f.path}</code>
                  </li>
                ))}
              </ul>
              {report.files.length > 0 && visibleFiles.length === 0 && (
                <p>No paths match this filter.</p>
              )}
              {!report.files.length && (
                <p>No changed paths against this commit. This is not a health verdict.</p>
              )}
            </section>
            <section>
              <h2>Where the change may reach</h2>
              {!report.impactAvailable && (
                <p>
                  CLI evidence is unavailable or does not cover this comparison. See limitations
                  below.
                </p>
              )}
              {report.impactAvailable && report.impact.length === 0 && (
                <p>
                  The CLI reported no affected surfaces. This does not prove the change has no
                  behavioral impact.
                </p>
              )}
              {report.impact.map((item, index) => (
                <article key={index}>
                  <h3>{item.title}</h3>
                  <small>{item.origin}</small>
                  <p>{item.summary}</p>
                  <details>
                    <summary>Why this is included</summary>
                    <ul>
                      {item.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </details>
                </article>
              ))}
            </section>
          </div>
          <section className="change-review__checks">
            <h2>Suggested checks · not executed</h2>
            <p>
              These are CLI recommendations, not proof that a specific behavior is covered. Commands
              can install dependencies, start services or modify files. Review them before running.
            </p>
            {report.checks.map((check) => (
              <article key={check.id}>
                <h3>
                  {check.label}{' '}
                  <small>{check.required ? 'Required by CLI plan' : 'Optional'}</small>
                </h3>
                <code>{check.command}</code>
                <button
                  className="ws-btn"
                  onClick={() => vscode.postMessage('copyText', { text: check.command })}
                >
                  Copy command
                </button>
              </article>
            ))}
            {!report.checks.length && (
              <p>No verified command plan is available for this comparison.</p>
            )}
          </section>
          <details className="change-review__limits">
            <summary>Evidence boundaries · what this review does not establish</summary>
            <ul>
              {report.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
