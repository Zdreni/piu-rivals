import type { ListedPlayer, PlayerSummary } from '@piu-rivals/shared';
import { type MouseEvent, useMemo, useState } from 'react';
import { type OtherBests, useOtherBests } from '../../data/other_players.ts';
import { formatNumber } from '../../util.ts';
import { StatWords } from './stat_words.tsx';
import { buildChartboards, displayName, type PlayerBests } from '../../data/model.ts';
import type { LevelRange } from '../../data/preferences.ts';
import { Count, statsTip } from './rival_list_item.tsx';
import { type Counts, NO_COUNTS, playerCounts } from '../../data/stats.ts';

// The Others tab lists this many players above you and below you at first; each click on a "more" button lists
//  SHOW_STEP more.
const LISTED_PLAYER_COUNTS = { above: 10, below: 5 };
const SHOW_STEP = 10;

// The player's results against yours, counted as a rival's are.
function otherStats(otherBests: OtherBests, playerId: string, me: string, myBests: PlayerBests | undefined, scoreCap: number,
  levelRange: LevelRange): Counts {
  const bests = new Map([[me, myBests  ??  new Map()], [playerId, otherBests.bests]]);
  const chartboards = buildChartboards(otherBests.charts, bests, me, [{ id: playerId, name: playerId }], scoreCap, levelRange);
  return playerCounts(chartboards).get(playerId)  ??  NO_COUNTS;
}


// The Others tab: registered players who aren't your rivals (`rivalIds`), by PUMBILITY and folded around you,
//  to add as rivals, or to compare solo once their results are in. `players` is null while loading.
export function OtherPlayers({ me, myBests, players, error, rivalIds, focusedPlayerId, soloPlayerId, scoreCap, levelRange, onFocus,
  onAdd, onSolo }: {
  me: PlayerSummary;
  myBests: PlayerBests | undefined;
  players: ListedPlayer[] | null;
  error: string | null;
  rivalIds: Set<string>;
  focusedPlayerId: string | null;
  soloPlayerId: string | null;
  scoreCap: number;
  levelRange: LevelRange;
  onFocus: (playerId: string | null) => void;
  onAdd: (player: PlayerSummary) => void;
  onSolo: (soloIsOn: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [listedPlayerCountAbove, setListedPlayerCountAbove] = useState(LISTED_PLAYER_COUNTS.above);
  const [listedPlayerCountBelow, setListedPlayerCountBelow] = useState(LISTED_PLAYER_COUNTS.below);
  // The focused player's results, when they're listed here.
  const openPlayerId = ((focusedPlayerId  &&  focusedPlayerId !== me.id  &&  ! rivalIds.has(focusedPlayerId))  ?  focusedPlayerId  :  null);
  const openBests = useOtherBests(openPlayerId);
  // Results come back only for an unrolled player, so `openPlayerId` is set once they're in.
  const openStats = useMemo(()  =>  ((openBests !== null  &&  typeof openBests === 'object')
    ?  otherStats(openBests, openPlayerId!, me.id, myBests, scoreCap, levelRange)
    :  openBests), [openBests, openPlayerId, me.id, myBests, scoreCap, levelRange.minLevel, levelRange.maxLevel]);

  const words = query.trim().toLowerCase();
  const otherPlayers: (PlayerSummary | ListedPlayer)[] = [players?.find((p)  =>  p.id === me.id)  ??  me,
    ...(players  ??  []).filter((p)  =>  p.id !== me.id)]
    .filter((p)  =>  p.id === me.id
      ||  (! rivalIds.has(p.id)  &&  (! words  ||  (p.name  ??  p.id).toLowerCase().includes(words))))
    .sort((a, b)  =>  (b.pumbility  ??  -1) - (a.pumbility  ??  -1)
      ||  (a.name  ??  a.id).localeCompare(b.name  ??  b.id, undefined, { sensitivity: 'base' }));

  const meAt = otherPlayers.findIndex((p)  =>  p.id === me.id);
  const fromIndex = (words  ?  0  :  Math.max(0, meAt - listedPlayerCountAbove));
  const toIndex = (words  ?  otherPlayers.length  :  Math.min(otherPlayers.length, meAt + 1 + listedPlayerCountBelow));

  return (
    <>
      <div className="rival-add">
        <input
          type="search"
          placeholder="Find a player…"
          aria-label="Find a player by name"
          value={query}
          onChange={(event)  =>  setQuery(event.target.value)}
          onKeyDown={(event)  =>  event.key === 'Escape'  &&  setQuery('')}
        />
      </div>
      <div className="rival-scroll">
        {error  &&  <div className="rival-hint error">{error}</div>}
        {! error  &&  ! players  &&  <div className="muted rival-hint">Loading players…</div>}
        {players  &&  otherPlayers.length === 1  &&  (
          <div className="muted rival-hint">{words  ?  'No such player. An admin can register them.'  :  'No other players.'}</div>
        )}
        {fromIndex > 0  &&  (
          <button className="show-others top" type="button" onClick={()  =>  setListedPlayerCountAbove(listedPlayerCountAbove + SHOW_STEP)}>
            ...{fromIndex} more...
          </button>
        )}
        {otherPlayers.slice(fromIndex, toIndex).map((player)  => {
          const isMe = player.id === me.id;
          const isOpen = player.id === focusedPlayerId;
          const isSolo = player.id === soloPlayerId;
          const name = displayName(player.name  ??  player.id);
          const classes = ['rival', 'other', isMe  ?  'me'  :  '', isOpen  ?  'focused'  :  ''];

          // Clicking a player unrolls them; clicking the header of the unrolled one rolls it back.
          const click = (event: MouseEvent)  => {
            const target = event.target as HTMLElement;
            if (target.closest('a, button'))
              return;

            if (! isOpen)
              onFocus(player.id);
            else if (target.closest('.rival-toggle'))
              onFocus(null);
          };

          return (
            <div key={player.id} className={classes.filter(Boolean).join(' ')} onClick={click}>
              <div className="rival-toggle" title={player.name  ??  player.id}>
                {isMe
                  ?  <span className="rival-plus-spacer" />
                  :  (
                    <button className="rival-plus" type="button" aria-label={`Add ${name} to your rivals`} title="Add to your rivals" onClick={()  =>  onAdd(player)}>
                      +
                    </button>
                  )}
                <span className="rival-name">{name}</span>
                <span className="rival-pum">{formatNumber(player.pumbility)}</span>
              </div>
              {/* Unrolled while open, like a rival (see .rival-more). */}
              <div className="rival-more">
                <div>
                  {/* Solo waits for the player's results, which it compares. */}
                  {isOpen  &&  ! isMe  &&  (
                    <div className="rival-links">
                      <label className="rival-link rival-check rival-solo" title="Compare only you and this player">
                        <input
                          type="checkbox"
                          checked={isSolo}
                          disabled={openBests === null  ||  typeof openBests !== 'object'}
                          onChange={(event)  =>  onSolo(event.target.checked)}
                        />Solo
                      </label>
                    </div>
                  )}
                  {'plays' in player  &&  (
                    <div className="rival-scrap">
                      <div className="rival-counts" title="scraped scores · best scores">
                        <Count value={player.plays} label="scores" /> · <Count value={player.charts} label="best" />
                      </div>
                      {isOpen  &&  ! isMe  &&  (
                        <div className="rival-stats" title={(typeof openStats === 'string'  ?  undefined  :  statsTip)}>
                          {openStats === null  &&  'Comparing…'}
                          {typeof openStats === 'string'  &&  <span className="error">{openStats}</span>}
                          {openStats !== null  &&  typeof openStats === 'object'  &&  (
                            <StatWords counts={openStats} separator=" · " treatTieAsWin={false} showHidden />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="rival-links">
                    <a className="rival-link" href={`https://piuscores.arroweclip.se/Player/${encodeURIComponent(player.id)}/Sessions`}
                      target="_blank" rel="noreferrer">
                      Sessions
                    </a>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {toIndex < otherPlayers.length  &&  (
          <button className="show-others" type="button" onClick={()  =>  setListedPlayerCountBelow(listedPlayerCountBelow + SHOW_STEP)}>
            ...{otherPlayers.length - toIndex} more...
          </button>
        )}
      </div>
    </>
  );
}
