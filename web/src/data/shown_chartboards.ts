import type { Rival } from '@piu-rivals/shared';
import { type Chartboard, targetWeight, withRivalsOrNull } from './model.ts';
import { type CountBy, MIN_NP_RIVALS } from './preferences.ts';
import { chartTier, resultTab, sortedLevels } from './stats.ts';

export interface ChartboardsSettings {
  rivals: Rival[];
  soloPlayerId: string | null;
  countBy: CountBy;
  npMinimalRivals: number;
  // Snooze ends by chart id; those up to `snoozesCheckedAt` are over.
  snoozes: Map<number, number>;
  snoozesCheckedAt: number;
}


// The charts the Rivals page shows, with only the compared rivals' results, out of `allChartboards`: those compared,
//  the score cap's and the snoozed ones, and the levels they're at.
export function shownChartboards(allChartboards: Chartboard[],
  { rivals, soloPlayerId, countBy, npMinimalRivals, snoozes, snoozesCheckedAt }: ChartboardsSettings) {
  const hiddenPlayerIds = new Set(rivals.filter((r)  =>  r.hidden).map((r)  =>  r.id));
  // A solo player is compared alone, whatever the stored selection says.
  const isIncluded = (playerId: string)  =>  (soloPlayerId  ?  playerId === soloPlayerId  :  ! hiddenPlayerIds.has(playerId));
  // A solo player is the only one compared, so no unplayed chart could reach a higher minimum.
  const minNpRivals = (soloPlayerId  ?  MIN_NP_RIVALS  :  npMinimalRivals);
  const chartboards = allChartboards
    .map((cb)  =>  withRivalsOrNull(cb, (r)  =>  isIncluded(r.playerId)))
    .filter((cb): cb is Chartboard  =>  cb !== null)
    // Unplayed charts count as np only once enough shown rivals have played them.
    .filter((cb)  =>  ! cb.unplayed  ||  cb.rivals.length >= minNpRivals)
    .map((cb)  => {
      const until = snoozes.get(cb.id);
      return ((until !== undefined  &&  until > snoozesCheckedAt)  ?  { ...cb, snoozedUntil: until }  :  cb);
    });

  // Counted by results, the hidden charts keep only their hidden results.
  const hiddenResultsOrNull = (chartboard: Chartboard)  =>
    (countBy === 'charts'  ?  chartboard  :  withRivalsOrNull(chartboard, (r)  =>  resultTab(chartboard, r) === 'hidden'));

  // Charts the score cap hides, weighted by the real diffs so the closest calls come first; snoozed ones are only
  //  listed as snoozed, the soonest to wake first.
  const capHiddenChartboards = chartboards
    .filter((cb)  =>  cb.snoozedUntil === null  &&  (countBy === 'results'  ||  chartTier(cb) === 'hidden'))
    .map(hiddenResultsOrNull)
    .filter((cb): cb is Chartboard  =>  cb !== null)
    .map((cb)  =>  ({ ...cb, weight: targetWeight(cb.rivals.map((r)  =>  r.realDelta)) }));

  const snoozedChartboards = chartboards.filter((cb)  =>  cb.snoozedUntil !== null)
    .map(hiddenResultsOrNull)
    .filter((cb): cb is Chartboard  =>  cb !== null)
    .sort((a, b)  =>  a.snoozedUntil! - b.snoozedUntil!  ||  a.track.localeCompare(b.track));
  return { chartboards, capHiddenChartboards, snoozedChartboards, levels: sortedLevels(chartboards) };
}
