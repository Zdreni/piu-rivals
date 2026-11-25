import type { PlayerSummary, Rival } from '@piu-rivals/shared';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { tabsClass, useTabsFit } from './layout.ts';
import { type Chartboard, displayName, type PlayerBests } from '../../data/model.ts';
import type { CountBy, LevelRange } from '../../data/preferences.ts';
import { usePlayers } from '../../data/other_players.ts';
import { OtherPlayers } from './other_players.tsx';
import { isFound, PlayerSearch } from './player_search.tsx';
import { RivalListItem, type ListedPlayer } from './rival_list_item.tsx';
import { type Counts, NO_COUNTS, playerCounts } from '../../data/stats.ts';
import type { SetupTab } from './ui_state.ts';
import { useScrollVeil } from '../../components/scroll_veil.ts';


const toListedPlayer = (player: PlayerSummary): ListedPlayer  =>  ({
  playerId: player.id,
  fullName: player.name  ??  player.id,
  name: displayName(player.name  ??  player.id),
  pumbility: player.pumbility,
});


// The Setup page's tabs: your rivals, other players to add in the Others tab, and `preferencesPanel`. Rivals' stats
//  are judged on the real scores in your level range (see playerCounts). Your row shows `myStats`.
export function RivalList({ tab, chartboards, me, rivals, bests, focusedPlayerId, soloPlayerId, myStats, scoreCap, levelRange, preferencesPanel,
  onTab, onFocus, onSolo, onToggle, onStats, onRemove, onAdd }: {
  tab: SetupTab;
  chartboards: Chartboard[];
  me: PlayerSummary;
  rivals: Rival[];
  bests: Map<string, PlayerBests>;
  focusedPlayerId: string | null;
  soloPlayerId: string | null;
  myStats: Record<CountBy, Counts>;
  scoreCap: number;
  levelRange: LevelRange;
  preferencesPanel: ReactNode;
  onTab: (tab: SetupTab) => void;
  onFocus: (playerId: string | null) => void;
  onSolo: (soloIsOn: boolean) => void;
  onToggle: (playerId: string, on: boolean) => void;
  onStats: (playerId: string) => void;
  onRemove: (playerId: string) => void;
  onAdd: (player: PlayerSummary) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const veilRef = useScrollVeil(null, container);
  const { players: allPlayers, error: playersError } = usePlayers();
  const rivalStats = useMemo(()  =>  playerCounts(chartboards), [chartboards]);

  // Each tab's search is kept while you switch tabs.
  const [rivalQuery, setRivalQuery] = useState('');
  const [otherPlayerQuery, setOtherPlayerQuery] = useState('');
  const searchText = rivalQuery.trim().toLowerCase();

  // You and the rivals found by `rivalQuery`, by PUMBILITY (highest first); those without one follow alphabetically.
  const players = [me, ...rivals].map(toListedPlayer)
    .filter((p)  =>  p.playerId === me.id  ||  isFound(p.fullName, searchText))
    .sort((a, b)  =>  (b.pumbility  ??  -1) - (a.pumbility  ??  -1)
      ||  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const hiddenIds = new Set(rivals.filter((r)  =>  r.hidden).map((r)  =>  r.id));
  const rivalIds = new Set(rivals.map((r)  =>  r.id));
  const otherPlayerCount = allPlayers  &&  allPlayers.filter((p)  =>  p.id !== me.id  &&  ! rivalIds.has(p.id)).length;

  // My rivals opens centered on you, before a focused rival is brought into view below.
  useEffect(()  => {
    if (tab === 'mine')
      container.current?.querySelector('.rival.me')?.scrollIntoView({ block: 'center' });
  }, [tab]);

  // A newly added rival is focused; it's brought into view once you're back on My rivals. A rival unrolls as it's
  //  focused, so it's brought into view again once it has.
  useEffect(()  => {
    const row = container.current?.querySelector('.rival.focused');
    if (! row)
      return;

    row.scrollIntoView({ block: 'nearest' });

    const scrollWhenUnrolled = (event: Event)  => {
      if (event.target === row.querySelector('.rival-more'))
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    row.addEventListener('transitionend', scrollWhenUnrolled);
    return ()  =>  row.removeEventListener('transitionend', scrollWhenUnrolled);
  }, [focusedPlayerId, tab]);

  const add = (player: PlayerSummary)  => {
    onAdd(player);
    onFocus(player.id);
  };

  const tabBar = useRef<HTMLDivElement>(null);
  const tabsFit = useTabsFit(tabBar, [rivals.length, otherPlayerCount]);

  const renderTabButton = (id: SetupTab, label: string, count: number | null)  =>  (
    <button type="button" role="tab" aria-selected={tab === id} className="rival-tab" onClick={()  =>  onTab(id)}>
      {label}{count !== null  &&  <span className="tab-count">{count}</span>}
    </button>
  );

  return (
    <div className="rival-list" aria-label="Setup">
      {/* The search sticks to the top with the tabs where the page scrolls. */}
      <div className="setup-head">
        <div className={`rival-tabs${tabsClass(tabsFit)}`} ref={tabBar} role="tablist">
          {renderTabButton('mine', 'My rivals', rivals.length)}
          {renderTabButton('others', 'Others', otherPlayerCount)}
          {renderTabButton('preferences', 'Preferences', null)}
        </div>
        {tab === 'mine'  &&  !! rivals.length  &&  <PlayerSearch query={rivalQuery} placeholder="Find a rival…" onQuery={setRivalQuery} />}
        {tab === 'others'  &&  <PlayerSearch query={otherPlayerQuery} placeholder="Find a player…" onQuery={setOtherPlayerQuery} />}
      </div>
      {tab === 'preferences'
        ?  preferencesPanel
        :  tab === 'others'
        ?  (
          <OtherPlayers query={otherPlayerQuery} me={me} myBests={bests.get(me.id)} players={allPlayers} error={playersError} rivalIds={rivalIds}
            focusedPlayerId={focusedPlayerId} soloPlayerId={soloPlayerId} scoreCap={scoreCap} levelRange={levelRange} onFocus={onFocus} onAdd={add} onSolo={onSolo}
            onStats={onStats} />
        )
        :  (
          <div className="rival-scroll" ref={veilRef}>
            {players.map((player)  => {
              const isMe = player.playerId === me.id;
              const isSolo = player.playerId === soloPlayerId;
              const playerBests = [...bests.get(player.playerId)?.values()  ??  []];
              return (
                <RivalListItem
                  key={player.playerId}
                  player={player}
                  me={isMe}
                  on={isMe  ||  ! hiddenIds.has(player.playerId)}
                  solo={isSolo}
                  faded={!! soloPlayerId  &&  ! isMe  &&  ! isSolo}
                  focused={player.playerId === focusedPlayerId}
                  stats={rivalStats.get(player.playerId)  ||  NO_COUNTS}
                  totals={(isMe  ?  myStats  :  null)}
                  treatTieAsWin={! soloPlayerId}
                  best={playerBests.length}
                  scores={playerBests.reduce((acc, best)  =>  acc + best.tries, 0)}
                  onFocus={()  =>  onFocus(player.playerId)}
                  onUnfocus={()  =>  onFocus(null)}
                  onToggle={(on)  =>  onToggle(player.playerId, on)}
                  onSolo={onSolo}
                  onStats={()  =>  onStats(player.playerId)}
                  onRemove={()  =>  onRemove(player.playerId)}
                />
              );
            })}
            {! rivals.length  &&  <div className="muted rival-hint">No rivals yet. Add some on the Others tab.</div>}
            {!! rivals.length  &&  players.length === 1  &&  <div className="muted rival-hint">No such rival.</div>}
          </div>
        )}
    </div>
  );
}
