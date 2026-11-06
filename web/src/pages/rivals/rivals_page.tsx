import type { PlayerSummary } from '@piu-rivals/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../session.tsx';
import { ChartsGroups } from './charts_groups.tsx';
import { SelectedLevelCharts } from './selected_level_charts.tsx';
import { useSidePanel } from './side_panel_control.ts';
import { autoLevels, type Preferences, resolveLevels } from '../../data/preferences.ts';
import { buildChartboards, byTargetWeight, type Chartboard } from '../../data/model.ts';
import { shownChartboards } from '../../data/shown_chartboards.ts';
import { PreferencesPanel } from './preferences_panel.tsx';
import { RivalList } from './rival_list.tsx';
import { countCharts, levelStats, type TabId } from '../../data/stats.ts';
import { readUiState, type RivalTab, saveUiState, type UiState } from './ui_state.ts';
import { useAutoRefresh } from '../../data/use_auto_refresh.ts';
import { useBests } from '../../data/use_bests.ts';
import { useOtherBests, usePlayers, withSoloPlayer } from '../../data/other_players.ts';
import { useRivalSettings } from '../../data/use_rival_settings.ts';
import { StatusToast } from '../../components/status_toast.tsx';
import '../../score_views.css';


function RivalsView({ me }: { me: PlayerSummary }) {
  const settings = useRivalSettings();
  const { rivals, preferences, snoozes } = settings;
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
  //  it. Once a page: if saving fails, it isn't tried again until the page is opened again. With no scores yet, the range
  //  isn't saved and stays at its default.
  const levelsWereSaved = useRef(false);

  useEffect(()  => {
    if (levelsWereSaved.current  ||  ! data.ready  ||  ! data.bests.get(me.id)?.size)
      return;

    levelsWereSaved.current = true;

    const changes: Partial<Preferences> = {};
    if (preferences.minLevel === null)
      changes.minLevel = minLevel;

    if (preferences.maxLevel === null)
      changes.maxLevel = maxLevel;

    if (Object.keys(changes).length)
      settings.changePreferences(changes);
  }, [data.ready, data.version, me.id, preferences.minLevel, preferences.maxLevel, minLevel, maxLevel]);

  const [ui, setUi] = useState<UiState>(readUiState);
  // The player unrolled on either tab, and whether only you and they are compared. Kept in memory only.
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(null);
  const [soloIsOn, setSoloIsOn] = useState(false);
  // A player stays focused only while their row is listed: you or a rival, or anyone while the Others tab is open. A
  //  rival removed here or on another device, or a player who isn't one once you leave the Others tab, is unfocused.
  const focusIsListed = (! focusedPlayerId  ||  focusedPlayerId === me.id  ||  ui.rivalTab === 'others'
    ||  rivals.some((r)  =>  r.id === focusedPlayerId));

  const soloPlayerId = ((soloIsOn  &&  focusIsListed)  ?  focusedPlayerId  :  null);

  // A solo player who isn't a rival is compared with the results loaded on the Others tab; so is one just added, until
  //  theirs are in.
  const { players } = usePlayers();
  const soloPlayer = (soloPlayerId
    ?  { id: soloPlayerId, name: players?.find((p)  =>  p.id === soloPlayerId)?.name  ??  soloPlayerId }
    :  null);

  const soloBests = useOtherBests(((soloPlayerId  &&  ! data.bests.has(soloPlayerId))  ?  soloPlayerId  :  null));
  const { sidePanel, sidePanelIsOpen, toggleSide, closeSideOnLevels } = useSidePanel();

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

  // Solo goes with the focused player, so focusing another one ends it.
  const focus = (playerId: string | null)  => {
    setFocusedPlayerId(playerId);
    if (playerId !== focusedPlayerId)
      setSoloIsOn(false);
  };

  useEffect(()  => {
    if (! focusIsListed)
      focus(null);
  }, [focusIsListed]);

  // Switching tabs ends solo mode.
  const switchRivalTab = (rivalTab: RivalTab)  => {
    changeUi({ rivalTab });
    setSoloIsOn(false);
  };

  const nonRivalSoloBests = ((soloBests !== null  &&  typeof soloBests === 'object')  ?  soloBests  :  null);
  const compared = useMemo(()  =>  withSoloPlayer(data.charts, data.bests, rivals, soloPlayer, nonRivalSoloBests),
    [data.version, data.charts, data.bests, rivals, soloPlayer?.id, soloPlayer?.name, nonRivalSoloBests]);

  const allChartboards = useMemo(
    ()  =>  buildChartboards(compared.charts, compared.bests, me.id, compared.rivals, scoreCap, { minLevel, maxLevel }),
    [compared, me.id, scoreCap, minLevel, maxLevel],
  );

  // Snoozes are checked when a level or tab is opened, or the scores or snoozes change; until then, cards keep the
  //  snooze status and time left they had.
  const snoozesCheckedAt = useMemo(()  =>  Date.now(), [ui.selectedLevel, ui.selectedTab, allChartboards, snoozes]);

  // A solo player is always counted by results, whatever the setting says.
  const countBy = (soloPlayerId  ?  'results'  :  preferences.countBy);
  // A tie counts as a win, but while a player is solo.
  const treatTieAsWin = ! soloPlayerId;
  const view = useMemo(()  =>  shownChartboards(allChartboards, { rivals, soloPlayerId, countBy, npMinimalRivals, snoozes, snoozesCheckedAt }),
    [allChartboards, rivals, soloPlayerId, countBy, npMinimalRivals, snoozes, snoozesCheckedAt]);

  const { chartboards, capHiddenChartboards, snoozedChartboards, levels } = view;
  const selectedLevel = ((ui.selectedLevel !== null  &&  levels.includes(ui.selectedLevel))  ?  ui.selectedLevel  :  levels[0]  ??  null);

  useEffect(()  => {
    if (levels.length  &&  selectedLevel !== ui.selectedLevel)
      changeUi({ selectedLevel });
  }, [levels.length, selectedLevel, ui.selectedLevel, changeUi]);

  const totals = useMemo(()  =>  countCharts(chartboards, countBy, treatTieAsWin), [chartboards, countBy, treatTieAsWin]);
  const myStats = useMemo(()  =>  levelStats(chartboards, treatTieAsWin), [chartboards, treatTieAsWin]);
  const selectedLevelCharts = useMemo(()  => {
    const atLevel = (chartboard: Chartboard)  =>  chartboard.chartLabel === selectedLevel;
    return {
      chartboards: chartboards.filter(atLevel),
      hiddenGroups: [
        { label: 'Snoozed', chartboards: snoozedChartboards.filter(atLevel) },
        { label: 'Score cap', chartboards: capHiddenChartboards.filter(atLevel).sort(byTargetWeight) },
      ],
    };
  }, [chartboards, snoozedChartboards, capHiddenChartboards, selectedLevel]);

  const emptyMessage = (! compared.rivals.length
    ?  'Add rivals on the Others tab on the left to compare your scores with theirs.'
    :  ! data.ready
      ?  'Loading scores…'
      :  ! allChartboards.length
        ?  'No scores for your rivals yet. They show up once your rivals are scraped.'
        :  ! chartboards.length
          ?  'No charts for the selected rivals — check some rivals on the left.'
          :  null);

  const error = settings.error  ??  (data.error  ?  `Couldn't load scores: ${data.error}`  :  null);
  const status = (error  ?  { text: error, error: true }  :  ! data.ready  ?  { text: 'Loading scores…', error: false }  :  null);

  return (
    <div className="rivals">
      <StatusToast status={status} />
      <div
        className={`dlg-main${(sidePanelIsOpen  ?  ' side-open'  :  '')}${(sidePanel === 'preferences'  ?  ' side-preferences'  :  '')}`}
        onClickCapture={closeSideOnLevels}
      >
        <RivalList
          tab={ui.rivalTab}
          chartboards={allChartboards}
          me={me}
          rivals={rivals}
          bests={data.bests}
          focusedPlayerId={focusedPlayerId}
          soloPlayerId={soloPlayerId}
          myStats={myStats}
          scoreCap={scoreCap}
          levelRange={levelRange}
          onTab={switchRivalTab}
          onFocus={focus}
          onSolo={setSoloIsOn}
          onToggle={(playerId, on)  =>  settings.setRivalHidden(playerId, ! on)}
          onRemove={settings.removeRival}
          onAdd={settings.addRival}
        />
        <PreferencesPanel preferences={preferences} levelRange={levelRange} playerIsSolo={!! soloPlayerId} onChange={settings.changePreferences} />
        <ChartsGroups
          chartboards={chartboards}
          selectedLevel={selectedLevel}
          countBy={countBy}
          treatTieAsWin={treatTieAsWin}
          sidePanel={(sidePanelIsOpen  ?  sidePanel  :  null)}
          onSelect={(level)  =>  changeUi({ selectedLevel: level })}
          onToggleSide={toggleSide}
        />
        <SelectedLevelCharts
          // Another level starts with every card folded again.
          key={selectedLevel}
          levelChartboards={selectedLevelCharts.chartboards}
          hiddenGroups={selectedLevelCharts.hiddenGroups}
          selectedTab={ui.selectedTab}
          myName={me.name  ??  'You'}
          emptyMessage={emptyMessage}
          countBy={countBy}
          treatTieAsWin={treatTieAsWin}
          scoreCap={scoreCap}
          snoozesCheckedAt={snoozesCheckedAt}
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
