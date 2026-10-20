import type { AdminPlayer, AdminPlayersResponse, ImportPlayersResponse, ScrapeRunKind, ScrapeRunResponse } from '@piu-rivals/shared';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorText } from '../../api.ts';
import { formatAgo, formatNumber, playerLabel, useLoad } from '../../util.ts';

// The console command that copies the old extension's players, shown for the import.
const EXPORT_COMMAND = "chrome.storage.local.get('players').then(({ players }) => copy(JSON.stringify(players)));";


function RegisterForm({ onError }: { onError: (error: string | null) => void }) {
  const navigate = useNavigate();
  const [links, setLinks] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const players = links.split(/\s+/).filter(Boolean);
    try {
      const { run } = await api<ScrapeRunResponse>('POST', '/admin/scrape-runs', { kind: 'register', players });
      onError(null);
      navigate(`/admin/runs/${run.id}`);
    } catch (e) {
      onError(errorText(e));
    }
  };

  return (
    <form className="card" onSubmit={(event) => void submit(event)}>
      <h2>Register players</h2>
      <p className="muted small">
        PIU Scores player links or GUIDs, one per line, e.g. https://piuscores.arroweclip.se/Player/&lt;GUID&gt;/Sessions.
        They're added and their full Phoenix 2 history is scraped.
      </p>
      <textarea rows={3} required value={links} onChange={(event) => setLinks(event.target.value)} aria-label="Player links" />
      <button type="submit">Register and scrape</button>
    </form>
  );
}


function ImportForm({ onDone, onError }: { onDone: () => void; onError: (error: string | null) => void }) {
  const [json, setJson] = useState('');
  const [result, setResult] = useState<ImportPlayersResponse | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let body: unknown;
    try {
      body = JSON.parse(json);
    } catch {
      onError("That isn't valid JSON");
      return;
    }

    try {
      setResult(await api<ImportPlayersResponse>('POST', '/admin/players/import', body));
      setJson('');
      onError(null);
      onDone();
    } catch (e) {
      onError(errorText(e));
    }
  };

  return (
    <details className="card">
      <summary>Import players from the old extension</summary>
      <p className="muted small">
        On piuscores.arroweclip.se, open DevTools, pick the "PIU Scores Scraper" extension in the console's context
        dropdown, run the command below, and paste the result here. Only players are imported (GUID, name,
        PUMBILITY); their scores come from scraping.
      </p>
      <code className="block">{EXPORT_COMMAND}</code>
      <form onSubmit={(event) => void submit(event)}>
        <textarea rows={4} required value={json} onChange={(event) => setJson(event.target.value)} aria-label="Exported players JSON" />
        <button type="submit">Import</button>
        {result  &&  <span className="muted"> Added {result.added}, already stored {result.existing}.</span>}
      </form>
    </details>
  );
}


export function PlayersPage() {
  const navigate = useNavigate();
  const players = useLoad(() => api<AdminPlayersResponse>('GET', '/admin/players'), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const startRun = async (kind: ScrapeRunKind, playerIds?: string[]) => {
    if (kind === 'rescan'  &&  ! confirm(`Rescan ${playerIds?.length} player(s)? Their stored plays are deleted and their whole history is scraped again.`))
      return;

    try {
      const { run } = await api<ScrapeRunResponse>('POST', '/admin/scrape-runs', { kind, players: playerIds });
      navigate(`/admin/runs/${run.id}`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const remove = async (player: AdminPlayer) => {
    if (! confirm(`Delete ${playerLabel(player)} with all their scores? Users and rival lists lose them too.`))
      return;

    try {
      await api('DELETE', `/admin/players/${player.id}`);
      selected.delete(player.id);
      setSelected(new Set(selected));
      setError(null);
      await players.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const toggle = (playerId: string) => {
    const next = new Set(selected);
    if (next.has(playerId))
      next.delete(playerId);
    else
      next.add(playerId);

    setSelected(next);
  };

  const list = players.data?.players  ??  [];
  const chosen = [...selected];
  return (
    <section>
      <div className="title-row">
        <h1>Players</h1>
        <button type="button" onClick={() => void startRun('all')}>Scrape all players</button>
      </div>
      <p className="muted">
        PIU Scores players whose sessions are scraped. "Scrape" opens only sessions newer than the last scraped one;
        "Rescan" deletes a player's plays and scrapes their whole history again.
      </p>

      <RegisterForm onError={setError} />
      <ImportForm onDone={() => void players.reload()} onError={setError} />

      {(error  ??  players.error)  &&  <p className="error" role="alert">{error  ??  players.error}</p>}

      <div className="title-row">
        <span className="muted">{list.length} player{list.length === 1 ? '' : 's'}{chosen.length ? `, ${chosen.length} selected` : ''}</span>
        <div className="buttons">
          <button type="button" disabled={! chosen.length} onClick={() => void startRun('selected', chosen)}>Scrape selected</button>
          <button type="button" className="secondary" disabled={! chosen.length} onClick={() => void startRun('rescan', chosen)}>
            Rescan selected
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={list.length > 0  &&  chosen.length === list.length}
                  onChange={(event) => setSelected(new Set(event.target.checked ? list.map((p) => p.id) : []))}
                />
              </th>
              <th>Player</th>
              <th className="number">PUMBILITY</th>
              <th className="number">Charts</th>
              <th className="number">Plays</th>
              <th>Last scraped</th>
              <th>Latest session</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((player) => (
              <tr key={player.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(player.id)}
                    onChange={() => toggle(player.id)}
                    aria-label={`Select ${playerLabel(player)}`}
                  />
                </td>
                <td>
                  <a href={`https://piuscores.arroweclip.se/Player/${player.id}/Sessions`} target="_blank" rel="noreferrer">
                    {playerLabel(player)}
                  </a>
                </td>
                <td className="number">{formatNumber(player.pumbility)}</td>
                <td className="number">{formatNumber(player.charts)}</td>
                <td className="number">{formatNumber(player.plays)}</td>
                <td className="muted">{formatAgo(player.lastScrapedAt)}</td>
                <td className="muted">{player.lastSessionTimestamp  ??  '—'}</td>
                <td><button type="button" className="danger small-button" onClick={() => void remove(player)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {! players.data  &&  ! players.error  &&  <p className="muted">Loading…</p>}
      {players.data  &&  ! list.length  &&  <p className="muted">No players yet: register some above, or import them from the old extension.</p>}
    </section>
  );
}
