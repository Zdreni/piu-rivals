import type { PlayerSummary } from '@piu-rivals/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../session.tsx';
import { ChartCard, NONE_SHOWN, type Shown, tabFolding, useKeeps } from '../../components/charts/chart_card.tsx';
import { ChartCardsGrid } from '../../components/charts/chart_cards_grid.tsx';
import { buildCharts, type ChartRow } from '../../data/model.ts';
import { MAX_LEVEL, MIN_LEVEL } from '../../data/preferences.ts';
import { useAutoRefresh } from '../../data/use_auto_refresh.ts';
import { chartTier } from '../../data/stats.ts';
import { useBests } from '../../data/use_bests.ts';
import { useRivalSettings } from '../../data/use_rival_settings.ts';
import { StatusBar } from '../../components/status_bar.tsx';
import '../../score_views.css';

// The list shows this many charts at first, and this many more with each click on its button.
const PAGE_CHARTS = 60;

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// "YYYY-MM-DD" as e.g. "Sat, 24 Oct 2026", on that day wherever the browser is.
const dayTitle = (day: string | null)  =>  (day === null  ?  'Unknown day'  :  DAY_FORMAT.format(new Date(`${day}T00:00:00`)));


// Your best scores, of any level, as cards like in the Rivals view, by the day each was set, the latest first (then by
// track, as tries have no time of their own). Your row shows how much the best rose over your previous one. Your rivals switched on are compared on the cards, folded like in the tab of the chart's tier;
// snoozes don't apply.
function HistoryView({ me }: { me: PlayerSummary }) {
  const settings = useRivalSettings();
  const { rivals, preferences: { scoreCap } } = settings;
  const shownRivals = useMemo(()  =>  rivals.filter((r)  =>  ! r.hidden), [rivals]);
  const playerIds = useMemo(()  =>  [me.id, ...shownRivals.map((r)  =>  r.id)], [me.id, shownRivals]);
  const data = useBests(playerIds);
  const keep = useKeeps();
  const [shown, setShown] = useState(PAGE_CHARTS);
  // By chart, how many of its folded scores were shown (see ChartCard).
  const [shownScores, setShownScores] = useState<Map<number, Shown>>(new Map());
  // The one result row or card header unrolled, as `${chart id} ${player id}` (or "me" for yours, "head" for the header).
  const [unrolled, setUnrolled] = useState<string | null>(null);

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
  for (const chart of bests.slice(0, shown))
    days.set(chart.myDate, [...days.get(chart.myDate)  ??  [], chart]);

  const card = (chart: ChartRow)  =>  (
    <ChartCard
      key={chart.id}
      chart={chart}
      myName={me.name  ??  'You'}
      folding={tabFolding(chartTier(chart), keep)}
      shown={shownScores.get(chart.id)  ??  NONE_SHOWN}
      onShow={(more)  =>  setShownScores(new Map(shownScores).set(chart.id, more))}
      markTies={false}
      showGain
      scoreCap={scoreCap}
      canSnooze={false}
      now={0}
      menuOpen={false}
      leaving={false}
      unrolled={(unrolled?.startsWith(`${chart.id} `)  ?  unrolled.slice(`${chart.id} `.length)  :  null)}
      onUnroll={(playerId)  =>  setUnrolled((playerId === null  ?  null  :  `${chart.id} ${playerId}`))}
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
        empty={(bests.length  ?  null  :  data.ready  ?  'No scores of yours yet. They show up once you are scraped.'  :  'Loading scores…')}
        groups={[...days].map(([day, charts])  =>  ({ key: day  ??  '', title: `${dayTitle(day)} · ${charts.length}`, className: 'day', charts }))}
        card={card}
        footer={bests.length > shown  &&  (
          <button className="show-more-charts" type="button" onClick={()  =>  setShown(shown + PAGE_CHARTS)}>
            Show more · {bests.length - shown} left
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
