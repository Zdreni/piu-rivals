import type { PlayerSummary, PlayersResponse } from '@piu-rivals/shared';
import { type KeyboardEvent, useState } from 'react';
import { api, errorText } from '../../api.ts';
import { formatNumber } from '../../util.ts';
import { displayName } from './model.ts';

const MAX_MATCHES = 8;

let playersLoad: Promise<PlayerSummary[]> | null = null;


// All players, loaded once per page load when the picker is first used.
function loadPlayers(): Promise<PlayerSummary[]> {
  playersLoad  ??=  api<PlayersResponse>('GET', '/players').then(({ players }) => players, (error) => {
    playersLoad = null;
    throw error;
  });

  return playersLoad;
}


// Finds a player by name and adds them as a rival. `exclude` are you and your current rivals.
export function RivalPicker({ exclude, onAdd }: { exclude: Set<string>; onAdd: (player: PlayerSummary) => void }) {
  const [players, setPlayers] = useState<PlayerSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const load = () => {
    setOpen(true);
    loadPlayers().then(setPlayers, (e) => setError(errorText(e)));
  };

  const words = query.trim().toLowerCase();
  const matches = words  &&  players
    ? players
      .filter((player) => ! exclude.has(player.id)  &&  (player.name  ??  player.id).toLowerCase().includes(words))
      .sort((a, b) => (b.pumbility  ??  -1) - (a.pumbility  ??  -1))
      .slice(0, MAX_MATCHES)
    : [];

  const add = (player: PlayerSummary) => {
    onAdd(player);
    setQuery('');
    setActive(0);
  };

  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown'  ||  event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (matches.length ? (i + step + matches.length) % matches.length : 0));
    } else if (event.key === 'Enter'  &&  matches[active]) {
      event.preventDefault();
      add(matches[active]);
    } else if (event.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <div className="rival-add">
      <input
        type="search"
        placeholder="Add a rival…"
        aria-label="Add a rival by name"
        value={query}
        onFocus={load}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={keyDown}
      />
      {open  &&  words  &&  (
        <div className="rival-add-list" role="listbox">
          {error  &&  <div className="rival-add-note error">{error}</div>}
          {! error  &&  ! players  &&  <div className="rival-add-note">Loading players…</div>}
          {players  &&  ! matches.length  &&  <div className="rival-add-note">No such player. An admin can register them.</div>}
          {matches.map((player, i) => (
            <div
              key={player.id}
              role="option"
              aria-selected={i === active}
              className={`rival-add-item${i === active ? ' active' : ''}`}
              title={player.name  ??  player.id}
              // Before the input's blur closes the list.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => add(player)}
            >
              <span className="rival-name">{displayName(player.name  ??  player.id)}</span>
              <span className="rival-pum">{formatNumber(player.pumbility)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
