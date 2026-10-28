import type { PlayerSummary } from '@piu-rivals/shared';
import { playerLabel } from '../util.ts';


// Picks one stored player, or none.
export function PlayerSelect({ players, value, onChange, label }: {
  players: PlayerSummary[];
  value: string | null;
  onChange: (playerId: string | null) => void;
  label: string;
}) {
  const sorted = [...players].sort((a, b)  =>  playerLabel(a).localeCompare(playerLabel(b)));
  return (
    <select value={value  ??  ''} onChange={(event)  =>  onChange(event.target.value  ||  null)} aria-label={label}>
      <option value="">— none —</option>
      {sorted.map((player)  =>  <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}
    </select>
  );
}
