import type { BestsResponse, Chart, ListedPlayer, PlayersResponse, Rival } from '@piu-rivals/shared';
import { useEffect, useState } from 'react';
import { api, errorText } from '../api.ts';
import type { PlayerBests } from './model.ts';

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


export interface OtherBests {
  charts: Map<number, Chart>;
  bests: PlayerBests;
}

// Best results of players unrolled on the Others tab, loaded once per page load; they aren't cached between visits.
const otherBestsLoads = new Map<string, Promise<OtherBests>>();


function loadOtherBests(playerId: string): Promise<OtherBests> {
  let load = otherBestsLoads.get(playerId);
  if (! load) {
    load = api<BestsResponse>('GET', `/bests?players=${playerId}`).then((response)  =>  ({
      charts: new Map(response.charts.map((c)  =>  [c.id, c])),
      bests: new Map(response.bests.map((b)  =>  [b.chartId, b])),
    }));
    load.catch(()  =>  otherBestsLoads.delete(playerId));
    otherBestsLoads.set(playerId, load);
  }

  return load;
}


// The best results of a player who isn't a rival: null while loading, or the error.
export function useOtherBests(playerId: string | null): OtherBests | string | null {
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

  return ((playerId  &&  loaded?.playerId === playerId)  ?  loaded.data  :  null);
}


// The charts, best results and rivals to compare, with `soloPlayer` among them when `soloBests` are theirs: the
//  best results of a player who isn't a rival, or of one just added whose results aren't in yet.
export function withSoloPlayer(charts: Map<number, Chart>, bests: Map<string, PlayerBests>, rivals: Rival[],
  soloPlayer: { id: string; name: string } | null, soloBests: OtherBests | null) {
  const comparedRivals = rivals.map((r)  =>  ({ id: r.id, name: r.name  ??  r.id }));
  if (! soloPlayer  ||  ! soloBests)
    return { charts, bests, rivals: comparedRivals };

  const comparedBests = new Map(bests);
  if (! comparedBests.has(soloPlayer.id))
    comparedBests.set(soloPlayer.id, soloBests.bests);

  return {
    charts: new Map([...charts, ...soloBests.charts]),
    bests: comparedBests,
    rivals: (comparedRivals.some((r)  =>  r.id === soloPlayer.id)  ?  comparedRivals  :  [...comparedRivals, soloPlayer]),
  };
}
