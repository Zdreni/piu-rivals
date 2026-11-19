import type { PlayerSummary } from '@piu-rivals/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession } from '../../session.tsx';
import { ChartsGroups } from './charts_groups.tsx';
import { SelectedLevelCharts } from './selected_level_charts.tsx';
import { autoLevels, type Preferences, resolveLevels } from '../../data/preferences.ts';
import { buildChartboards, byTargetWeight, type Chartboard } from '../../data/model.ts';
import { shownChartboards } from '../../data/shown_chartboards.ts';
import { PreferencesPanel } from './preferences_panel.tsx';
import { RivalList } from './rival_list.tsx';
import { countCharts, levelStats, type TabId } from '../../data/stats.ts';
import { readUiState, saveUiState, type SetupTab, type UiState } from './ui_state.ts';
import { useAutoRefresh } from '../../data/use_auto_refresh.ts';
import { useBests } from '../../data/use_bests.ts';
import { useOtherBests, usePlayers, withSoloPlayer } from '../../data/other_players.ts';
import { useRivalSettings } from '../../data/use_rival_settings.ts';
import { shownLevels, useSelectedLevels } from '../../data/use_selected_levels.ts';
import { StatsPopup } from './stats_popup.tsx';
import { StatusToast } from '../../components/status_toast.tsx';
import '../../score_views.css';


// The Rivals view: the levels and the selected levels' results, or with `setupIsOpen`, the Setup page: your rivals,
//  other players to add, and the preferences.
function RivalsView({ me, setupIsOpen }: { me: PlayerSummary; setupIsOpen: boolean }) {
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
  const { savedLevels, selectLevels } = useSelectedLevels();
  // The player unrolled on either tab, and whether only you and they are compared. Kept in memory only.
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(null);
  const [soloIsOn, setSoloIsOn] = useState(false);
  // The player whose Stats popup is open.
  const [statsPlayerId, setStatsPlayerId] = useState<string | null>(null);
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

  // Switching between the lists ends solo mode; the preferences keep it.
  const selectSetupTab = (setupTab: SetupTab)  => {
    if (setupTab === 'preferences') {
      changeUi({ preferencesAreOpen: true });
      return;
    }

    changeUi({ rivalTab: setupTab, preferencesAreOpen: false });
    if (setupTab !== ui.rivalTab)
      setSoloIsOn(false);
  };

  const nonRivalSoloBests = ((soloBests !== null  &&  typeof soloBests === 'object')  ?  soloBests  :  null);
  const compared = useMemo(()  =>  withSoloPlayer(data.charts, data.bests, rivals, soloPlayer, nonRivalSoloBests),
    [data.version, data.charts, data.bests, rivals, soloPlayer?.id, soloPlayer?.name, nonRivalSoloBests]);

  const allChartboards = useMemo(
    ()  =>  buildChartboards(compared.charts, compared.bests, me.id, compared.rivals, scoreCap, { minLevel, maxLevel }, false),
    [compared, me.id, scoreCap, minLevel, maxLevel],
  );

  // Snoozes are checked when levels or a tab are opened, or the scores or snoozes change; until then, cards keep the
  //  snooze status and time left they had.
  const snoozesCheckedAt = useMemo(()  =>  Date.now(), [savedLevels, ui.selectedTab, allChartboards, snoozes]);

  // A solo player is always counted by results, whatever the setting says.
  const countBy = (soloPlayerId  ?  'results'  :  preferences.countBy);
  // A tie counts as a win, but while a player is solo.
  const treatTieAsWin = ! soloPlayerId;
  const view = useMemo(()  =>  shownChartboards(allChartboards, { rivals, soloPlayerId, countBy, npMinimalRivals, snoozes, snoozesCheckedAt }),
    [allChartboards, rivals, soloPlayerId, countBy, npMinimalRivals, snoozes, snoozesCheckedAt]);

  const { chartboards, playedChartboards, capHiddenChartboards, snoozedChartboards, levels } = view;
  const selectedLevels = useMemo(()  =>  shownLevels(savedLevels, levels), [savedLevels, levels]);
  const totals = useMemo(()  =>  countCharts(chartboards, countBy, treatTieAsWin), [chartboards, countBy, treatTieAsWin]);
  const myStats = useMemo(()  =>  levelStats(chartboards, treatTieAsWin), [chartboards, treatTieAsWin]);
  const selectedLevelCharts = useMemo(()  => {
    const atLevel = (chartboard: Chartboard)  =>  selectedLevels.includes(chartboard.chartLabel);
    return {
      chartboards: playedChartboards.filter(atLevel),
      hiddenGroups: [
        { label: 'Snoozed', chartboards: snoozedChartboards.filter(atLevel) },
        { label: 'Score cap', chartboards: capHiddenChartboards.filter(atLevel).sort(byTargetWeight) },
      ],
    };
  }, [playedChartboards, snoozedChartboards, capHiddenChartboards, selectedLevels]);

  const emptyMessage = (! compared.rivals.length
    ?  'Add rivals on the Others tab of Setup to compare your scores with theirs.'
    :  ! data.ready
      ?  'Loading scores…'
      :  ! allChartboards.length
        ?  'No scores for your rivals yet. They show up once your rivals are scraped.'
        :  ! playedChartboards.length
          ?  'No charts for the selected rivals — check some rivals on Setup.'
          :  null);

  const error = settings.error  ??  (data.error  ?  `Couldn't load scores: ${data.error}`  :  null);
  const status = (error  ?  { text: error, error: true }  :  ! data.ready  ?  { text: 'Loading scores…', error: false }  :  null);

  const statsPopup = statsPlayerId  &&  (
    <StatsPopup
      me={{ id: me.id, name: me.name  ??  me.id }}
      player={{ id: statsPlayerId, name: rivals.find((r)  =>  r.id === statsPlayerId)?.name  ??  players?.find((p)  =>  p.id === statsPlayerId)?.name  ??  statsPlayerId }}
      charts={data.charts}
      bests={data.bests}
      levelRange={levelRange}
      onClose={()  =>  setStatsPlayerId(null)}
    />
  );

  if (setupIsOpen) {
    return (
      <div className="rivals setup">
        <StatusToast status={status} />
        <RivalList
          tab={(ui.preferencesAreOpen  ?  'preferences'  :  ui.rivalTab)}
          chartboards={allChartboards}
          me={me}
          rivals={rivals}
          bests={data.bests}
          focusedPlayerId={focusedPlayerId}
          soloPlayerId={soloPlayerId}
          myStats={myStats}
          scoreCap={scoreCap}
          levelRange={levelRange}
          preferencesPanel={
            <PreferencesPanel preferences={preferences} levelRange={levelRange} playerIsSolo={!! soloPlayerId} onChange={settings.changePreferences} />
          }
          onTab={selectSetupTab}
          onFocus={focus}
          onSolo={setSoloIsOn}
          onToggle={(playerId, on)  =>  settings.setRivalHidden(playerId, ! on)}
          onStats={setStatsPlayerId}
          onRemove={settings.removeRival}
          onAdd={settings.addRival}
        />
        {statsPopup}
      </div>
    );
  }

  return (
    <div className="rivals">
      <StatusToast status={status} />
      <div className="dlg-main">
        <ChartsGroups
          chartboards={playedChartboards}
          selectedLevels={selectedLevels}
          countBy={countBy}
          treatTieAsWin={treatTieAsWin}
          levelRange={levelRange}
          onSelect={(newSelectedLevels, tab)  => {
            selectLevels(newSelectedLevels);
            if (tab)
              selectTab(tab);
          }}
        />
        <SelectedLevelCharts
          // Other levels start with every card folded again.
          key={selectedLevels.join(' ')}
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
      {statsPopup}
    </div>
  );
}


export function RivalsPage() {
  const { status, me } = useSession();
  const setupIsOpen = useLocation().pathname === '/setup';
  if (status === 'loading')
    return <p className="muted">Loading…</p>;

  if (! me)
    return <p>Sign in on the <Link to="/">home page</Link> to see your rivals.</p>;

  if (! me.user.player)
    return <p className="muted">No PIU Scores player is linked to your account yet, so there's no Rivals view for you. Ask an admin to link yours.</p>;

  return <RivalsView me={me.user.player} setupIsOpen={setupIsOpen} />;
}
