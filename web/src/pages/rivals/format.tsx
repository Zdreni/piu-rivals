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


// An arrow, a shaft and a head, in the text colour, drawn rather than typed, since the font's arrows differ by
// platform and blur at small sizes. It points to where the rival stands.
export function Arrow({ up }: { up: boolean }) {
  return (
    <svg className="arrow" viewBox="0 0 6 12" aria-hidden="true">
      <path d={up ? 'M3 10V2.5M1.25 4.25L3 2.5l1.75 1.75' : 'M3 2v7.5M1.25 7.75L3 9.5l1.75-1.75'} />
    </svg>
  );
}


// The colour follows `outcome` (the capped diff); a loss the cap turns into a tie gets a muted red and a tooltip
// naming `cap`, while a win stays a win. With `markTie`, a true tie gets the tie colour.
// Two grid cells: the arrow, pointing to where the rival stands, then the number.
export function Delta({ value, outcome = value, cap = null, markTie = false }: {
  value: number | null;
  outcome?: number | null;
  cap?: number | null;
  markTie?: boolean;
}) {
  if (value === null)
    return <><span /><span /></>;
  if (value === 0)
    return <><span /><span className="num"><span className={`delta-tie${markTie ? ' tie' : ''}`} title="Tie">=</span></span></>;

  const tone = outcome  ||  value;
  const capped = ! outcome  &&  value < 0;
  const className = (tone > 0 ? 'pos' : tone < 0 ? 'neg' : markTie ? 'tie' : '') + (capped ? ' muted' : '');
  const capText = cap === null ? 'score cap' : `${cap / 1000}k score cap`;
  const title = capped ? `Both scores ≥ ${capText}, so this loss is hidden` : undefined;
  const abs = Math.abs(value);
  return (
    <>
      <span className={`delta-arrow ${className}`} title={title}><Arrow up={value < 0} /></span>
      <span className={`num ${className}`} title={title}>
        {/* Below a thousand every digit is dimmed, like the last three digits of bigger diffs. */}
        {abs < 1000 ? <span className="tail-dim">{abs}</span> : <Score value={abs} tailClass="tail-dim" />}
      </span>
    </>
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
