import type { PlayerSummary, Rival } from '@piu-rivals/shared';
import { useEffect, useMemo, useRef } from 'react';
import { type ChartRow, displayName, type PlayerBests } from './model.ts';
import type { CountBy } from './preferences.ts';
import { OtherPlayers, usePlayers } from './other_players.tsx';
import { RivalListItem, type ListedPlayer } from './rival_list_item.tsx';
import { type Counts, NO_COUNTS, realCounts, STAT_WORDS } from './stats.ts';
import type { RivalTab } from './ui_state.ts';


const listed = (player: PlayerSummary): ListedPlayer => ({
  playerId: player.id,
  fullName: player.name  ??  player.id,
  name: displayName(player.name  ??  player.id),
  pumbility: player.pumbility,
  lastScrapedAt: player.lastScrapedAt,
});


// The rivals column: its My rivals tab removes rivals, toggles which are compared, and focuses one to show its
// details; its Others tab adds rivals.
// Each rival shows how many of their charts you lose / haven't played / win, judged on the real scores, with none
// of the settings applied. `soloStats`, given in solo mode, replace the solo rival's stats; they are named by
// `countBy`. Your own row shows `myStats`, your totals against the compared rivals, counted both ways.
export function RivalList({ tab, charts, me, rivals, bests, focused, solo, soloStats, myStats, countBy, onTab, onFocus, onSolo, onToggle,
  onRemove, onAdd }: {
  tab: RivalTab;
  charts: ChartRow[];
  me: PlayerSummary;
  rivals: Rival[];
  bests: Map<string, PlayerBests>;
  focused: string | null;
  solo: string | null;
  soloStats: Counts | null;
  myStats: Record<CountBy, Counts>;
  countBy: CountBy;
  onTab: (tab: RivalTab) => void;
  onFocus: (playerId: string | null) => void;
  onSolo: (playerId: string | null) => void;
  onToggle: (playerId: string, on: boolean) => void;
  onRemove: (playerId: string) => void;
  onAdd: (player: PlayerSummary) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const { players: allPlayers, error: playersError } = usePlayers();
  const rivalStats = useMemo(() => realCounts(charts), [charts]);

  // You and your rivals by PUMBILITY (highest first); those without one follow alphabetically.
  const players = [me, ...rivals].map(listed).sort((a, b) => (b.pumbility  ??  -1) - (a.pumbility  ??  -1)
    ||  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const hidden = new Set(rivals.filter((rival) => rival.hidden).map((rival) => rival.id));
  const rivalIds = new Set(rivals.map((rival) => rival.id));
  const othersCount = allPlayers  &&  allPlayers.filter((player) => player.id !== me.id  &&  ! rivalIds.has(player.id)).length;

  // A newly added rival is focused; it's brought into view once you're back on My rivals. A rival unrolls as it's
  // focused, so it's brought into view again once it has.
  useEffect(() => {
    const row = container.current?.querySelector('.rival.focused');
    if (! row)
      return;

    row.scrollIntoView({ block: 'nearest' });
    const unrolled = (event: Event) => {
      if (event.target === row.querySelector('.rival-more'))
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    row.addEventListener('transitionend', unrolled);
    return () => row.removeEventListener('transitionend', unrolled);
  }, [focused, tab]);

  const add = (player: PlayerSummary) => {
    onAdd(player);
    onFocus(player.id);
  };

  const tabButton = (id: RivalTab, label: string, count: number | null) => (
    <button type="button" role="tab" aria-selected={tab === id} className="rival-tab" onClick={() => onTab(id)}>
      {label}{count !== null  &&  <span className="tab-count">{count}</span>}
    </button>
  );

  return (
    <div className="rival-list" aria-label="Rivals">
      <div className="rival-tabs" role="tablist">
        {tabButton('mine', 'My rivals', rivals.length)}
        {tabButton('others', 'Others', othersCount)}
      </div>
      {tab === 'others'
        ? <OtherPlayers me={me} myBests={bests.get(me.id)} players={allPlayers} error={playersError} rivals={rivalIds} onAdd={add} />
        : (
          <div className="rival-scroll" ref={container}>
            {players.map((player) => {
              const isMe = player.playerId === me.id;
              const isSolo = player.playerId === solo;
              const playerBests = [...bests.get(player.playerId)?.values()  ??  []];
              return (
                <RivalListItem
                  key={player.playerId}
                  player={player}
                  me={isMe}
                  on={isMe  ||  ! hidden.has(player.playerId)}
                  solo={isSolo}
                  faded={!! solo  &&  ! isMe  &&  ! isSolo}
                  focused={player.playerId === focused}
                  stats={(isSolo  &&  soloStats)  ||  rivalStats.get(player.playerId)  ||  NO_COUNTS}
                  statsWords={STAT_WORDS[isSolo  &&  soloStats ? countBy : 'results']}
                  totals={isMe ? myStats : null}
                  ties={!! solo}
                  best={playerBests.length}
                  scores={playerBests.reduce((acc, best) => acc + best.tries, 0)}
                  onFocus={() => onFocus(player.playerId)}
                  onUnfocus={() => onFocus(null)}
                  onToggle={(on) => onToggle(player.playerId, on)}
                  onSolo={(on) => onSolo(on ? player.playerId : null)}
                  onRemove={() => onRemove(player.playerId)}
                />
              );
            })}
            {! rivals.length  &&  <div className="muted rival-hint">No rivals yet. Add some on the Others tab.</div>}
          </div>
        )}
    </div>
  );
}
