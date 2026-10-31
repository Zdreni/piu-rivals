import type { PlayerSummary } from '@piu-rivals/shared';
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../session.tsx';
import { ChartsGroups } from './charts_groups.tsx';
import { PHONE } from '../../components/media.ts';
import type { SidePanel } from './layout.ts';
import { SelectedLevelCharts } from './selected_level_charts.tsx';
import { autoLevels, type Preferences, resolveLevels } from '../../data/preferences.ts';
import { buildCharts, byTargetWeight, type ChartRow, targetWeight, withRivalsOrNull } from '../../data/model.ts';
import { PreferencesPanel } from './preferences_panel.tsx';
import { RivalList } from './rival_list.tsx';
import { chartTier, countCharts, levelStats, resultTab, sortedLevels, type TabId } from '../../data/stats.ts';
import { readUiState, saveUiState, type UiState } from './ui_state.ts';
import { useAutoRefresh } from '../../data/use_auto_refresh.ts';
import { useBests } from '../../data/use_bests.ts';
import { useRivalSettings } from '../../data/use_rival_settings.ts';
import { StatusBar } from '../../components/status_bar.tsx';
import '../../score_views.css';

// While charts are snoozed, the time is checked this often, to wake them and count down the time they have left.
const SNOOZE_TICK_MS = 60 * 1000;


// The time now, in ms since epoch, updated every SNOOZE_TICK_MS while `ticking`.
function useClock(ticking: boolean) {
  const [now, setNow] = useState(Date.now);

  useEffect(()  => {
    if (! ticking)
      return;

    setNow(Date.now());

    const timer = setInterval(()  =>  setNow(Date.now()), SNOOZE_TICK_MS);
    return ()  =>  clearInterval(timer);
  }, [ticking]);

  return now;
}


function RivalsView({ me }: { me: PlayerSummary }) {
  // While set, only you and this rival are compared. Kept in memory only, and only while that rival stays focused and
  // is one of your rivals.
  const [soloRivalId, setSoloRivalId] = useState<string | null>(null);
  // A rival list from the server without the solo rival (removed on another device, or a failed add) ends solo mode.
  const settings = useRivalSettings((rivals)  =>
    setSoloRivalId((playerId)  =>  (rivals.some((r)  =>  r.id === playerId)  ?  playerId  :  null)));
  const { rivals, preferences, snoozes } = settings;
  const now = useClock(snoozes.size > 0);
  const { scoreCap, npMinimalRivals } = preferences;
  const playerIds = useMemo(()  =>  [me.id, ...rivals.map((r)  =>  r.id)], [me.id, rivals]);
  const data = useBests(playerIds);
  // Until the level range is set, it follows your scores; see below.
  const autoRange = useMemo(()  => {
    const charts = [...data.bests.get(me.id)?.keys()  ??  []].map((chartId)  =>  data.charts.get(chartId));
    return autoLevels(charts.flatMap((c)  =>  (c  ?  [c.level]  :  [])));
  }, [data.version, data.charts, data.bests, me.id]);

  const levelRange = resolveLevels(preferences, autoRange);
  const { minLevel, maxLevel } = levelRange;
  // The first time your scores are in, the level range they give is saved, so it doesn't move later without you changing
  // it. Once a page: if saving fails, it isn't tried again until the page is opened again. With no scores yet, the range
  // isn't saved and stays at its default.
  const levelsSaved = useRef(false);

  useEffect(()  => {
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
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(null);
  // The rivals and the preferences wait off the left edge until the levels' top bar slides one of them in. The last one
  // in stays shown while it slides out. On phones, while one is in, a tap on the levels only slides it out.
  const [sideOpen, setSideOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>('rivals');

  useAutoRefresh(()  => {
    void settings.refresh();
    void data.sync();
  });

  const changeUi = useCallback((changes: Partial<UiState>)  => {
    setUi((current)  => {
      const nextUi = { ...current, ...changes };
      saveUiState(nextUi);
      return nextUi;
    });
  }, []);

  const selectTab = useCallback((tab: TabId)  =>  changeUi({ selectedTab: tab }), [changeUi]);

  // The back button slides a side panel out rather than leaving the page: sliding one in adds a step to the browser's
  // history, which sliding it out any other way takes back. A maximized card opened over it adds its own step on top
  // (see ChartCardMaximized), and going back from that one leaves the panel in.
  const sideOpenRef = useRef(sideOpen);
  sideOpenRef.current = sideOpen;

  useEffect(()  => {
    if (! sideOpen)
      return;

    if (! window.history.state?.sideOpen)
      window.history.pushState({ ...window.history.state, sideOpen: true }, '');

    const back = ()  =>  ! window.history.state?.sideOpen  &&  setSideOpen(false);
    window.addEventListener('popstate', back);
    return ()  => {
      window.removeEventListener('popstate', back);
      // A moment later, so a panel slid in again at once (as React's strict mode does) keeps its step.
      window.setTimeout(()  =>  ! sideOpenRef.current  &&  window.history.state?.sideOpen  &&  window.history.back());
    };
  }, [sideOpen]);

  // On phones, while a side panel is in, a tap on the levels (but on their top bar's buttons) slides it out; a tap on a
  // bar selects its level too.
  const closeSideOnLevels = (event: MouseEvent)  => {
    const target = event.target as Element;
    if (! sideOpen  ||  ! PHONE.matches  ||  ! target.closest('.filters')  ||  target.closest('.panel-toggle'))
      return;

    if (! target.closest('.level-bar')) {
      event.preventDefault();
      event.stopPropagation();
    }

    toggleSide(sidePanel);
  };

  // The other panel's button swaps the panels in place.
  const toggleSide = (panel: SidePanel)  => {
    if (sideOpen  &&  panel !== sidePanel) {
      setSidePanel(panel);
      return;
    }

    if (sideOpen) {
      setSideOpen(false);
      return;
    }

    if (panel === sidePanel) {
      setSideOpen(true);
      return;
    }

    // The other panel takes the last one's place off the edge first, and slides in from there once it's laid out.
    setSidePanel(panel);
    requestAnimationFrame(()  =>  requestAnimationFrame(()  =>  setSideOpen(true)));
  };

  const focus = (playerId: string | null)  => {
    setFocusedPlayerId(playerId);
    if (soloRivalId !== playerId)
      setSoloRivalId(null);
  };

  // Removing the solo rival ends solo mode.
  const removeRival = (playerId: string)  => {
    if (soloRivalId === playerId)
      setSoloRivalId(null);

    settings.removeRival(playerId);
  };

  const allCharts = useMemo(
    ()  =>  buildCharts(data.charts, data.bests, me.id, rivals.map((r)  =>  ({ id: r.id, name: r.name  ??  r.id })), scoreCap,
      { minLevel, maxLevel }),
    [data.version, data.charts, data.bests, me.id, rivals, scoreCap, minLevel, maxLevel],
  );

  // A solo rival is always counted by results, whatever the setting says.
  const countBy = (soloRivalId  ?  'results'  :  preferences.countBy);
  const view = useMemo(()  => {
    const hiddenPlayerIds = new Set(rivals.filter((r)  =>  r.hidden).map((r)  =>  r.id));
    // A solo rival is compared alone, whatever the stored selection says.
    const isIncluded = (playerId: string)  =>  (soloRivalId  ?  playerId === soloRivalId  :  ! hiddenPlayerIds.has(playerId));
    const charts = allCharts
      .map((c)  =>  withRivalsOrNull(c, (r)  =>  isIncluded(r.playerId)))
      .filter((c): c is ChartRow  =>  c !== null)
      // Unplayed charts count as np only once enough shown rivals have played them.
      .filter((c)  =>  ! c.unplayed  ||  c.rivals.length >= npMinimalRivals)
      .map((c)  => {
        const until = snoozes.get(c.id);
        return ((until !== undefined  &&  until > now)  ?  { ...c, snoozedUntil: until }  :  c);
      });

    // Counted by results, the hidden charts keep only their hidden results.
    const hiddenResultsOrNull = (chart: ChartRow)  =>
      (countBy === 'charts'  ?  chart  :  withRivalsOrNull(chart, (r)  =>  resultTab(chart, r) === 'hidden'));

    // Charts the score cap hides, weighted by the real diffs so the closest calls come first; snoozed ones are only
    // listed as snoozed, the soonest to wake first.
    const capHiddenCharts = charts
      .filter((c)  =>  c.snoozedUntil === null  &&  (countBy === 'results'  ||  chartTier(c) === 'hidden'))
      .map(hiddenResultsOrNull)
      .filter((c): c is ChartRow  =>  c !== null)
      .map((c)  =>  ({ ...c, weight: targetWeight(c.rivals.map((r)  =>  r.realDelta)) }));

    const snoozedCharts = charts.filter((c)  =>  c.snoozedUntil !== null)
      .map(hiddenResultsOrNull)
      .filter((c): c is ChartRow  =>  c !== null)
      .sort((a, b)  =>  a.snoozedUntil! - b.snoozedUntil!  ||  a.track.localeCompare(b.track));
    return { charts, capHiddenCharts, snoozedCharts, levels: sortedLevels(charts) };
  }, [allCharts, rivals, soloRivalId, countBy, npMinimalRivals, snoozes, now]);

  const { charts, capHiddenCharts, snoozedCharts, levels } = view;
  const selectedLevel = ((ui.selectedLevel !== null  &&  levels.includes(ui.selectedLevel))  ?  ui.selectedLevel  :  levels[0]  ??  null);

  useEffect(()  => {
    if (levels.length  &&  selectedLevel !== ui.selectedLevel)
      changeUi({ selectedLevel });
  }, [levels.length, selectedLevel, ui.selectedLevel, changeUi]);

  const totals = countCharts(charts, countBy, !! soloRivalId);
  const myStats = levelStats(charts, !! soloRivalId);
  const atLevel = (chart: ChartRow)  =>  chart.chart === selectedLevel;
  const emptyMessage = (! rivals.length
    ?  'Add rivals on the Others tab on the left to compare your scores with theirs.'
    :  ! data.ready
      ?  'Loading scores…'
      :  ! allCharts.length
        ?  'No scores for your rivals yet. They show up once your rivals are scraped.'
        :  ! charts.length
          ?  'No charts for the selected rivals — check some rivals on the left.'
          :  null);

  const error = settings.error  ??  (data.error  ?  `Couldn't load scores: ${data.error}`  :  null);
  const status = (error  ?  { text: error, error: true }  :  ! data.ready  ?  { text: 'Loading scores…', error: false }  :  null);

  return (
    <div className="rivals">
      <StatusBar status={status} />
      <div
        className={`dlg-main${(sideOpen  ?  ' side-open'  :  '')}${(sidePanel === 'preferences'  ?  ' side-preferences'  :  '')}`}
        onClickCapture={closeSideOnLevels}
      >
        <RivalList
          tab={ui.rivalTab}
          charts={allCharts}
          me={me}
          rivals={rivals}
          bests={data.bests}
          focusedPlayerId={focusedPlayerId}
          soloRivalId={soloRivalId}
          // In solo mode the solo rival's stats are the header's, with all the settings applied.
          soloStats={(soloRivalId  ?  totals  :  null)}
          myStats={myStats}
          countBy={countBy}
          onTab={(rivalTab)  =>  changeUi({ rivalTab })}
          onFocus={focus}
          onSolo={setSoloRivalId}
          onToggle={(playerId, on)  =>  settings.setRivalHidden(playerId, ! on)}
          onRemove={removeRival}
          onAdd={settings.addRival}
        />
        <PreferencesPanel preferences={preferences} levels={levelRange} solo={!! soloRivalId} onChange={settings.changePreferences} />
        <ChartsGroups
          charts={charts}
          selectedLevel={selectedLevel}
          countBy={countBy}
          showTies={!! soloRivalId}
          sidePanel={(sideOpen  ?  sidePanel  :  null)}
          onSelect={(level)  =>  changeUi({ selectedLevel: level })}
          onToggleSide={toggleSide}
        />
        <SelectedLevelCharts
          // Another level starts with every card folded again.
          key={selectedLevel}
          levelCharts={charts.filter(atLevel)}
          hiddenGroups={[
            { label: 'Snoozed', charts: snoozedCharts.filter(atLevel) },
            { label: 'Score cap', charts: capHiddenCharts.filter(atLevel).sort(byTargetWeight) },
          ]}
          selectedTab={ui.selectedTab}
          myName={me.name  ??  'You'}
          emptyMessage={emptyMessage}
          countBy={countBy}
          ties={!! soloRivalId}
          scoreCap={scoreCap}
          now={now}
          onSelectTab={selectTab}
          onSnooze={settings.snooze}
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
