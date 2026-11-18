import type { PlayerSummary } from '@piu-rivals/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../session.tsx';
import { StatusToast } from '../../components/status_toast.tsx';
import { buildChartGrades } from '../../data/chart_grades.ts';
import { useKnownCharts } from '../../data/known_charts.ts';
import { autoLevels, resolveLevels } from '../../data/preferences.ts';
import { compareLevels } from '../../data/stats.ts';
import { useAutoRefresh } from '../../data/use_auto_refresh.ts';
import { useBests } from '../../data/use_bests.ts';
import { useRivalSettings } from '../../data/use_rival_settings.ts';
import { GradeLevels } from './grade_levels.tsx';
import { LevelGradesTable } from './level_grades_table.tsx';
import { type PassesUiState, readPassesUiState, savePassesUiState } from './ui_state.ts';
import '../../score_views.css';


// Your grades on every known chart of each level in the Rivals page's level range, played or not, and how many of
//  your rivals switched on played each.
function PassesView({ me }: { me: PlayerSummary }) {
  const settings = useRivalSettings();
  const { rivals, preferences } = settings;
  const shownRivalIds = useMemo(()  =>  rivals.filter((r)  =>  ! r.hidden).map((r)  =>  r.id), [rivals]);
  const playerIds = useMemo(()  =>  [me.id, ...shownRivalIds], [me.id, shownRivalIds]);
  const data = useBests(playerIds);
  const known = useKnownCharts();
  // Until the Rivals page saves the level range, it follows your scores, as there.
  const autoRange = useMemo(()  => {
    const charts = [...data.bests.get(me.id)?.keys()  ??  []].map((chartId)  =>  data.charts.get(chartId));
    return autoLevels(charts.flatMap((c)  =>  (c  ?  [c.level]  :  [])));
  }, [data.version, data.charts, data.bests, me.id]);

  const levelRange = resolveLevels(preferences, autoRange);
  const { minLevel, maxLevel } = levelRange;
  const [ui, setUi] = useState<PassesUiState>(readPassesUiState);

  useAutoRefresh(()  => {
    void settings.refresh();
    void data.sync();
    void known.sync();
  });

  const changeUi = useCallback((changes: Partial<PassesUiState>)  => {
    setUi((current)  => {
      const nextUi = { ...current, ...changes };
      savePassesUiState(nextUi);
      return nextUi;
    });
  }, []);

  const chartGrades = useMemo(
    ()  =>  buildChartGrades(known.charts, data.charts, data.bests.get(me.id),
      shownRivalIds.flatMap((rivalId)  =>  data.bests.get(rivalId)  ??  []), { minLevel, maxLevel }),
    [known.version, known.charts, data.version, data.charts, data.bests, me.id, shownRivalIds, minLevel, maxLevel],
  );

  const levels = useMemo(()  =>  [...new Set(chartGrades.map((cg)  =>  cg.chartLabel))].sort(compareLevels), [chartGrades]);
  const selectedLevel = ((ui.selectedLevel !== null  &&  levels.includes(ui.selectedLevel))  ?  ui.selectedLevel  :  levels[0]  ??  null);

  useEffect(()  => {
    if (levels.length  &&  selectedLevel !== ui.selectedLevel)
      changeUi({ selectedLevel });
  }, [levels.length, selectedLevel, ui.selectedLevel, changeUi]);

  const levelChartGrades = useMemo(()  =>  chartGrades.filter((cg)  =>  cg.chartLabel === selectedLevel), [chartGrades, selectedLevel]);
  const loading = ! data.ready  ||  ! known.ready;
  const emptyMessage = ((loading  &&  ! chartGrades.length)  ?  'Loading charts…'  :  null);
  const error = settings.error  ??  ((data.error  ||  known.error)  ?  `Couldn't load scores: ${data.error  ??  known.error}`  :  null);
  const status = (error  ?  { text: error, error: true }  :  loading  ?  { text: 'Loading charts…', error: false }  :  null);

  return (
    <div className="rivals passes">
      <StatusToast status={status} />
      <div className="dlg-main">
        <GradeLevels
          chartGrades={chartGrades}
          levels={levels}
          levelRange={levelRange}
          scoreCap={preferences.scoreCap}
          selectedLevel={selectedLevel}
          onSelect={(level, tab)  =>  changeUi({ selectedLevel: level, ...(tab  &&  { selectedTab: tab }) })}
        />
        <LevelGradesTable
          levelChartGrades={levelChartGrades}
          scoreCap={preferences.scoreCap}
          selectedTab={ui.selectedTab}
          emptyMessage={emptyMessage}
          onSelectTab={(tab)  =>  changeUi({ selectedTab: tab })}
        />
      </div>
    </div>
  );
}


export function PassesPage() {
  const { status, me } = useSession();
  if (status === 'loading')
    return <p className="muted">Loading…</p>;

  if (! me)
    return <p>Sign in on the <Link to="/">home page</Link> to see your passes.</p>;

  if (! me.user.player)
    return <p className="muted">No PIU Scores player is linked to your account yet, so there's no Passes page for you. Ask an admin to link yours.</p>;

  return <PassesView me={me.user.player} />;
}
