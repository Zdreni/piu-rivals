import type { PlayerSummary } from '@piu-rivals/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../session.tsx';
import { ChartCard, NONE_SHOWN, type ShownRows, tabFolding, useKeeps } from '../../components/charts/chart_card.tsx';
import { ChartCardsGrid } from '../../components/charts/chart_cards_grid.tsx';
import { buildCharts, type ChartRow } from '../../data/model.ts';
import { MAX_LEVEL, MIN_LEVEL } from '../../data/preferences.ts';
import { useAutoRefresh } from '../../data/use_auto_refresh.ts';
import { chartTier } from '../../data/stats.ts';
import { useBests } from '../../data/use_bests.ts';
import { useRivalSettings } from '../../data/use_rival_settings.ts';
import { StatusBar } from '../../components/status_bar.tsx';
import '../../score_views.css';

// The list shows this many days at first, and this many more with each click on its button.
const PAGE_DAYS = 30;

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// "YYYY-MM-DD" as e.g. "Sat, 24 Oct 2026", on that day wherever the browser is.
const dayTitle = (day: string | null)  =>  (day === null  ?  'Unknown day'  :  DAY_FORMAT.format(new Date(`${day}T00:00:00`)));


// Your best scores, of any level, as cards like in the Rivals view, by the day each was set, the latest first (then by
// track, as tries have no time of their own). Your row shows how much the best rose over your previous one. Your rivals switched on are compared on the cards, folded like in the tab of the chart's tier;
// snoozes don't apply. Each day is a folder, only the latest one unrolled at first.
function HistoryView({ me }: { me: PlayerSummary }) {
  const settings = useRivalSettings();
  const { rivals, preferences: { scoreCap } } = settings;
  const shownRivals = useMemo(()  =>  rivals.filter((r)  =>  ! r.hidden), [rivals]);
  const playerIds = useMemo(()  =>  [me.id, ...shownRivals.map((r)  =>  r.id)], [me.id, shownRivals]);
  const data = useBests(playerIds);
  const keep = useKeeps();
  const [shownDayCount, setShownDayCount] = useState(PAGE_DAYS);
  // By day, whether its cards were unrolled or rolled up by hand; the others are unrolled only on the latest day.
  const [unrolledByDay, setUnrolledByDay] = useState<Map<string | null, boolean>>(new Map());
  // By chart, how many of its folded scores were shown (see ChartCard).
  const [shownRowsByChart, setShownRowsByChart] = useState<Map<number, ShownRows>>(new Map());
  // The one result row or card header unrolled, as `${chart id} ${player id}` (or "me" for yours, "head" for the header).
  const [unrolledRowId, setUnrolledRowId] = useState<string | null>(null);

  useAutoRefresh(()  => {
    void settings.refresh();
    void data.sync();
  });

  const bests = useMemo(
    ()  =>  buildCharts(data.charts, data.bests, me.id, shownRivals.map((r)  =>  ({ id: r.id, name: r.name  ??  r.id })),
      scoreCap, { minLevel: MIN_LEVEL, maxLevel: MAX_LEVEL }, true)
      .filter((c)  =>  ! c.unplayed)
      .sort((a, b)  =>  (b.myDate  ??  '').localeCompare(a.myDate  ??  '')  ||  a.track.localeCompare(b.track)),
    [data.version, data.charts, data.bests, me.id, shownRivals, scoreCap],
  );

  const days = new Map<string | null, ChartRow[]>();
  for (const chart of bests)
    days.set(chart.myDate, [...days.get(chart.myDate)  ??  [], chart]);

  const latestDay = bests[0]?.myDate;
  const isUnrolled = (day: string | null)  =>  unrolledByDay.get(day)  ??  day === latestDay;

  const card = (chart: ChartRow)  =>  (
    <ChartCard
      key={chart.id}
      chart={chart}
      myName={me.name  ??  'You'}
      folding={tabFolding(chartTier(chart), keep)}
      shownRows={shownRowsByChart.get(chart.id)  ??  NONE_SHOWN}
      onShow={(more)  =>  setShownRowsByChart(new Map(shownRowsByChart).set(chart.id, more))}
      markTies={false}
      showGain
      scoreCap={scoreCap}
      canSnooze={false}
      now={0}
      menuOpen={false}
      leaving={false}
      unrolledRowId={(unrolledRowId?.startsWith(`${chart.id} `)  ?  unrolledRowId.slice(`${chart.id} `.length)  :  null)}
      onUnroll={(playerId)  =>  setUnrolledRowId((playerId === null  ?  null  :  `${chart.id} ${playerId}`))}
      onMenu={()  =>  {}}
      onSnooze={()  =>  {}}
      onWake={()  =>  {}}
    />
  );

  const error = settings.error  ??  (data.error  ?  `Couldn't load scores: ${data.error}`  :  null);
  const status = (error  ?  { text: error, error: true }  :  ! data.ready  ?  { text: 'Loading scores…', error: false }  :  null);

  return (
    <div className="rivals history">
      <StatusBar status={status} />
      <ChartCardsGrid
        emptyMessage={(bests.length  ?  null  :  data.ready  ?  'No scores of yours yet. They show up once you are scraped.'  :  'Loading scores…')}
        groups={[...days].slice(0, shownDayCount).map(([day, charts])  =>  ({
          key: day  ??  '',
          title: dayTitle(day),
          note: (charts.length === 1  ?  '1 result'  :  `${charts.length} results`),
          className: 'day',
          charts,
          unrolled: isUnrolled(day),
          onToggle: ()  =>  setUnrolledByDay(new Map(unrolledByDay).set(day, ! isUnrolled(day))),
        }))}
        card={card}
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
