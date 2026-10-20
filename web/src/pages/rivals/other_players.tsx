import type { PlayerSummary, PlayersResponse } from '@piu-rivals/shared';
import { useEffect, useState } from 'react';
import { api, errorText } from '../../api.ts';
import { formatNumber } from '../../util.ts';
import { displayName } from './model.ts';

let playersLoad: Promise<PlayerSummary[]> | null = null;


// All players, loaded once per page load.
function loadPlayers(): Promise<PlayerSummary[]> {
  playersLoad  ??=  api<PlayersResponse>('GET', '/players').then(({ players }) => players, (error) => {
    playersLoad = null;
    throw error;
  });

  return playersLoad;
}


// All registered players, or null while loading; `error` when they couldn't be loaded.
export function usePlayers() {
  const [players, setPlayers] = useState<PlayerSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlayers().then(setPlayers, (e) => setError(errorText(e)));
  }, []);

  return { players, error };
}


// The Others tab: every registered player that isn't your rival, by PUMBILITY, each with a button to add them as
// a rival. You're listed among them too, to compare with, and stay listed whatever the name filter. `players` are
// all registered players (null while loading), `rivals` your current rivals' ids.
export function OtherPlayers({ me, players, error, rivals, onAdd }: {
  me: PlayerSummary;
  players: PlayerSummary[] | null;
  error: string | null;
  rivals: Set<string>;
  onAdd: (player: PlayerSummary) => void;
}) {
  const [query, setQuery] = useState('');

  const words = query.trim().toLowerCase();
  const others = [me, ...(players  ??  []).filter((player) => player.id !== me.id)]
    .filter((player) => player.id === me.id
      ||  (! rivals.has(player.id)  &&  (! words  ||  (player.name  ??  player.id).toLowerCase().includes(words))))
    .sort((a, b) => (b.pumbility  ??  -1) - (a.pumbility  ??  -1)
      ||  (a.name  ??  a.id).localeCompare(b.name  ??  b.id, undefined, { sensitivity: 'base' }));

  return (
    <>
      <div className="rival-add">
        <input
          type="search"
          placeholder="Find a player…"
          aria-label="Find a player by name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape'  &&  setQuery('')}
        />
      </div>
      <div className="rival-scroll">
        {error  &&  <div className="rival-hint error">{error}</div>}
        {! error  &&  ! players  &&  <div className="muted rival-hint">Loading players…</div>}
        {players  &&  others.length === 1  &&  (
          <div className="muted rival-hint">{words ? 'No such player. An admin can register them.' : 'No other players.'}</div>
        )}
        {others.map((player) => (
          <div key={player.id} className={player.id === me.id ? 'rival other me' : 'rival other'}>
            <div className="rival-toggle" title={player.name  ??  player.id}>
              {player.id === me.id
                ? <span className="rival-plus-spacer" />
                : (
                  <button className="rival-plus" type="button" aria-label={`Add ${displayName(player.name  ??  player.id)} to your rivals`} title="Add to your rivals" onClick={() => onAdd(player)}>
                    +
                  </button>
                )}
              <span className="rival-name">{displayName(player.name  ??  player.id)}</span>
              <span className="rival-pum">{formatNumber(player.pumbility)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
