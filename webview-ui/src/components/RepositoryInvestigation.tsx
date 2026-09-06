import { useEffect, useRef, useState } from 'react';
import { vscode } from '@/vscode';
import type { RepositoryAnalysisReport } from '@workspai-contracts/repositoryAnalysis';

type SearchResult = {
  totalMatches: number;
  truncated: boolean;
  graphSourceHash?: string;
  entities: Array<{ id: string; label: string; kind: string; proofIds: string[] }>;
  relatedEntities: Array<{ id: string; label: string }>;
  relations: Array<{ id: string; from: string; to: string; kind: string }>;
  proofs: Array<{
    id: string;
    artifact: string;
    line?: number;
    detail?: string;
    trust?: string;
    derivation?: string;
  }>;
};

export function RepositoryInvestigation({
  report,
  seed,
}: {
  report: RepositoryAnalysisReport;
  seed?: { query: string; id: number };
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState('');
  const request = useRef('');
  const pending = useRef(false);
  const search = (question: string) => {
    if (!question.trim() || pending.current) return;
    setQuery(question);
    setSearched(question);
    setResult(null);
    setError('');
    setBusy(true);
    pending.current = true;
    request.current = crypto.randomUUID();
    vscode.postMessage('searchRepositoryAnalysis', {
      analysisId: report.requestId,
      requestId: request.current,
      query: question,
    });
  };
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const { command, data } = event.data ?? {};
      if (data?.requestId !== request.current) return;
      if (command === 'repositorySearchCompleted') {
        setResult(data.result);
        setSelected(data.result.entities[0]?.id ?? '');
        setBusy(false);
        pending.current = false;
      }
      if (command === 'repositorySearchFailed') {
        setError(data.error);
        setBusy(false);
        pending.current = false;
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  useEffect(() => {
    if (!seed) return;
    search(seed.query);
    document.getElementById('repository-investigation')?.scrollIntoView({ block: 'start' });
    // A seeded action is an explicit user request, not a rerender-triggered search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);
  const entity = result?.entities.find((item) => item.id === selected);
  const proofs = result?.proofs.filter((proof) => entity?.proofIds.includes(proof.id)) ?? [];
  const relations =
    result?.relations.filter(
      (relation) => relation.from === selected || relation.to === selected
    ) ?? [];
  const labels = new Map(
    [...(result?.entities ?? []), ...(result?.relatedEntities ?? [])].map((item) => [
      item.id,
      item.label,
    ])
  );
  return (
    <section
      id="repository-investigation"
      className="repo-investigation"
      aria-label="Investigate repository evidence"
    >
      <header>
        <span>FROM QUESTION TO SOURCE</span>
        <h3>Find your starting point.</h3>
        <p>
          Search the full captured Graph, select a result, and inspect its evidence. No model or
          project code is executed.
        </p>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          search(query);
        }}
      >
        <label htmlFor="investigation-query">What do you want to understand or change?</label>
        <div>
          <input
            id="investigation-query"
            value={query}
            maxLength={500}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Authentication entry points, request routing, CI…"
          />
          <button className="ws-btn ws-btn--primary" disabled={busy || !query.trim()}>
            {busy ? 'Searching evidence…' : 'Find evidence'}
          </button>
        </div>
      </form>
      <div className="repo-investigation__suggestions">
        {report.questions.map((question) => (
          <button
            key={question}
            className="ws-btn"
            disabled={busy}
            onClick={() => search(question)}
          >
            {question}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p role="status">
            {result.entities.length} results shown of {result.totalMatches} matches for “{searched}
            ”. {result.truncated ? 'Results are bounded; refine your question to narrow them.' : ''}
          </p>
          {!result.entities.length && (
            <p>
              No indexed match. Try an exact file, component or capability name. This is not proof
              that the capability is absent.
            </p>
          )}
          {entity && (
            <div className="repo-investigation__grid">
              <nav aria-label="Search results">
                {result.entities.map((item) => (
                  <button
                    key={item.id}
                    aria-pressed={selected === item.id}
                    onClick={() => setSelected(item.id)}
                  >
                    <small>{item.kind}</small>
                    <strong>{item.label}</strong>
                    <span>{item.proofIds.length} proof references</span>
                  </button>
                ))}
              </nav>
              <article>
                <h4>{entity.label}</h4>
                <p>Indexed evidence, not a guarantee of complete runtime behavior.</p>
                <h4>Connected surfaces</h4>
                <ul>
                  {relations.map((relation) => (
                    <li key={relation.id}>
                      {labels.get(relation.from) ?? relation.from} <b> {relation.kind} </b>{' '}
                      {labels.get(relation.to) ?? relation.to}
                    </li>
                  ))}
                </ul>
                {!relations.length && (
                  <p>No connecting relations returned in this bounded result.</p>
                )}
                <h4>Inspect the source</h4>
                {proofs.map((proof) => (
                  <div className="repo-investigation__proof" key={proof.id}>
                    <code>
                      {proof.artifact}
                      {proof.line ? `:${proof.line}` : ''}
                    </code>
                    <p>{proof.detail}</p>
                    <small>
                      {proof.derivation ?? 'Unspecified derivation'} ·{' '}
                      {proof.trust ?? 'Unspecified trust'}
                    </small>
                    <button
                      className="ws-btn"
                      onClick={() => {
                        request.current = crypto.randomUUID();
                        vscode.postMessage('openRepositorySearchProof', {
                          requestId: request.current,
                          analysisId: report.requestId,
                          proofId: proof.id,
                        });
                      }}
                    >
                      Open source evidence
                    </button>
                  </div>
                ))}
                {!proofs.length && (
                  <p>
                    No source proof was returned for this result. Do not treat it as verified source
                    coverage.
                  </p>
                )}
                <small>
                  Evidence belongs to commit {report.repository.commit.slice(0, 12)}. Opening a file
                  does not run a verification or repair.
                </small>
              </article>
            </div>
          )}
        </>
      )}
    </section>
  );
}
