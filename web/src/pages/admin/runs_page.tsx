import type { ScrapeRun, ScrapeRunResponse, ScrapeRunsResponse } from '@piu-rivals/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorText } from '../../api.ts';
import { RunProgress, runKindLabel, RunStatus } from '../../components/run_status.tsx';
import { formatAgo, formatDuration, formatNumber, formatTime, useLoad } from '../../util.ts';

const POLL_MS = 3000;
// Refresh of the current runs while none is active, so a scheduled run shows when it's queued.
const IDLE_POLL_MS = 15000;
// Runs listed on each side of the running one at first; the others are folded.
const LISTED_RUN_COUNTS = { queued: 5, finished: 5 };
// Runs each Show more button unfolds.
const UNFOLDED_RUN_COUNT = 10;
const COLUMN_COUNT = 9;


// "4 min", "1 h 05 min": how long ago `iso` was, for a run still going.
function formatMinutesSince(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  return (minutes < 60  ?  `${minutes} min`  :  `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`);
}


// A run's count; zeros are dimmed, and `alert` colours the rest as errors.
function StatCell({ value, alert = false }: { value: number; alert?: boolean }) {
  return <td className={`number${(value  ?  (alert  ?  ' error'  :  '')  :  ' muted')}`}>{formatNumber(value)}</td>;
}


// A row across the table that unfolds more of the `foldedRunCount` runs on its side.
function FoldRow({ foldedRunCount, onUnfold }: { foldedRunCount: number; onUnfold: ()  =>  void }) {
  return (
    <tr className="fold-row">
      <td colSpan={COLUMN_COUNT}>
        <button type="button" className="secondary" onClick={onUnfold}>
          Show {Math.min(UNFOLDED_RUN_COUNT, foldedRunCount)}/{foldedRunCount} more
        </button>
      </td>
    </tr>
  );
}


function RunRow({ run }: { run: ScrapeRun }) {
  return (
    <tr className={(run.status === 'running'  ?  'running-run'  :  undefined)}>
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
      <td className="number muted">{formatDuration(run.startedAt, run.finishedAt)}</td>
    </tr>
  );
}


// All runs, newest first: the queued ones (the next to run last), the running one, the finished ones.
//  The queued and finished ones beyond those listed are folded.
function RunsTable({ queuedRuns, runningRuns, finishedRuns, foldedQueuedRunCount, foldedFinishedRunCount, onUnfoldQueued, onUnfoldFinished }: {
  queuedRuns: ScrapeRun[];
  runningRuns: ScrapeRun[];
  finishedRuns: ScrapeRun[];
  foldedQueuedRunCount: number;
  foldedFinishedRunCount: number;
  onUnfoldQueued: ()  =>  void;
  onUnfoldFinished: ()  =>  void;
}) {
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
            <th className="number">Duration</th>
          </tr>
        </thead>
        <tbody>
          {foldedQueuedRunCount > 0  &&  <FoldRow foldedRunCount={foldedQueuedRunCount} onUnfold={onUnfoldQueued} />}
          {[...queuedRuns, ...runningRuns, ...finishedRuns].map((run)  =>  <RunRow key={run.id} run={run} />)}
          {foldedFinishedRunCount > 0  &&  <FoldRow foldedRunCount={foldedFinishedRunCount} onUnfold={onUnfoldFinished} />}
        </tbody>
      </table>
    </div>
  );
}


export function RunsPage() {
  const navigate = useNavigate();
  const [listedQueuedRunCount, setListedQueuedRunCount] = useState(LISTED_RUN_COUNTS.queued);
  const [listedFinishedRunCount, setListedFinishedRunCount] = useState(LISTED_RUN_COUNTS.finished);
  const currentRuns = useLoad(()  =>  api<ScrapeRunsResponse>('GET', '/admin/scrape-runs?state=current'), []);
  const previousRuns = useLoad(()  =>  api<ScrapeRunsResponse>('GET', `/admin/scrape-runs?state=previous&limit=${listedFinishedRunCount}`),
    [listedFinishedRunCount]);
  const [error, setError] = useState<string | null>(null);
  const active = !! currentRuns.data?.runs.length;

  // Refreshes both lists while a run is queued or running: finished runs move from one to the other.
  // While none is, refreshes only the current runs, less often.
  useEffect(()  => {
    if (! active) {
      const timer = setInterval(()  =>  void currentRuns.reload(), IDLE_POLL_MS);
      return ()  =>  clearInterval(timer);
    }

    const timer = setInterval(()  => {
      void currentRuns.reload();
      void previousRuns.reload();
    }, POLL_MS);

    return ()  =>  clearInterval(timer);
  }, [active, currentRuns.reload, previousRuns.reload]);

  // A running "all" or scheduled run shows over a queued one; either disables the button.
  const allRuns = currentRuns.data?.runs.filter((r)  =>  r.kind === 'all'  ||  r.kind === 'scheduled')  ??  [];
  const runningAll = allRuns.find((r)  =>  r.status === 'running');
  const queuedAll = allRuns.find((r)  =>  r.status === 'queued');
  const scrapeAllLabel = (runningAll
    ?  `Running for ${formatMinutesSince(runningAll.startedAt  ??  runningAll.createdAt)}`
    :  queuedAll  ?  `Queued ${formatAgo(queuedAll.createdAt)}`  :  'Scrape all players');

  const scrapeAll = async ()  => {
    try {
      const { run } = await api<ScrapeRunResponse>('POST', '/admin/scrape-runs', { kind: 'all' });
      navigate(`/admin/runs/${run.id}`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  // The current runs come in the order the worker takes them.
  const activeRuns = currentRuns.data?.runs  ??  [];
  const queuedRuns = activeRuns.filter((r)  =>  r.status === 'queued');
  const finishedRuns = previousRuns.data?.runs  ??  [];
  const loadError = currentRuns.error  ??  previousRuns.error;
  const isLoading = (! currentRuns.data  ||  ! previousRuns.data)  &&  ! loadError;
  const hasRuns = activeRuns.length > 0  ||  finishedRuns.length > 0;

  return (
    <section>
      <div className="title-row">
        <h1>Scraping</h1>
        <div className="scrape-all">
          <button type="button" disabled={!! (runningAll  ||  queuedAll)} onClick={()  =>  void scrapeAll()}>{scrapeAllLabel}</button>
          {currentRuns.data  &&  <div className="muted small">{runningAll  ?  'Previous'  :  'Last'} run {formatAgo(currentRuns.data.lastAllRunAt)}</div>}
        </div>
      </div>
      <p className="muted">
        The scrape worker runs one run at a time, in order. Start runs for single players from the Players page.
      </p>

      {(error  ??  loadError)  &&  <p className="error" role="alert">{error  ??  loadError}</p>}
      {isLoading  &&  <p className="muted">Loading…</p>}
      {! isLoading  &&  ! hasRuns  &&  <p className="muted">No runs yet.</p>}
      {! isLoading  &&  hasRuns  &&  (
        <RunsTable
          queuedRuns={queuedRuns.slice(0, listedQueuedRunCount).reverse()}
          runningRuns={activeRuns.filter((r)  =>  r.status === 'running')}
          finishedRuns={finishedRuns}
          foldedQueuedRunCount={Math.max(0, queuedRuns.length - listedQueuedRunCount)}
          foldedFinishedRunCount={Math.max(0, (previousRuns.data?.total  ??  0) - finishedRuns.length)}
          onUnfoldQueued={()  =>  setListedQueuedRunCount(listedQueuedRunCount + UNFOLDED_RUN_COUNT)}
          onUnfoldFinished={()  =>  setListedFinishedRunCount(listedFinishedRunCount + UNFOLDED_RUN_COUNT)}
        />
      )}
    </section>
  );
}
