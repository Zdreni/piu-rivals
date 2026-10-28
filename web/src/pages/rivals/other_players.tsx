import type { BestsResponse, Chart, ListedPlayer, PlayerSummary, PlayersResponse } from '@piu-rivals/shared';
import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../../api.ts';
import { formatNumber } from '../../util.ts';
import { StatWords } from './stat_words.tsx';
import { buildCharts, DEFAULT_LEVELS, displayName, type PlayerBests } from '../../data/model.ts';
import { MAX_SCORE_CAP } from '../../data/preferences.ts';
import { Count, statsTip } from './rival_list_item.tsx';
import { type Counts, NO_COUNTS, realCounts } from '../../data/stats.ts';

// The Others tab lists this many players above you and below you at first; each click on a "more" button lists
// SHOW_STEP more.
const SHOWN_ABOVE = 10;
const SHOWN_BELOW = 5;
const SHOW_STEP = 10;

let playersLoad: Promise<ListedPlayer[]> | null = null;


// All players, loaded once per page load.
function loadPlayers(): Promise<ListedPlayer[]> {
  playersLoad  ??=  api<PlayersResponse>('GET', '/players').then(({ players })  =>  players, (error)  => {
    playersLoad = null;
    throw error;
  });

  return playersLoad;
}


// All registered players, or null while loading; `error` when they couldn't be loaded.
export function usePlayers() {
  const [players, setPlayers] = useState<ListedPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(()  => {
    loadPlayers().then(setPlayers, (e)  =>  setError(errorText(e)));
  }, []);

  return { players, error };
}


interface OtherBests {
  charts: Map<number, Chart>;
  bests: PlayerBests;
}

// Best results of players unrolled on the Others tab, loaded once per page load; they aren't cached between visits.
const otherBestsLoads = new Map<string, Promise<OtherBests>>();


function loadOtherBests(playerId: string): Promise<OtherBests> {
  let load = otherBestsLoads.get(playerId);
  if (! load) {
    load = api<BestsResponse>('GET', `/bests?players=${playerId}`).then((response)  =>  ({
      charts: new Map(response.charts.map((chart)  =>  [chart.id, chart])),
      bests: new Map(response.bests.map((best)  =>  [best.chartId, best])),
    }));
    load.catch(()  =>  otherBestsLoads.delete(playerId));
    otherBestsLoads.set(playerId, load);
  }

  return load;
}


// The player's results lost / non-matched / won against yours, like a rival's: null while loading, or the error.
function useOtherStats(playerId: string | null, me: string, myBests: PlayerBests | undefined): Counts | string | null {
  const [loaded, setLoaded] = useState<{ playerId: string; data: OtherBests | string } | null>(null);

  useEffect(()  => {
    if (! playerId)
      return;

    let current = true;
    loadOtherBests(playerId).then(
      (data)  =>  current  &&  setLoaded({ playerId, data }),
      (e)  =>  current  &&  setLoaded({ playerId, data: errorText(e) }));

    return ()  =>  { current = false; };
  }, [playerId]);

  return useMemo(()  => {
    if (! playerId  ||  loaded?.playerId !== playerId)
      return null;

    if (typeof loaded.data === 'string')
      return loaded.data;

    const bests = new Map([[me, myBests  ??  new Map()], [playerId, loaded.data.bests]]);
    const charts = buildCharts(loaded.data.charts, bests, me, [{ id: playerId, name: playerId }], MAX_SCORE_CAP, DEFAULT_LEVELS);
    return realCounts(charts).get(playerId)  ??  NO_COUNTS;
  }, [playerId, loaded, me, myBests]);
}


// The Others tab: every registered player that isn't your rival, by PUMBILITY, each with a button to add them as
// a rival. You're listed among them too, to compare with, and stay listed whatever the name filter. Without a name
// filter, only the SHOWN_ABOVE players above you and SHOWN_BELOW below you are listed, the others folded into "more" buttons.
// Clicking a player unrolls how much of them is scraped, their results against yours (loaded then, judged like a
// rival's) and a link to their Sessions page. `myBests` are your best results, `players` all registered players
// (null while loading), `rivals` your current rivals' ids.
export function OtherPlayers({ me, myBests, players, error, rivals, onAdd }: {
  me: PlayerSummary;
  myBests: PlayerBests | undefined;
  players: ListedPlayer[] | null;
  error: string | null;
  rivals: Set<string>;
  onAdd: (player: PlayerSummary) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [shownAbove, setShownAbove] = useState(SHOWN_ABOVE);
  const [shownBelow, setShownBelow] = useState(SHOWN_BELOW);
  const openStats = useOtherStats((open !== me.id  ?  open  :  null), me.id, myBests);

  const words = query.trim().toLowerCase();
  const others: (PlayerSummary | ListedPlayer)[] = [players?.find((player)  =>  player.id === me.id)  ??  me,
    ...(players  ??  []).filter((player)  =>  player.id !== me.id)]
    .filter((player)  =>  player.id === me.id
      ||  (! rivals.has(player.id)  &&  (! words  ||  (player.name  ??  player.id).toLowerCase().includes(words))))
    .sort((a, b)  =>  (b.pumbility  ??  -1) - (a.pumbility  ??  -1)
      ||  (a.name  ??  a.id).localeCompare(b.name  ??  b.id, undefined, { sensitivity: 'base' }));

  const meAt = others.findIndex((player)  =>  player.id === me.id);
  const first = (words  ?  0  :  Math.max(0, meAt - shownAbove));
  const last = (words  ?  others.length  :  Math.min(others.length, meAt + 1 + shownBelow));

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
        {players  &&  others.length === 1  &&  (
          <div className="muted rival-hint">{words  ?  'No such player. An admin can register them.'  :  'No other players.'}</div>
        )}
        {first > 0  &&  (
          <button className="show-others top" type="button" onClick={()  =>  setShownAbove(shownAbove + SHOW_STEP)}>
            ...{first} more...
          </button>
        )}
        {others.slice(first, last).map((player)  => {
          const isMe = player.id === me.id;
          const isOpen = player.id === open;
          const name = displayName(player.name  ??  player.id);
          const classes = ['rival', 'other', isMe  ?  'me'  :  '', isOpen  ?  'focused'  :  ''];

          // Clicking a player unrolls them; clicking the header of the unrolled one rolls it back.
          const click = (event: MouseEvent)  => {
            const target = event.target as HTMLElement;
            if (target.closest('a, button'))
              return;

            if (! isOpen)
              setOpen(player.id);
            else if (target.closest('.rival-toggle'))
              setOpen(null);
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
                  {'plays' in player  &&  (
                    <div className="rival-scrap">
                      <div className="rival-counts" title="scraped scores · best scores">
                        <Count value={player.plays} label="scores" /> · <Count value={player.charts} label="best" />
                      </div>
                      {isOpen  &&  ! isMe  &&  (
                        <div className="rival-stats" title={(typeof openStats === 'string'  ?  undefined  :  statsTip)}>
                          {openStats === null  &&  'Comparing…'}
                          {typeof openStats === 'string'  &&  <span className="error">{openStats}</span>}
                          {openStats !== null  &&  typeof openStats === 'object'  &&  <StatWords counts={openStats} separator=" · " />}
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
        {last < others.length  &&  (
          <button className="show-others" type="button" onClick={()  =>  setShownBelow(shownBelow + SHOW_STEP)}>
            ...{others.length - last} more...
          </button>
        )}
      </div>
    </>
  );
}
