import { Fragment } from 'react';
import { formatNumber } from '../../util.ts';
import type { Counts } from './stats.ts';
import { STAT_WORDS } from './stats.ts';


// The last three digits are drawn smaller and dimmer, e.g. 997 + smaller ',458'.
export function Score({ value, tailClass = 'tail' }: { value: number | null; tailClass?: string }) {
  const text = formatNumber(value);
  const i = text.lastIndexOf(',');
  return i === -1 ? <>{text}</> : <>{text.slice(0, i)}<span className={tailClass}>{text.slice(i)}</span></>;
}


// The time left of a snooze: in hours up to 48, e.g. "5h" or "48h", and in days beyond, e.g. "3d"; rounded up.
export function timeLeft(ms: number) {
  const hours = Math.max(1, Math.ceil(ms / 3600_000));
  return hours > 48 ? `${Math.ceil(hours / 24)}d` : `${hours}h`;
}


// The colour follows `outcome` (the capped diff); a loss the cap turns into a tie gets a muted red and a tooltip
// naming `cap`, while a win stays a win. With `markTie`, a true tie gets the tie colour.
// Signed from the rival's side: + when the rival is ahead and − when you are.
export function Delta({ value, outcome = value, cap = null, markTie = false }: {
  value: number | null;
  outcome?: number | null;
  cap?: number | null;
  markTie?: boolean;
}) {
  if (value === null)
    return <span />;
  if (value === 0)
    return <span className="num delta"><span className={`delta-tie${markTie ? ' tie' : ''}`} title="Tie">=</span></span>;

  const tone = outcome  ||  value;
  const capped = ! outcome  &&  value < 0;
  const className = (tone > 0 ? 'pos' : tone < 0 ? 'neg' : markTie ? 'tie' : '') + (capped ? ' muted' : '');
  const capText = cap === null ? 'score cap' : `${cap / 1000}k score cap`;
  const title = capped ? `Both scores ≥ ${capText}, so this loss is hidden` : undefined;
  const abs = Math.abs(value);
  const sign = <span className="delta-sign">{value > 0 ? '−' : '+'}</span>;
  return (
    <span className={`num delta ${className}`} title={title}>
      {/* Below a thousand the whole diff is dimmed, like the last three digits of bigger diffs. */}
      {abs < 1000 ? <span className="tail-dim">{sign}{abs}</span> : <>{sign}<Score value={abs} tailClass="tail-dim" /></>}
    </span>
  );
}


// How much your best score rose over your previous one, e.g. "+12,345" in your score's colour, in the diff column of
// your row.
export function Gain({ value }: { value: number }) {
  const sign = <span className="delta-sign">+</span>;
  return (
    <span className="num delta" title="Over your previous best">
      {value < 1000 ? <span className="tail-dim">{sign}{value}</span> : <>{sign}<Score value={value} tailClass="tail-dim" /></>}
    </span>
  );
}


function Stat({ className, value }: { className: string; value: number }) {
  return <span className={`${className}${value === 0 ? ' zero' : ''}`}>{value}</span>;
}


const STAT_CLASSES: Record<keyof Counts, string> = { lose: 'neg', unplayed: 'blue', win: 'pos', tie: 'tie', hidden: '' };


// "3 lost, 5 non-matched, 9 won", in the words of `words`; `ties` (the solo view) adds ", 2 tied".
export function StatWords({ counts, separator = ', ', words = STAT_WORDS.results, ties = false }: {
  counts: Counts;
  separator?: string;
  words?: Record<keyof Counts, string>;
  ties?: boolean;
}) {
  const stats: (keyof Counts)[] = ties ? ['lose', 'unplayed', 'win', 'tie'] : ['lose', 'unplayed', 'win'];
  return stats.map((stat, i) => (
    <Fragment key={stat}>
      {i > 0  &&  separator}
      <Stat className={STAT_CLASSES[stat]} value={counts[stat]} /> {words[stat]}
    </Fragment>
  ));
}
