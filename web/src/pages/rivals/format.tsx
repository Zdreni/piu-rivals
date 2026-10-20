import { formatNumber } from '../../util.ts';
import type { Counts } from './stats.ts';
import { STAT_WORDS } from './stats.ts';


// The last three digits are drawn smaller and dimmer, e.g. 997 + smaller ',458'.
export function Score({ value, tailClass = 'tail' }: { value: number | null; tailClass?: string }) {
  const text = formatNumber(value);
  const i = text.lastIndexOf(',');
  return i === -1 ? <>{text}</> : <>{text.slice(0, i)}<span className={tailClass}>{text.slice(i)}</span></>;
}


// The colour follows `outcome` (the capped diff); a capped tie gets a muted colour from the real diff's sign
// and a tooltip naming `cap`.
export function Delta({ value, outcome = value, cap = null }: { value: number | null; outcome?: number | null; cap?: number | null }) {
  if (value === null)
    return <span>—</span>;

  const tone = outcome  ||  value;
  const capped = ! outcome  &&  value !== 0;
  const className = (tone > 0 ? 'pos' : tone < 0 ? 'neg' : '') + (capped ? ' muted' : '');
  const capText = cap === null ? 'score cap' : `${cap / 1000}k score cap`;
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return (
    <span className={className} title={capped ? `Both scores ≥ ${capText}, so this counts as a tie` : undefined}>
      {sign}
      {/* Below a thousand every digit is dimmed, like the last three digits of bigger diffs. */}
      {abs < 1000 ? <span className="tail-dim">{abs}</span> : <Score value={abs} tailClass="tail-dim" />}
    </span>
  );
}


function Stat({ className, value }: { className: string; value: number }) {
  return <span className={`${className}${value === 0 ? ' zero' : ''}`}>{value}</span>;
}


// "3 lost, 5 non-matched, 9 won", in the words of `words`.
export function StatWords({ counts, separator = ', ', words = STAT_WORDS.results }: {
  counts: Counts;
  separator?: string;
  words?: Record<keyof Counts, string>;
}) {
  return (
    <>
      <Stat className="neg" value={counts.lose} /> {words.lose}{separator}
      <Stat className="blue" value={counts.unplayed} /> {words.unplayed}{separator}
      <Stat className="pos" value={counts.win} /> {words.win}
    </>
  );
}
