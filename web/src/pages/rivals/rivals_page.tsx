import type { PlayerSummary } from '@piu-rivals/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../session.tsx';
import { ChartResults } from './chart_results.tsx';
import { ChartsGroups } from './charts_groups.tsx';
import { buildCharts, byTargetWeight, type ChartRow, targetWeight, withRivals } from './model.ts';
import { RivalList } from './rival_list.tsx';
import { chartTier, countCharts, sortedLevels, type TabId } from './stats.ts';
import { readUiState, saveUiState, type UiState } from './ui_state.ts';
import { useBests } from './use_bests.ts';
import { useRivalSettings } from './use_rival_settings.ts';
import { WindowHeader } from './window_header.tsx';
import './rivals.css';

// While the page is visible, scores and the rival list are loaded again every few minutes, and when the page
// comes back into view after a while.
const REFRESH_MS = 5 * 60 * 1000;
const RETURN_REFRESH_MS = 60 * 1000;


function useAutoRefresh(refresh: () => void) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    let last = Date.now();
    const run = () => {
      last = Date.now();
      latest.current();
    };

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible')
        run();
    }, REFRESH_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible'  &&  Date.now() - last > RETURN_REFRESH_MS)
        run();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}


function RivalsView({ me }: { me: PlayerSummary }) {
  const settings = useRivalSettings();
  const { rivals, preferences } = settings;
  const { scoreCap, npMinimalRivals } = preferences;
  const playerIds = useMemo(() => [me.id, ...rivals.map((rival) => rival.id)], [me.id, rivals]);
  const data = useBests(playerIds);
  const [ui, setUi] = useState<UiState>(readUiState);
  const [focused, setFocused] = useState<string | null>(null);
  // While set, only you and this rival are compared. Kept in memory only, and only while that rival stays focused.
  const [solo, setSolo] = useState<string | null>(null);

  useAutoRefresh(() => {
    void settings.refresh();
    void data.sync();
  });

  const changeUi = useCallback((changes: Partial<UiState>) => {
    setUi((current) => {
      const next = { ...current, ...changes };
      saveUiState(next);
      return next;
    });
  }, []);

  const selectTab = useCallback((tab: TabId) => changeUi({ selectedTab: tab }), [changeUi]);

  const focus = (playerId: string | null) => {
    setFocused(playerId);
    if (solo !== playerId)
      setSolo(null);
  };

  const allCharts = useMemo(
    () => buildCharts(data.charts, data.bests, me.id, rivals.map((rival) => ({ id: rival.id, name: rival.name  ??  rival.id })), scoreCap),
    [data.version, data.charts, data.bests, me.id, rivals, scoreCap],
  );

  const soloRival = rivals.some((rival) => rival.id === solo) ? solo : null;
  // A solo rival is always counted by results, whatever the setting says.
  const countBy = soloRival ? 'results' : preferences.countBy;
  const view = useMemo(() => {
    const hidden = new Set(rivals.filter((rival) => rival.hidden).map((rival) => rival.id));
    // A solo rival is compared alone, whatever the stored selection says.
    const included = (playerId: string) => (soloRival ? playerId === soloRival : ! hidden.has(playerId));
    const charts = allCharts
      .map((chart) => withRivals(chart, (rival) => included(rival.playerId)))
      .filter((chart): chart is ChartRow => chart !== null)
      // Unplayed charts count as np only once enough shown rivals have played them.
      .filter((chart) => ! chart.unplayed  ||  chart.rivals.length >= npMinimalRivals);

    // Charts the score cap hides, weighted by the real diffs so the closest calls come first.
    const capHidden = charts.filter((chart) => chartTier(chart) === 'hidden')
      .map((chart) => ({ ...chart, weight: targetWeight(chart.rivals.map((rival) => rival.realDelta)) }));
    return { charts, capHidden, levels: sortedLevels(charts) };
  }, [allCharts, rivals, soloRival, npMinimalRivals]);

  const { charts, capHidden, levels } = view;
  const selectedLevel = ui.selectedLevel !== null  &&  levels.includes(ui.selectedLevel) ? ui.selectedLevel : levels[0]  ??  null;

  useEffect(() => {
    if (levels.length  &&  selectedLevel !== ui.selectedLevel)
      changeUi({ selectedLevel });
  }, [levels.length, selectedLevel, ui.selectedLevel, changeUi]);

  const totals = countCharts(charts, countBy);
  const atLevel = (chart: ChartRow) => chart.chart === selectedLevel;
  const emptyMessage = ! rivals.length
    ? 'Add rivals on the Others tab on the left to compare your scores with theirs.'
    : ! data.ready
      ? 'Loading scores…'
      : ! allCharts.length
        ? 'No scores for your rivals yet. They show up once your rivals are scraped.'
        : ! charts.length
          ? 'No charts for the selected rivals — check some rivals on the left.'
          : null;

  const error = settings.error  ??  (data.error ? `Couldn't load scores: ${data.error}` : null);
  const status = error ? { text: error, error: true } : ! data.ready ? { text: 'Loading scores…', error: false } : null;

  return (
    <div className="rivals">
      <WindowHeader
        totals={totals}
        preferences={preferences}
        solo={!! soloRival}
        status={status}
        onChange={settings.changePreferences}
      />
      <div className="dlg-main">
        <RivalList
          tab={ui.rivalTab}
          charts={allCharts}
          me={me}
          rivals={rivals}
          bests={data.bests}
          focused={focused}
          solo={soloRival}
          // In solo mode the solo rival's stats are the header's, with all the settings applied.
          soloStats={soloRival ? totals : null}
          countBy={countBy}
          onTab={(rivalTab) => changeUi({ rivalTab })}
          onFocus={focus}
          onSolo={setSolo}
          onToggle={(playerId, on) => settings.setRivalHidden(playerId, ! on)}
          onRemove={settings.removeRival}
          onAdd={settings.addRival}
        />
        <ChartsGroups
          charts={charts}
          selectedLevel={selectedLevel}
          countBy={countBy}
          showTies={!! soloRival}
          onSelect={(level) => changeUi({ selectedLevel: level })}
        />
        <ChartResults
          levelCharts={charts.filter(atLevel)}
          hiddenGroups={[{ label: 'Score cap', charts: capHidden.filter(atLevel).sort(byTargetWeight) }]}
          selectedTab={ui.selectedTab}
          myName={me.name  ??  'You'}
          emptyMessage={emptyMessage}
          countBy={countBy}
          ties={!! soloRival}
          scoreCap={scoreCap}
          onSelectTab={selectTab}
        />
      </div>
    </div>
  );
}


export function RivalsPage() {
  const { status, me } = useSession();
  if (status === 'loading')
    return <p className="muted">Loading…</p>;

  if (! me)
    return <p>Sign in on the <Link to="/">home page</Link> to see your rivals.</p>;

  if (! me.user.player)
    return <p className="muted">No PIU Scores player is linked to your account yet, so there's no Rivals view for you. Ask an admin to link yours.</p>;

  return <RivalsView me={me.user.player} />;
}
