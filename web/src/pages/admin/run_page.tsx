import type { ScrapeRunResponse } from '@piu-rivals/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../../api.ts';
import { isActive, RunProgress, runKindLabel, RunStatus } from '../../components/run_status.tsx';
import { formatNumber, formatTime, playerLabel, useLoad } from '../../util.ts';
import { runsTabPath } from './runs_page.tsx';

const POLL_MS = 3000;


function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}


export function RunPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const details = useLoad(() => api<ScrapeRunResponse>('GET', `/admin/scrape-runs/${id}`), [id]);
  const [error, setError] = useState<string | null>(null);
  const run = details.data?.run;
  const active = run ? isActive(run) : false;

  useEffect(() => {
    if (! active)
      return;

    const timer = setInterval(() => void details.reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, details.reload]);

  const cancel = async () => {
    try {
      await api('POST', `/admin/scrape-runs/${id}/cancel`);
      setError(null);
      await details.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (! run) {
    return details.error
      ? <p className="error" role="alert">{details.error}</p>
      : <p className="muted">Loading…</p>;
  }

  const failures = details.data?.failureList  ??  [];
  const { previousRunId, nextRunId } = details.data!;
  // Stopping after the last player would change nothing.
  const onLastPlayer = run.status === 'running'  &&  run.playersTotal > 0  &&  run.playersDone >= run.playersTotal - 1;
  const stepButton = (runId: number | null, label: string) => (
    <button type="button" className="secondary" disabled={! runId} title={runId ? `Run #${runId}` : undefined}
            onClick={() => navigate(`/admin/runs/${runId}`)}>
      {label}
    </button>
  );

  return (
    <section>
      <p><Link to={runsTabPath(active ? 'current' : 'previous')}>← Scraping</Link></p>
      <div className="title-row">
        <h1>Run #{run.id}: {runKindLabel(run)}</h1>
        <div className="buttons">
          {active  &&  ! run.cancelRequested  &&  (
            <button type="button" className="secondary" disabled={onLastPlayer} onClick={() => void cancel()}
                    title={onLastPlayer ? "This is the run's last player; the run ends after it anyway" : undefined}>
              {run.status === 'queued' ? 'Cancel' : 'Stop after current player'}
            </button>
          )}
          {stepButton(previousRunId, '← Previous')}
          {stepButton(nextRunId, 'Next →')}
        </div>
      </div>

      <div className="card">
        <div className="run-head">
          <RunStatus run={run} />
          <RunProgress run={run} />
          {run.currentPlayer  &&  <span>Scraping <strong>{playerLabel(run.currentPlayer)}</strong></span>}
        </div>
        <div className="stats">
          <Stat label="sessions added" value={formatNumber(run.sessionsAdded)} />
          <Stat label="plays added" value={formatNumber(run.playsAdded)} />
          <Stat label="best scores raised" value={formatNumber(run.bestsImproved)} />
          <Stat label="failed players" value={formatNumber(run.failures)} />
        </div>
        <dl className="facts small">
          <dt>Queued</dt><dd>{formatTime(run.createdAt)}{run.startedBy ? ` by ${run.startedBy}` : ''}</dd>
          <dt>Started</dt><dd>{formatTime(run.startedAt)}</dd>
          <dt>Finished</dt><dd>{formatTime(run.finishedAt)}</dd>
          {run.playerIds  &&  <><dt>Players</dt><dd className="ids">{run.playerIds.join(', ')}</dd></>}
        </dl>
      </div>

      {error  &&  <p className="error" role="alert">{error}</p>}

      {failures.length > 0  &&  (
        <>
          <h2>Failures</h2>
          <ul className="failures">
            {failures.map((failure, index) => (
              <li key={index}>
                <span className="muted small">{formatTime(failure.createdAt)}{failure.playerId ? ` · ${failure.playerId}` : ''}</span>
                <div>{failure.message}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
