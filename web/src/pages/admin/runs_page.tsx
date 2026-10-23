import type { ScrapeRun, ScrapeRunResponse, ScrapeRunsResponse } from '@piu-rivals/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorText } from '../../api.ts';
import { RunProgress, runKindLabel, RunStatus } from '../../components/run_status.tsx';
import { formatAgo, formatDuration, formatNumber, formatTime, useLoad } from '../../util.ts';

const POLL_MS = 3000;
// Finished runs per page; "Show older runs" asks the server for this many more.
const PAGE_SIZE = 50;

// Current: queued and running runs, in the order the worker takes them. Previous: finished ones, newest first.
export type RunsTab = 'current' | 'previous';


// The run list's address with a tab open; Current is the default.
export const runsTabPath = (tab: RunsTab) => (tab === 'previous' ? '/admin/runs?tab=previous' : '/admin/runs');


// A run's count; zeros are dimmed, and `alert` colours the rest as errors.
function StatCell({ value, alert = false }: { value: number; alert?: boolean }) {
  return <td className={`number${value ? (alert ? ' error' : '') : ' muted'}`}>{formatNumber(value)}</td>;
}


// Finished runs also show how long they ran.
function RunsTable({ runs, finished }: { runs: ScrapeRun[]; finished: boolean }) {
  return (
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
            {finished  &&  <th className="number">Duration</th>}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>
                <Link to={`/admin/runs/${run.id}`}>#{run.id} {runKindLabel(run)}</Link>
                {run.startedBy  &&  <div className="muted small">{run.startedBy}</div>}
              </td>
              <td><RunStatus run={run} /></td>
              <td><RunProgress run={run} /></td>
              <StatCell value={run.sessionsAdded} />
              <StatCell value={run.playsAdded} />
              <StatCell value={run.bestsImproved} />
              <StatCell value={run.failures} alert />
              <td className="muted">{formatTime(run.startedAt  ??  run.createdAt, { withoutYear: true })}</td>
              {finished  &&  <td className="number muted">{formatDuration(run.startedAt, run.finishedAt)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


export function RunsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: RunsTab = searchParams.get('tab') === 'previous' ? 'previous' : 'current';
  const [limit, setLimit] = useState(PAGE_SIZE);
  const current = useLoad(() => api<ScrapeRunsResponse>('GET', '/admin/scrape-runs?state=current'), []);
  const previous = useLoad(() => api<ScrapeRunsResponse>('GET', `/admin/scrape-runs?state=previous&limit=${limit}`), [limit]);
  const [error, setError] = useState<string | null>(null);
  const active = !! current.data?.runs.length;

  // Refreshes both lists while a run is queued or running: finished runs move from Current to Previous.
  useEffect(() => {
    if (! active)
      return;

    const timer = setInterval(() => {
      void current.reload();
      void previous.reload();
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [active, current.reload, previous.reload]);

  const scrapeAll = async () => {
    try {
      const { run } = await api<ScrapeRunResponse>('POST', '/admin/scrape-runs', { kind: 'all' });
      navigate(`/admin/runs/${run.id}`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const shown = tab === 'current' ? current : previous;
  const tabButton = (id: RunsTab, label: string, count?: number) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setSearchParams(id === 'previous' ? { tab: id } : {})}>
      {label}{count !== undefined  &&  <span className="tab-count"> {count}</span>}
    </button>
  );

  return (
    <section>
      <div className="title-row">
        <h1>Scraping</h1>
        <div className="scrape-all">
          <button type="button" onClick={() => void scrapeAll()}>Scrape all players</button>
          {current.data  &&  <div className="muted small">Last run {formatAgo(current.data.lastAllRunAt)}</div>}
        </div>
      </div>
      <p className="muted">
        The scrape worker runs one run at a time, in order. Start runs for single players from the Players page.
      </p>

      {(error  ??  shown.error)  &&  <p className="error" role="alert">{error  ??  shown.error}</p>}

      <div className="page-tabs" role="tablist" aria-label="Scraping">
        {tabButton('current', 'Current', current.data?.runs.length)}
        {tabButton('previous', 'Previous', previous.data?.total)}
      </div>

      <div role="tabpanel">
        {shown.data  &&  shown.data.runs.length > 0  &&  <RunsTable runs={shown.data.runs} finished={tab === 'previous'} />}
        {! shown.data  &&  ! shown.error  &&  <p className="muted">Loading…</p>}
        {shown.data  &&  ! shown.data.runs.length  &&  (
          <p className="muted">{tab === 'current' ? 'Nothing is queued or running.' : 'No finished runs yet.'}</p>
        )}
        {tab === 'previous'  &&  previous.data?.hasMore  &&  (
          <p><button type="button" className="secondary" onClick={() => setLimit(limit + PAGE_SIZE)}>Show older runs</button></p>
        )}
      </div>
    </section>
  );
}
