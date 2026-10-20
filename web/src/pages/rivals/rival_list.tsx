import type { PlayerSummary, Rival } from '@piu-rivals/shared';
import { useEffect, useMemo, useRef } from 'react';
import { type ChartRow, displayName, type PlayerBests } from './model.ts';
import type { CountBy } from './preferences.ts';
import { RivalListItem, type ListedPlayer } from './rival_list_item.tsx';
import { RivalPicker } from './rival_picker.tsx';
import { type Counts, STAT_WORDS } from './stats.ts';

const NO_COUNTS: Counts = { lose: 0, win: 0, unplayed: 0 };


const listed = (player: PlayerSummary): ListedPlayer => ({
  playerId: player.id,
  fullName: player.name  ??  player.id,
  name: displayName(player.name  ??  player.id),
  pumbility: player.pumbility,
  lastScrapedAt: player.lastScrapedAt,
});


// The rivals column: adds and removes rivals, toggles which are compared, and focuses one to show its details.
// Each rival shows how many of their charts you lose / haven't played / win, judged on the real scores, with none
// of the settings applied. `soloStats`, given in solo mode, replace the solo rival's stats; they are named by
// `countBy`, like in the header.
export function RivalList({ charts, me, rivals, bests, focused, solo, soloStats, countBy, onFocus, onSolo, onToggle, onRemove, onAdd }: {
  charts: ChartRow[];
  me: PlayerSummary;
  rivals: Rival[];
  bests: Map<string, PlayerBests>;
  focused: string | null;
  solo: string | null;
  soloStats: Counts | null;
  countBy: CountBy;
  onFocus: (playerId: string | null) => void;
  onSolo: (playerId: string | null) => void;
  onToggle: (playerId: string, on: boolean) => void;
  onRemove: (playerId: string) => void;
  onAdd: (player: PlayerSummary) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const rivalStats = useMemo(() => {
    const stats = new Map<string, Counts>();
    for (const chart of charts) {
      for (const rival of chart.rivals) {
        let counts = stats.get(rival.playerId);
        if (! counts)
          stats.set(rival.playerId, counts = { ...NO_COUNTS });

        counts[rival.realDelta === null ? 'unplayed' : rival.realDelta < 0 ? 'lose' : 'win']++;
      }
    }

    return stats;
  }, [charts]);

  // You and your rivals by PUMBILITY (highest first); those without one follow alphabetically.
  const players = [me, ...rivals].map(listed).sort((a, b) => (b.pumbility  ??  -1) - (a.pumbility  ??  -1)
    ||  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const hidden = new Set(rivals.filter((rival) => rival.hidden).map((rival) => rival.id));
  const exclude = new Set([me.id, ...rivals.map((rival) => rival.id)]);

  // A newly added rival is focused; it's brought into view.
  useEffect(() => {
    container.current?.querySelector('.rival.focused')?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  const add = (player: PlayerSummary) => {
    onAdd(player);
    onFocus(player.id);
  };

  return (
    <div className="rival-list" aria-label="Rivals" ref={container}>
      <RivalPicker exclude={exclude} onAdd={add} />
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
      {! rivals.length  &&  <div className="muted rival-hint">No rivals yet. Find players by name above.</div>}
    </div>
  );
}
