import type { ScrapeRunPlayer, ScrapeRunPlayerState, ScrapeRunResponse } from '@piu-rivals/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../../api.ts';
import { isActive, RunProgress, runKindLabel, RunStatus } from '../../components/run_status.tsx';
import { formatNumber, formatTime, playerLabel, useLoad } from '../../util.ts';
import { runsTabPath } from './runs_page.tsx';

const POLL_MS = 3000;
// Only the players this close to the current one are listed (failed ones always are); the rest hide behind buttons.
const PLAYERS_AROUND = 10;


const PLAYER_STATES: Record<ScrapeRunPlayerState, { mark: string; title: string }> = {
  waiting: { mark: '⧗', title: 'Waiting' },
  running: { mark: '▶', title: 'Scraping now' },
  done: { mark: '✓', title: 'Scraped' },
  failed: { mark: '✗', title: 'Failed' },
  skipped: { mark: '–', title: 'Not scraped: the run stopped first' },
};


function RunPlayer({ player }: { player: ScrapeRunPlayer }) {
  const { mark, title } = PLAYER_STATES[player.state];
  const sessions = (
    <a href={`https://piuscores.arroweclip.se/Player/${encodeURIComponent(player.id)}/Sessions`} target="_blank" rel="noreferrer">
      {player.id}
    </a>
  );
  return (
    <li>
      <span className={`player-mark player-${player.state}`} title={title} aria-label={title}>{mark}</span>
      {player.name
        ? <span>{player.name} <span className="muted">({sessions})</span></span>
        : <span>{sessions}</span>}
    </li>
  );
}


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
  const [allBeforeShown, setAllBeforeShown] = useState(false);
  const [allAfterShown, setAllAfterShown] = useState(false);
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

  const players = details.data?.players  ??  [];
  // The worker takes the players in order: the first playersDone are finished, the next one is current.
  const current = Math.min(run.playersDone, players.length);
  const hidden = (player: ScrapeRunPlayer, index: number) => player.state !== 'failed'  &&  (index < current
    ? ! allBeforeShown  &&  index < current - PLAYERS_AROUND
    : ! allAfterShown  &&  index > current + PLAYERS_AROUND);
  const shownPlayers = players.filter((player, index) => ! hidden(player, index));
  const hiddenBefore = players.filter((player, index) => index < current  &&  hidden(player, index)).length;
  const hiddenAfter = players.length - shownPlayers.length - hiddenBefore;
  const showButton = (count: number, label: string, onClick: () => void) => count > 0  &&  (
    <button type="button" className="secondary small-button" onClick={onClick}>
      …show {label} {formatNumber(count)}…
    </button>
  );
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
        </dl>
      </div>

      {error  &&  <p className="error" role="alert">{error}</p>}

      {players.length > 0  &&  (
        <>
          <h2>Players</h2>
          {showButton(hiddenBefore, 'previous', () => setAllBeforeShown(true))}
          <ul className="run-players">
            {shownPlayers.map((player) => <RunPlayer key={player.id} player={player} />)}
          </ul>
          {showButton(hiddenAfter, 'next', () => setAllAfterShown(true))}
        </>
      )}

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
