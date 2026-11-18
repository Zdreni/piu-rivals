import type { Chart, Rival, SnoozeDays } from '@piu-rivals/shared';
import { useMemo } from 'react';
import { ChartCardMaximized } from '../../components/charts/chart_card_maximized.tsx';
import { useMobileView } from '../../components/media.ts';
import { foldChartboard } from '../../data/folded_chartboard.ts';
import { buildChartboards, type Chartboard, type PlayerBests } from '../../data/model.ts';
import type { CountBy, LevelRange } from '../../data/preferences.ts';
import { rivalsFolding } from '../../data/rivals_folding.ts';
import { chartTier } from '../../data/stats.ts';

// A Passes popup is no wider than a Rivals card, as the row it opens out of spans the whole results column.
const MAX_POPUP_WIDTH_PX = 440;


// The leaderboard of `chart`, with your best and those of the rivals switched on, and its snooze, or null when none of
//  you has played it.
export function passesChartboardOrNull(chart: Chart, myId: string, bests: Map<string, PlayerBests>, rivals: Rival[], scoreCap: number,
  levelRange: LevelRange, snoozes: Map<number, number>, snoozesCheckedAt: number): Chartboard | null {
  const shownRivals = rivals.filter((r)  =>  ! r.hidden).map((r)  =>  ({ id: r.id, name: r.name  ??  r.id }));
  const [chartboard] = buildChartboards(new Map([[chart.id, chart]]), bests, myId, shownRivals, scoreCap, levelRange, true);
  if (! chartboard)
    return null;

  const until = snoozes.get(chart.id);
  return ((until !== undefined  &&  until > snoozesCheckedAt)  ?  { ...chartboard, snoozedUntil: until }  :  chartboard);
}


// The Rivals page's maximized card of `chartboard`, opened from its row on the Passes page (`source`): coloured and
//  snoozed as in the Rivals tab it's in there.
export function PassesChartPopup({ chartboard, myName, scoreCap, countBy, snoozesCheckedAt, source, onClose, onSnooze }: {
  chartboard: Chartboard;
  myName: string;
  scoreCap: number;
  countBy: CountBy;
  snoozesCheckedAt: number;
  source: () => HTMLElement | null;
  onClose: () => void;
  onSnooze: (days: SnoozeDays | null) => void;
}) {
  const inMobileView = useMobileView();
  const tab = chartTier(chartboard, true);
  const foldedChartboard = useMemo(
    ()  =>  foldChartboard(chartboard, rivalsFolding(tab, { countBy, treatTieAsWin: true, inMobileView, maximized: true })),
    [chartboard, tab, countBy, inMobileView],
  );

  // As on the Rivals page: a hidden chart is hidden already, and counted by results, a snooze hides only losses and
  //  non-matches.
  const canSnooze = tab !== 'hidden'  &&  (countBy === 'charts'  ||  tab === 'rivals-win'  ||  tab === 'not-played');
  return (
    <ChartCardMaximized
      foldedChartboard={foldedChartboard}
      myName={myName}
      scoreCap={scoreCap}
      canSnooze={canSnooze}
      snoozesCheckedAt={snoozesCheckedAt}
      source={source}
      maxWidth={MAX_POPUP_WIDTH_PX}
      onClose={onClose}
      onSnooze={onSnooze}
    />
  );
}
