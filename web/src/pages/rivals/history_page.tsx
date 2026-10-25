import type { PlayerSummary } from '@piu-rivals/shared';
import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../session.tsx';
import { tabFolding, useKeeps } from './chart_results.tsx';
import { ChartResultsItem } from './chart_results_item.tsx';
import { buildCharts, type ChartRow } from './model.ts';
import { MAX_LEVEL, MIN_LEVEL } from './preferences.ts';
import { useAutoRefresh } from './rivals_page.tsx';
import { chartTier } from './stats.ts';
import { useBests } from './use_bests.ts';
import { useRivalSettings } from './use_rival_settings.ts';
import { WindowHeader } from './window_header.tsx';
import './rivals.css';

// The list shows this many charts at first, and this many more with each click on its button.
const PAGE_CHARTS = 60;
// Each click on a card's fold button lists this many more of its scores.
const SHOW_STEP = 10;

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// "YYYY-MM-DD" as e.g. "Sat, 24 Oct 2026", on that day wherever the browser is.
const dayTitle = (day: string | null) => (day === null ? 'Unknown day' : DAY_FORMAT.format(new Date(`${day}T00:00:00`)));


// Your best scores, of any level, as cards like in the Rivals view, by the day each was set, the latest first (then by
// track, as tries have no time of their own). Your row shows how much the best rose over your previous one. Your rivals switched on are compared on the cards, folded like in the tab of the chart's tier;
// snoozes don't apply.
function HistoryView({ me }: { me: PlayerSummary }) {
  const settings = useRivalSettings();
  const { rivals, preferences: { scoreCap } } = settings;
  const shownRivals = useMemo(() => rivals.filter((rival) => ! rival.hidden), [rivals]);
  const playerIds = useMemo(() => [me.id, ...shownRivals.map((rival) => rival.id)], [me.id, shownRivals]);
  const data = useBests(playerIds);
  const keep = useKeeps();
  const [shown, setShown] = useState(PAGE_CHARTS);
  // By chart, how many of its folded rivals, and of its scores above the lowest ones, were shown.
  const [shownFolded, setShownFolded] = useState<Map<number, number>>(new Map());
  const [shownHigher, setShownHigher] = useState<Map<number, number>>(new Map());
  // The one result row or card header unrolled, as `${chart id} ${player id}` (or "me" for yours, "head" for the header).
  const [unrolled, setUnrolled] = useState<string | null>(null);

  useAutoRefresh(() => {
    void settings.refresh();
    void data.sync();
  });

  const bests = useMemo(
    () => buildCharts(data.charts, data.bests, me.id, shownRivals.map((rival) => ({ id: rival.id, name: rival.name  ??  rival.id })),
      scoreCap, { minLevel: MIN_LEVEL, maxLevel: MAX_LEVEL }, true)
      .filter((chart) => ! chart.unplayed)
      .sort((a, b) => (b.myDate  ??  '').localeCompare(a.myDate  ??  '')  ||  a.track.localeCompare(b.track)),
    [data.version, data.charts, data.bests, me.id, shownRivals, scoreCap],
  );

  const days = new Map<string | null, ChartRow[]>();
  for (const chart of bests.slice(0, shown))
    days.set(chart.myDate, [...days.get(chart.myDate)  ??  [], chart]);

  const showMore = (map: Map<number, number>, chartId: number) => new Map(map).set(chartId, (map.get(chartId)  ??  0) + SHOW_STEP);
  const card = (chart: ChartRow) => {
    const { fold, colorByRealDiff, keep: kept, dimWon } = tabFolding(chartTier(chart), keep);
    return (
      <ChartResultsItem
        key={chart.id}
        chart={chart}
        myName={me.name  ??  'You'}
        fold={fold}
        foldedShown={shownFolded.get(chart.id)  ??  0}
        keep={kept}
        higherShown={shownHigher.get(chart.id)  ??  0}
        colorByRealDiff={colorByRealDiff}
        dimWon={dimWon}
        markTies={false}
        showGain
        scoreCap={scoreCap}
        canSnooze={false}
        now={0}
        menuOpen={false}
        leaving={false}
        onExpandFolded={() => setShownFolded(showMore(shownFolded, chart.id))}
        onExpandHigher={() => setShownHigher(showMore(shownHigher, chart.id))}
        unrolled={unrolled?.startsWith(`${chart.id} `) ? unrolled.slice(`${chart.id} `.length) : null}
        onUnroll={(playerId) => setUnrolled(playerId === null ? null : `${chart.id} ${playerId}`)}
        onMenu={() => {}}
        onSnooze={() => {}}
        onWake={() => {}}
      />
    );
  };

  const error = settings.error  ??  (data.error ? `Couldn't load scores: ${data.error}` : null);
  const status = error ? { text: error, error: true } : ! data.ready ? { text: 'Loading scores…', error: false } : null;

  return (
    <div className="rivals history">
      <WindowHeader status={status} />
      <div className="dlg-body">
        {bests.length
          ? (
            <div className="chart-grid">
              {[...days].map(([day, charts]) => (
                <Fragment key={day  ??  ''}>
                  <h3 className="group-title day">{dayTitle(day)} · {charts.length}</h3>
                  {charts.map(card)}
                </Fragment>
              ))}
              {bests.length > shown  &&  (
                <button className="show-more-charts" type="button" onClick={() => setShown(shown + PAGE_CHARTS)}>
                  Show more · {bests.length - shown} left
                </button>
              )}
            </div>
          )
          : <div className="empty">{data.ready ? 'No scores of yours yet. They show up once you are scraped.' : 'Loading scores…'}</div>}
      </div>
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
