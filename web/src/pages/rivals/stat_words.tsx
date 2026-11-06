import { Fragment } from 'react';
import { type Counts, STAT_WORDS } from '../../data/stats.ts';


function Stat({ className, value }: { className: string; value: number }) {
  return <span className={`${className}${(value === 0  ?  ' zero'  :  '')}`}>{value}</span>;
}


const STAT_CLASSES: Record<keyof Counts, string> = { lose: 'neg', unplayed: 'blue', win: 'pos', tie: 'tie', hidden: 'hidden-loss' };


// "3 lost, 9 won, 5 non-matched", in the words of `words`; unless `treatTieAsWin`, with "2 tied" after the lost; with
//  `showHidden`, "4 hidden" starts a second line, with the non-matched.
export function StatWords({ counts, separator = ', ', words = STAT_WORDS.results, treatTieAsWin = true, showHidden = false }: {
  counts: Counts;
  separator?: string;
  words?: Record<keyof Counts, string>;
  treatTieAsWin?: boolean;
  showHidden?: boolean;
}) {
  const allStats = ['lose', 'tie', 'win', ...(showHidden  ?  ['hidden'] as const  :  []), 'unplayed'] as const;
  const stats = allStats.filter((stat)  =>  stat !== 'tie'  ||  ! treatTieAsWin);
  return stats.map((stat, i)  =>  (
    <Fragment key={stat}>
      {(stat === 'hidden'  ?  <br />  :  i > 0  &&  separator)}
      <Stat className={STAT_CLASSES[stat]} value={counts[stat]} /> {words[stat]}
    </Fragment>
  ));
}
