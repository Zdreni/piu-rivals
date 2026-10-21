import type { ScrapeRunResponse, ScrapeRunsResponse } from '@piu-rivals/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorText } from '../../api.ts';
import { isActive, RunProgress, runKindLabel, RunStatus } from '../../components/run_status.tsx';
import { formatNumber, formatTime, useLoad } from '../../util.ts';

const POLL_MS = 3000;
// Runs per page; "Show older runs" asks the server for this many more.
const PAGE_SIZE = 50;


export function RunsPage() {
  const navigate = useNavigate();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const runs = useLoad(() => api<ScrapeRunsResponse>('GET', `/admin/scrape-runs?limit=${limit}`), [limit]);
  const [error, setError] = useState<string | null>(null);
  const active = runs.data?.runs.some(isActive)  ??  false;

  // Refreshes while a run is queued or running.
  useEffect(() => {
    if (! active)
      return;

    const timer = setInterval(() => void runs.reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, runs.reload]);

  const scrapeAll = async () => {
    try {
      const { run } = await api<ScrapeRunResponse>('POST', '/admin/scrape-runs', { kind: 'all' });
      navigate(`/admin/runs/${run.id}`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <section>
      <div className="title-row">
        <h1>Scrape runs</h1>
        <button type="button" onClick={() => void scrapeAll()}>Scrape all players</button>
      </div>
      <p className="muted">
        The scrape worker runs one run at a time, in order. Start runs for single players from the Players page.
      </p>

      {(error  ??  runs.error)  &&  <p className="error" role="alert">{error  ??  runs.error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Status</th>
              <th>Players</th>
              <th className="number">Sessions</th>
              <th className="number">Plays</th>
              <th className="number">Bests</th>
              <th className="number">Failures</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.data?.runs.map((run) => (
              <tr key={run.id}>
                <td>
                  <Link to={`/admin/runs/${run.id}`}>#{run.id} {runKindLabel(run)}</Link>
                  {run.startedBy  &&  <div className="muted small">{run.startedBy}</div>}
                </td>
                <td><RunStatus run={run} /></td>
                <td><RunProgress run={run} /></td>
                <td className="number">{formatNumber(run.sessionsAdded)}</td>
                <td className="number">{formatNumber(run.playsAdded)}</td>
                <td className="number">{formatNumber(run.bestsImproved)}</td>
                <td className={`number${run.failures ? ' error' : ''}`}>{formatNumber(run.failures)}</td>
                <td className="muted">{formatTime(run.startedAt  ??  run.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {! runs.data  &&  ! runs.error  &&  <p className="muted">Loading…</p>}
      {runs.data  &&  ! runs.data.runs.length  &&  <p className="muted">No scrape runs yet.</p>}
      {runs.data?.hasMore  &&  (
        <p><button type="button" className="secondary" onClick={() => setLimit(limit + PAGE_SIZE)}>Show older runs</button></p>
      )}
    </section>
  );
}
