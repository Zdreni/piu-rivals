import type { MouseEvent } from 'react';
import { formatNumber } from '../../util.ts';
import { StatWords } from './format.tsx';
import type { Counts } from './stats.ts';

export interface ListedPlayer {
  playerId: string;
  // The full name, with its "#1234" tag, and the shown one.
  fullName: string;
  name: string;
  pumbility: number | null;
  lastScrapedAt: string | null;
}

const statsTip = 'Results against this rival: lost / non-matched / won, judged on the real scores, without the score cap filter';

const statsSoloTip = 'Solo: the same counts as in the header, with the score cap and NP min rivals applied';


const ClockIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <circle cx="8" cy="8" r="6.5" /><path d="M8 4.5V8l2.5 1.5" />
  </svg>
);


// Calendar days since the player's scores were last scraped: shown from 3 days on, or with "?" when never.
// Clicking it opens their Sessions page.
function ScrapeBadge({ lastScrapedAt, href }: { lastScrapedAt: string | null; href: string }) {
  if (! lastScrapedAt)
    return <a className="rival-visit" href={href} target="_blank" rel="noreferrer" title="Not scraped yet"><ClockIcon />?</a>;

  const scraped = new Date(lastScrapedAt);
  const now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    - new Date(scraped.getFullYear(), scraped.getMonth(), scraped.getDate()).getTime()) / 86400000);
  if (days < 3)
    return null;

  return (
    <a className="rival-visit" href={href} target="_blank" rel="noreferrer" title={`Scores last scraped ${scraped.toLocaleString()}`}>
      <ClockIcon />{days}d
    </a>
  );
}


function Count({ value, label }: { value: number; label: string }) {
  return <><span className={value === 0 ? 'zero' : undefined}>{formatNumber(value)}</span> {label}</>;
}


// One rival row: the visibility toggle, name, scrape age and PUMBILITY, then (while focused) the score counts,
// the results against them and their links. `me` marks your own row, `on` a rival checked for the stats,
// `solo` the solo rival, `faded` everyone else left out while a rival is solo (covered with a fader).
export function RivalListItem({ player, me, on, solo, faded, focused, stats, statsWords, best, scores, onFocus, onUnfocus,
  onToggle, onSolo, onRemove }: {
  player: ListedPlayer;
  me: boolean;
  on: boolean;
  solo: boolean;
  faded: boolean;
  focused: boolean;
  stats: Counts;
  statsWords: Record<keyof Counts, string>;
  best: number;
  scores: number;
  onFocus: () => void;
  onUnfocus: () => void;
  onToggle: (on: boolean) => void;
  onSolo: (solo: boolean) => void;
  onRemove: () => void;
}) {
  const base = `https://piuscores.arroweclip.se/Player/${encodeURIComponent(player.playerId)}`;
  const classes = ['rival', on  ||  solo ? '' : 'off', faded ? 'faded' : '', me ? 'me' : '', focused ? 'focused' : ''];

  // Clicking a rival focuses it; clicking the header of the focused rival folds it back.
  const click = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, a, label, button'))
      return;

    if (! focused)
      onFocus();
    else if (target.closest('.rival-toggle'))
      onUnfocus();
  };

  return (
    <div className={classes.filter(Boolean).join(' ')} onClick={click}>
      <div className="rival-toggle" title={player.fullName}>
        {me
          ? <span className="rival-spacer" />
          : <input type="checkbox" data-player aria-label={`Compare with ${player.name}`} checked={on} onChange={(event) => onToggle(event.target.checked)} />}
        <span className="rival-name">{player.name}</span>
        <ScrapeBadge lastScrapedAt={player.lastScrapedAt} href={`${base}/Sessions`} />
        <span className="rival-pum">{formatNumber(player.pumbility)}</span>
      </div>
      <div className="rival-scrap">
        <div className="rival-counts" title="scraped scores · best scores">
          <Count value={scores} label="scores" /> · <Count value={best} label="best" />
        </div>
        {! me  &&  (
          <div className="rival-stats" title={solo ? statsSoloTip : statsTip}>
            <StatWords counts={stats} separator=" · " words={statsWords} />
          </div>
        )}
      </div>
      <div className="rival-links">
        {me
          ? <a className="rival-link" href={base} target="_blank" rel="noreferrer">My page</a>
          : (
            <label className="rival-link rival-solo" title="Compare only you and this rival">
              <input type="checkbox" checked={solo} onChange={(event) => onSolo(event.target.checked)} />Solo
            </label>
          )}
        <a className="rival-link" href={`${base}/Sessions`} target="_blank" rel="noreferrer">Sessions</a>
        {! me  &&  (
          <button className="rival-link rival-delete" type="button" title="Remove from your rivals; their scores stay on the server" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
