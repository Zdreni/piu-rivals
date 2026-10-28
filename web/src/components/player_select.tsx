import type { PlayerSummary } from '@piu-rivals/shared';
import { playerLabel } from '../util.ts';


// Picks one stored player, or none.
export function PlayerSelect({ players, value, onChange, label }: {
  players: PlayerSummary[];
  value: string | null;
  onChange: (playerId: string | null) => void;
  label: string;
}) {
  const sortedPlayers = [...players].sort((a, b)  =>  playerLabel(a).localeCompare(playerLabel(b)));
  return (
    <select value={value  ??  ''} onChange={(event)  =>  onChange(event.target.value  ||  null)} aria-label={label}>
      <option value="">— none —</option>
      {sortedPlayers.map((p)  =>  <option key={p.id} value={p.id}>{playerLabel(p)}</option>)}
    </select>
  );
}
