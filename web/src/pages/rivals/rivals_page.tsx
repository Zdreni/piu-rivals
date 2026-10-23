import type { PlayerSummary } from '@piu-rivals/shared';
import { type MouseEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../session.tsx';
import { ChartResults } from './chart_results.tsx';
import { ChartsGroups } from './charts_groups.tsx';
import { PHONE, type SidePanel } from './layout.ts';
import { autoLevels, type Preferences, resolveLevels } from './preferences.ts';
import { buildCharts, byTargetWeight, type ChartRow, targetWeight, withRivals } from './model.ts';
import { RivalList } from './rival_list.tsx';
import { chartTier, countCharts, levelStats, sortedLevels, type TabId } from './stats.ts';
import { readUiState, saveUiState, type UiState } from './ui_state.ts';
import { useBests } from './use_bests.ts';
import { useRivalSettings } from './use_rival_settings.ts';
import { PreferenceControls, WindowHeader } from './window_header.tsx';
import './rivals.css';

// While the page is visible, scores and the rival list are loaded again every few minutes, and when the page
// comes back into view after a while.
const REFRESH_MS = 5 * 60 * 1000;
const RETURN_REFRESH_MS = 60 * 1000;
// While the levels are dimmed, a double tap or a long press on them brings them into use; in use, a double tap dims them.
const DOUBLE_TAP_MS = 350;
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;


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
  // Until the level range is set, it follows your scores; see below.
  const autoRange = useMemo(() => {
    const charts = [...data.bests.get(me.id)?.keys()  ??  []].map((chartId) => data.charts.get(chartId));
    return autoLevels(charts.flatMap((chart) => (chart ? [chart.level] : [])));
  }, [data.version, data.charts, data.bests, me.id]);
  const levelRange = resolveLevels(preferences, autoRange);
  const { minLevel, maxLevel } = levelRange;
  // The first time your scores are in, the level range they give is saved, so it doesn't move later without you changing
  // it. Once a page: if saving fails, it isn't tried again until the page is opened again. With no scores yet, the range
  // isn't saved and stays at its default.
  const levelsSaved = useRef(false);
  useEffect(() => {
    if (levelsSaved.current  ||  ! data.ready  ||  ! data.bests.get(me.id)?.size)
      return;

    levelsSaved.current = true;
    const changes: Partial<Preferences> = {};
    if (preferences.minLevel === null)
      changes.minLevel = minLevel;
    if (preferences.maxLevel === null)
      changes.maxLevel = maxLevel;
    if (Object.keys(changes).length)
      settings.changePreferences(changes);
  }, [data.ready, data.version, me.id, preferences.minLevel, preferences.maxLevel, minLevel, maxLevel]);
  const [ui, setUi] = useState<UiState>(readUiState);
  const [focused, setFocused] = useState<string | null>(null);
  // While set, only you and this rival are compared. Kept in memory only, and only while that rival stays focused.
  const [solo, setSolo] = useState<string | null>(null);
  // On phones, the panel in use is the wide one. A tap on the dimmed results only brings them into use, so they can't
  // open a link while they're still moving. A tap on the dimmed levels still picks a level, and the results stay in
  // use; a tap on the level already picked, a double tap or a long press brings the levels into use. In use, a tap on
  // the level already picked or a double tap gives the room back to the results.
  const [levelsActive, setLevelsActive] = useState(false);
  // The rivals and the preferences wait off the left edge until the levels' top bar slides one of them in. The last one
  // in stays shown while it slides out. On phones, while one is in, a tap on the levels only slides it out.
  const [sideOpen, setSideOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>('rivals');
  const levelsActiveBeforeSide = useRef(false);
  const lastLevelsTap = useRef(0);
  const longPress = useRef<{ timer: number; x: number; y: number } | null>(null);
  // Set once a long press has brought the levels into use, so the click that ends it does nothing more.
  const longPressed = useRef(false);

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

  const activatePanel = (event: MouseEvent) => {
    const target = event.target as Element;
    const levels = !! target.closest('.filters');
    if (longPressed.current) {
      longPressed.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (sideOpen  &&  PHONE.matches  &&  levels  &&  ! target.closest('.panel-toggle')) {
      event.preventDefault();
      event.stopPropagation();
      toggleSide(sidePanel);
      return;
    }
    if (! PHONE.matches  ||  target.closest('.panel-toggle'))
      return;

    // A tap that switches the levels doesn't start a double tap, so a double tap on the level picked switches them once.
    if (levels) {
      const now = event.timeStamp;
      const doubleTap = now - lastLevelsTap.current < DOUBLE_TAP_MS;
      const switches = doubleTap  ||  !! target.closest('.level-bar.on');
      lastLevelsTap.current = switches ? 0 : now;
      if (switches)
        setLevelsActive(! levelsActive);
      return;
    }
    if (! levelsActive  ||  ! target.closest('.score-content'))
      return;

    event.preventDefault();
    event.stopPropagation();
    setLevelsActive(false);
  };

  const cancelLongPress = () => {
    if (longPress.current)
      clearTimeout(longPress.current.timer);
    longPress.current = null;
  };

  const startLongPress = (event: PointerEvent) => {
    cancelLongPress();
    longPressed.current = false;
    const target = event.target as Element;
    if (! PHONE.matches  ||  levelsActive  ||  sideOpen  ||  ! target.closest('.filters')  ||  target.closest('.panel-toggle'))
      return;

    const timer = window.setTimeout(() => {
      longPress.current = null;
      longPressed.current = true;
      setLevelsActive(true);
    }, LONG_PRESS_MS);
    longPress.current = { timer, x: event.clientX, y: event.clientY };
  };

  // A press that moves, e.g. to scroll the levels, isn't a long press.
  const moveLongPress = (event: PointerEvent) => {
    const press = longPress.current;
    if (press  &&  Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_SLOP_PX)
      cancelLongPress();
  };

  // The side panels come in beside the levels out of use; once they're gone, the levels are back in the state they
  // were in. The other panel's button swaps the panels in place.
  const toggleSide = (panel: SidePanel) => {
    if (sideOpen  &&  panel !== sidePanel) {
      setSidePanel(panel);
      return;
    }
    if (sideOpen) {
      setLevelsActive(levelsActiveBeforeSide.current);
      setSideOpen(false);
      return;
    }

    levelsActiveBeforeSide.current = levelsActive;
    setLevelsActive(false);
    if (panel === sidePanel) {
      setSideOpen(true);
      return;
    }

    // The other panel takes the last one's place off the edge first, and slides in from there once it's laid out.
    setSidePanel(panel);
    requestAnimationFrame(() => requestAnimationFrame(() => setSideOpen(true)));
  };

  const focus = (playerId: string | null) => {
    setFocused(playerId);
    if (solo !== playerId)
      setSolo(null);
  };

  const allCharts = useMemo(
    () => buildCharts(data.charts, data.bests, me.id, rivals.map((rival) => ({ id: rival.id, name: rival.name  ??  rival.id })), scoreCap,
      { minLevel, maxLevel }),
    [data.version, data.charts, data.bests, me.id, rivals, scoreCap, minLevel, maxLevel],
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
  const myStats = levelStats(charts);
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
      <WindowHeader status={status} />
      <div
        className={`dlg-main${levelsActive ? ' levels-active' : ''}${sideOpen ? ' side-open' : ''}${sidePanel === 'preferences' ? ' side-preferences' : ''}`}
        onClickCapture={activatePanel}
        onPointerDownCapture={startLongPress}
        onPointerMoveCapture={moveLongPress}
        onPointerUpCapture={cancelLongPress}
        onPointerCancelCapture={cancelLongPress}
        onContextMenu={(event) => {
          if (PHONE.matches  &&  (event.target as Element).closest('.filters'))
            event.preventDefault();
        }}
      >
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
          myStats={myStats}
          countBy={countBy}
          onTab={(rivalTab) => changeUi({ rivalTab })}
          onFocus={focus}
          onSolo={setSolo}
          onToggle={(playerId, on) => settings.setRivalHidden(playerId, ! on)}
          onRemove={settings.removeRival}
          onAdd={settings.addRival}
        />
        <div className="prefs-panel" aria-label="Preferences">
          <div className="prefs-top">Preferences</div>
          <div className="prefs-controls">
            <PreferenceControls preferences={preferences} levels={levelRange} solo={!! soloRival} onChange={settings.changePreferences} />
          </div>
        </div>
        <ChartsGroups
          charts={charts}
          selectedLevel={selectedLevel}
          countBy={countBy}
          showTies={!! soloRival}
          sidePanel={sideOpen ? sidePanel : null}
          onSelect={(level) => changeUi({ selectedLevel: level })}
          onToggleSide={toggleSide}
        />
        <ChartResults
          // Another level starts with every card folded again.
          key={selectedLevel}
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
