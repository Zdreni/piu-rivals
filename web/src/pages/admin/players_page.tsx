import type { AdminPlayer, AdminPlayersResponse, ScrapeRunKind, ScrapeRunResponse } from '@piu-rivals/shared';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorText } from '../../api.ts';
import { type Sort, SortHeader, textLength } from '../../components/sort_header.tsx';
import { formatAgo, formatNumber, playerLabel, useLoad } from '../../util.ts';

type SortColumn = 'dbId' | 'name' | 'length' | 'scrapedName' | 'pumbility' | 'charts' | 'plays' | 'lastScrapedAt';

// Missing values (no name, never scraped) go last when sorting up.
const byText = (a: string | null, b: string | null)  =>  Number(a === null) - Number(b === null)  ||  (a  ??  '').localeCompare(b  ??  '');

const byNumber = (a: number | null, b: number | null)  =>  Number(a === null) - Number(b === null)  ||  (a  ??  0) - (b  ??  0);

const compare: Record<SortColumn, (a: AdminPlayer, b: AdminPlayer) => number> = {
  dbId: (a, b)  =>  a.dbId - b.dbId,
  name: (a, b)  =>  byText(a.name, b.name),
  length: (a, b)  =>  textLength(a.name) - textLength(b.name),
  scrapedName: (a, b)  =>  byText(a.scrapedName, b.scrapedName),
  pumbility: (a, b)  =>  byNumber(a.pumbility, b.pumbility),
  charts: (a, b)  =>  a.charts - b.charts,
  plays: (a, b)  =>  a.plays - b.plays,
  lastScrapedAt: (a, b)  =>  byText(a.lastScrapedAt, b.lastScrapedAt),
};


// The name shown on the site, saved when the field loses focus or on Enter; Escape puts the saved one back. An empty
// name is the one on PIU Scores again.
function NameInput({ player, onSave }: { player: AdminPlayer; onSave: (displayName: string | null) => void }) {
  const [name, setName] = useState(player.name  ??  '');
  useEffect(()  =>  setName(player.name  ??  ''), [player.name]);

  const save = ()  => {
    const trimmedName = name.trim();
    if (trimmedName !== (player.name  ??  ''))
      onSave(trimmedName  ||  null);
    else
      setName(trimmedName);
  };

  return (
    <input
      type="text"
      maxLength={100}
      value={name}
      placeholder={player.scrapedName  ??  'Not scraped yet'}
      aria-label={`Name of ${playerLabel(player)}`}
      onChange={(event)  =>  setName(event.target.value)}
      onBlur={save}
      onKeyDown={(event)  => {
        if (event.key === 'Enter')
          event.currentTarget.blur();
        else if (event.key === 'Escape')
          setName(player.name  ??  '');
      }}
    />
  );
}


function RegisterForm({ onError }: { onError: (error: string | null) => void }) {
  const navigate = useNavigate();
  const [links, setLinks] = useState('');

  const submit = async (event: FormEvent)  => {
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
    <form className="card" onSubmit={(event)  =>  void submit(event)}>
      <h2>Register players</h2>
      <p className="muted small">
        PIU Scores player links or GUIDs, one per line, e.g. https://piuscores.arroweclip.se/Player/&lt;GUID&gt;/Sessions.
        They're added and their full Phoenix 2 history is scraped.
      </p>
      <textarea rows={3} required value={links} onChange={(event)  =>  setLinks(event.target.value)} aria-label="Player links" />
      <button type="submit">Register and scrape</button>
    </form>
  );
}


export function PlayersPage() {
  const navigate = useNavigate();
  const players = useLoad(()  =>  api<AdminPlayersResponse>('GET', '/admin/players'), []);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort<SortColumn>>({ column: 'name', descending: false });

  const startRun = async (kind: ScrapeRunKind, playerIds?: string[])  => {
    if (kind === 'rescan'  &&  ! confirm(`Rescan ${playerIds?.length} player(s)? Their stored plays are deleted and their whole history is scraped again.`))
      return;

    try {
      const { run } = await api<ScrapeRunResponse>('POST', '/admin/scrape-runs', { kind, players: playerIds });
      navigate(`/admin/runs/${run.id}`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const remove = async (player: AdminPlayer)  => {
    if (! confirm(`Delete ${playerLabel(player)} with all their scores? Users and rival lists lose them too.`))
      return;

    try {
      await api('DELETE', `/admin/players/${player.id}`);
      selectedPlayerIds.delete(player.id);
      setSelectedPlayerIds(new Set(selectedPlayerIds));
      setError(null);
      await players.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const rename = async (player: AdminPlayer, displayName: string | null)  => {
    try {
      await api('PATCH', `/admin/players/${player.id}`, { displayName });
      setError(null);
    } catch (e) {
      setError(`${playerLabel(player)}: ${errorText(e)}`);
    }

    await players.reload();
  };

  const toggle = (playerId: string)  => {
    const nextSelectedIds = new Set(selectedPlayerIds);
    if (nextSelectedIds.has(playerId))
      nextSelectedIds.delete(playerId);
    else
      nextSelectedIds.add(playerId);

    setSelectedPlayerIds(nextSelectedIds);
  };

  const sortedPlayers = useMemo(()  => {
    const sign = (sort.descending  ?  -1  :  1);
    // Ties go by name.
    return [...players.data?.players  ??  []].sort((a, b)  =>  sign * compare[sort.column](a, b)  ||  compare.name(a, b));
  }, [players.data, sort]);

  const chosenPlayerIds = [...selectedPlayerIds];
  const sortProps = { sort, onSort: setSort };
  return (
    <section>
      <div className="title-row">
        <h1>Players</h1>
      </div>
      <p className="muted">
        PIU Scores players whose sessions are scraped. "Scrape" opens only sessions newer than the last scraped one;
        "Rescan" deletes a player's plays and scrapes their whole history again. The site shows a player by their name
        here; leave it empty to use their name on PIU Scores.
      </p>

      <RegisterForm onError={setError} />

      {(error  ??  players.error)  &&  <p className="error" role="alert">{error  ??  players.error}</p>}

      <div className="title-row">
        <span className="muted">{sortedPlayers.length} player{sortedPlayers.length === 1  ?  ''  :  's'}{chosenPlayerIds.length  ?  `, ${chosenPlayerIds.length} selected`  :  ''}</span>
        <div className="buttons">
          <button type="button" disabled={! chosenPlayerIds.length} onClick={()  =>  void startRun('selected', chosenPlayerIds)}>Scrape selected</button>
          <button type="button" className="secondary" disabled={! chosenPlayerIds.length} onClick={()  =>  void startRun('rescan', chosenPlayerIds)}>
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
                  checked={sortedPlayers.length > 0  &&  chosenPlayerIds.length === sortedPlayers.length}
                  onChange={(event)  =>  setSelectedPlayerIds(new Set((event.target.checked  ?  sortedPlayers.map((p)  =>  p.id)  :  [])))}
                />
              </th>
              <SortHeader column="dbId" label="ID" className="number" {...sortProps} />
              <SortHeader column="name" label="Name" {...sortProps} />
              <SortHeader column="length" label="Length" className="number" {...sortProps} />
              <SortHeader column="scrapedName" label="On PIU Scores" {...sortProps} />
              <SortHeader column="pumbility" label="PUMBILITY" className="number" {...sortProps} />
              <SortHeader column="charts" label="Charts" className="number" {...sortProps} />
              <SortHeader column="plays" label="Plays" className="number" {...sortProps} />
              <SortHeader column="lastScrapedAt" label="Last scraped" {...sortProps} />
              <th>Latest session</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player)  =>  (
              <tr key={player.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedPlayerIds.has(player.id)}
                    onChange={()  =>  toggle(player.id)}
                    aria-label={`Select ${playerLabel(player)}`}
                  />
                </td>
                <td className="number muted">{player.dbId}</td>
                <td><NameInput player={player} onSave={(displayName)  =>  void rename(player, displayName)} /></td>
                <td className="number">{textLength(player.name)}</td>
                <td>
                  <a href={`https://piuscores.arroweclip.se/Player/${player.id}/Sessions`} target="_blank" rel="noreferrer">
                    {player.scrapedName  ||  player.id}
                  </a>
                </td>
                <td className="number">{formatNumber(player.pumbility)}</td>
                <td className="number">{formatNumber(player.charts)}</td>
                <td className="number">{formatNumber(player.plays)}</td>
                <td className="muted">{formatAgo(player.lastScrapedAt)}</td>
                <td className="muted">{player.lastSessionTimestamp  ??  '—'}</td>
                <td><button type="button" className="danger small-button" onClick={()  =>  void remove(player)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {! players.data  &&  ! players.error  &&  <p className="muted">Loading…</p>}
      {players.data  &&  ! sortedPlayers.length  &&  <p className="muted">No players yet: register some above.</p>}
    </section>
  );
}
