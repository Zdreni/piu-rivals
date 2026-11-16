import { Fragment } from 'react';
import type { Counts } from '../../data/stats.ts';


function Stat({ className, value }: { className: string; value: number }) {
  return <span className={`${className}${(value === 0  ?  ' zero'  :  '')}`}>{value}</span>;
}


const OUTCOME_CLASSES: Record<keyof Counts, string> = { lose: 'neg', unplayed: 'blue', win: 'pos', tie: 'tie', hidden: 'hidden-loss' };


// "3 lost · 9 won · 5 non-matched", with `labels`; unless `treatTieAsWin`, with "2 tied" after the lost; with
//  `showHidden`, "4 hidden" starts a second line, with the non-matched.
export function OutcomeStats({ counts, labels, treatTieAsWin, showHidden }: {
  counts: Counts;
  labels: Record<keyof Counts, string>;
  treatTieAsWin: boolean;
  showHidden: boolean;
}) {
  const allOutcomes = ['lose', 'tie', 'win', ...(showHidden  ?  ['hidden'] as const  :  []), 'unplayed'] as const;
  const outcomes = allOutcomes.filter((outcome)  =>  outcome !== 'tie'  ||  ! treatTieAsWin);
  return outcomes.map((outcome, i)  =>  (
    <Fragment key={outcome}>
      {(outcome === 'hidden'  ?  <br />  :  i > 0  &&  ' · ')}
      <Stat className={OUTCOME_CLASSES[outcome]} value={counts[outcome]} /> {labels[outcome]}
    </Fragment>
  ));
}
