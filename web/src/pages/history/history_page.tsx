import type { PlayerSummary } from '@piu-rivals/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../session.tsx';
import { ChartCard } from '../../components/charts/chart_card.tsx';
import { ChartCardsGrid } from '../../components/charts/chart_cards_grid.tsx';
import { buildChartboards } from '../../data/model.ts';
import { MAX_LEVEL, MIN_LEVEL } from '../../data/preferences.ts';
import { foldChartboard, type FoldedChartboard, NO_UNFOLDED_RIVALS, type UnfoldedRivalCounts } from '../../data/folded_chartboard.ts';
import { historyRivalsFolding } from '../../data/rivals_folding.ts';
import { useAutoRefresh } from '../../data/use_auto_refresh.ts';
import { chartTier } from '../../data/stats.ts';
import { useBests } from '../../data/use_bests.ts';
import { useRivalSettings } from '../../data/use_rival_settings.ts';
import { StatusToast } from '../../components/status_toast.tsx';
import '../../score_views.css';

// The list shows this many days at first, and this many more with each click on its button.
const PAGE_DAYS = 30;

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// "YYYY-MM-DD" as e.g. "Sat, 24 Oct 2026", on that day wherever the browser is.
const dayTitle = (day: string | null)  =>  (day === null  ?  'Unknown day'  :  DAY_FORMAT.format(new Date(`${day}T00:00:00`)));


// Your best scores of any level as cards, by the day each was set, the latest first, compared with your shown rivals
//  (see historyRivalsFolding).
function HistoryView({ me }: { me: PlayerSummary }) {
  const settings = useRivalSettings();
  const { rivals, preferences: { scoreCap } } = settings;
  const shownRivals = useMemo(()  =>  rivals.filter((r)  =>  ! r.hidden), [rivals]);
  const playerIds = useMemo(()  =>  [me.id, ...shownRivals.map((r)  =>  r.id)], [me.id, shownRivals]);
  const data = useBests(playerIds);
  const [shownDayCount, setShownDayCount] = useState(PAGE_DAYS);
  // By day, whether its cards were unrolled or rolled up by hand; the others are unrolled only on the latest day.
  const [unrolledByDay, setUnrolledByDay] = useState<Map<string | null, boolean>>(new Map());
  // By chart, how many of its folded scores were shown (see ChartCard).
  const [unfoldedRivalCountsByChart, setUnfoldedRivalCountsByChart] = useState<Map<number, UnfoldedRivalCounts>>(new Map());
  // The one result row or card header unrolled, as `${chart id} ${player id}` (or "me" for yours, "head" for the header).
  const [unrolledRowId, setUnrolledRowId] = useState<string | null>(null);

  useAutoRefresh(()  => {
    void settings.refresh();
    void data.sync();
  });

  const chartboards = useMemo(
    ()  =>  buildChartboards(data.charts, data.bests, me.id, shownRivals.map((r)  =>  ({ id: r.id, name: r.name  ??  r.id })),
      scoreCap, { minLevel: MIN_LEVEL, maxLevel: MAX_LEVEL }, true)
      .filter((cb)  =>  ! cb.unplayed)
      .sort((a, b)  =>  (b.myDate  ??  '').localeCompare(a.myDate  ??  '')  ||  a.track.localeCompare(b.track)),
    [data.version, data.charts, data.bests, me.id, shownRivals, scoreCap],
  );

  // Your charts by the day you set your best on, folded for their cards.
  const days = useMemo(()  => {
    const foldedChartboardsByDay = new Map<string | null, FoldedChartboard[]>();
    for (const chartboard of chartboards) {
      const foldedChartboard = foldChartboard(chartboard, historyRivalsFolding(chartTier(chartboard)));
      foldedChartboardsByDay.set(chartboard.myDate, [...foldedChartboardsByDay.get(chartboard.myDate)  ??  [], foldedChartboard]);
    }

    return foldedChartboardsByDay;
  }, [chartboards]);

  const latestDay = chartboards[0]?.myDate;
  const isUnrolled = (day: string | null)  =>  unrolledByDay.get(day)  ??  day === latestDay;

  const renderCard = (foldedChartboard: FoldedChartboard)  => {
    const chartId = foldedChartboard.chartboard.id;
    return (
      <ChartCard
        key={chartId}
        foldedChartboard={foldedChartboard}
        myName={me.name  ??  'You'}
        unfoldedRivalCounts={unfoldedRivalCountsByChart.get(chartId)  ??  NO_UNFOLDED_RIVALS}
        onShow={(counts)  =>  setUnfoldedRivalCountsByChart(new Map(unfoldedRivalCountsByChart).set(chartId, counts))}
        showGain
        scoreCap={scoreCap}
        canSnooze={false}
        snoozesCheckedAt={0}
        menuIsOpen={false}
        leaving={false}
        unrolledRowId={(unrolledRowId?.startsWith(`${chartId} `)  ?  unrolledRowId.slice(`${chartId} `.length)  :  null)}
        onUnroll={(playerId)  =>  setUnrolledRowId((playerId === null  ?  null  :  `${chartId} ${playerId}`))}
        onMenu={()  =>  {}}
        onSnooze={()  =>  {}}
        onWake={()  =>  {}}
      />
    );
  };

  const error = settings.error  ??  (data.error  ?  `Couldn't load scores: ${data.error}`  :  null);
  const status = (error  ?  { text: error, error: true }  :  ! data.ready  ?  { text: 'Loading scores…', error: false }  :  null);

  return (
    <div className="rivals history">
      <StatusToast status={status} />
      <ChartCardsGrid
        emptyMessage={(chartboards.length  ?  null  :  data.ready  ?  'No scores of yours yet. They show up once you are scraped.'  :  'Loading scores…')}
        groups={[...days].slice(0, shownDayCount).map(([day, dayFoldedChartboards])  =>  ({
          key: day  ??  '',
          title: dayTitle(day),
          note: (dayFoldedChartboards.length === 1  ?  '1 result'  :  `${dayFoldedChartboards.length} results`),
          className: 'day',
          foldedChartboards: dayFoldedChartboards,
          unrolled: isUnrolled(day),
          onToggle: ()  =>  setUnrolledByDay(new Map(unrolledByDay).set(day, ! isUnrolled(day))),
        }))}
        renderCard={renderCard}
        footer={days.size > shownDayCount  &&  (
          <button className="show-more-charts" type="button" onClick={()  =>  setShownDayCount(shownDayCount + PAGE_DAYS)}>
            Show more · {days.size - shownDayCount} days left
          </button>
        )}
      />
    </div>
  );
}


export function HistoryPage() {
  const { status, me } = useSession();
  if (status === 'loading')
    return <p className="muted">Loading…</p>;

  if (! me)
    return <p>Sign in on the <Link to="/">home page</Link> to see your scores.</p>;

  if (! me.user.player)
    return <p className="muted">No PIU Scores player is linked to your account yet, so there are no scores of yours to show. Ask an admin to link yours.</p>;

  return <HistoryView me={me.user.player} />;
}
