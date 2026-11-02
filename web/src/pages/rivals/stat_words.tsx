import { Fragment } from 'react';
import { type Counts, STAT_WORDS } from '../../data/stats.ts';


function Stat({ className, value }: { className: string; value: number }) {
  return <span className={`${className}${(value === 0  ?  ' zero'  :  '')}`}>{value}</span>;
}


const STAT_CLASSES: Record<keyof Counts, string> = { lose: 'neg', unplayed: 'blue', win: 'pos', tie: 'tie', hidden: '' };


// "3 lost, 5 non-matched, 9 won", in the words of `words`; unless `treatTieAsWin`, with ", 2 tied".
export function StatWords({ counts, separator = ', ', words = STAT_WORDS.results, treatTieAsWin = true }: {
  counts: Counts;
  separator?: string;
  words?: Record<keyof Counts, string>;
  treatTieAsWin?: boolean;
}) {
  const stats: (keyof Counts)[] = (treatTieAsWin  ?  ['lose', 'unplayed', 'win']  :  ['lose', 'unplayed', 'win', 'tie']);
  return stats.map((stat, i)  =>  (
    <Fragment key={stat}>
      {i > 0  &&  separator}
      <Stat className={STAT_CLASSES[stat]} value={counts[stat]} /> {words[stat]}
    </Fragment>
  ));
}
