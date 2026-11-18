import { useMemo, useState } from 'react';
import { ChartBall } from '../../components/charts/chart_card.tsx';
import { Score } from '../../components/charts/format.tsx';
import { byNewestDate, byRivalCount, byScore, type ChartGrade, isAboveCap } from '../../data/chart_grades.ts';
import { gradeLabel, MAX_SCORE } from '../../data/grade_groups.ts';
import { scoreColor } from '../../data/score_colors.ts';
import type { PassesTab } from './ui_state.ts';

const TAB_LABELS: Record<PassesTab, { label: string; shortLabel: string }> = {
  played: { label: 'Played', shortLabel: 'Played' },
  'not-played': { label: 'Not played', shortLabel: 'NP' },
};

const PASSES_TABS: PassesTab[] = ['played', 'not-played'];



// The charts of `level`, the selected one, in two tabs: played, as a table of your results, the worst first, and not played, the
//  charts most rivals played first. Scores above `scoreCap` matter less, so they're dimmed. FPCs can't be improved, so
//  they're folded under the other played charts, the latest first. `emptyMessage` replaces the tab's message when
//  there's nothing at all.
export function LevelGradesTable({ level, levelChartGrades, scoreCap, selectedTab, emptyMessage, onSelectTab }: {
  level: string | null;
  levelChartGrades: ChartGrade[];
  scoreCap: number;
  selectedTab: PassesTab;
  emptyMessage: string | null;
  onSelectTab: (tab: PassesTab) => void;
}) {
  const [fpcsAreUnfolded, setFpcsAreUnfolded] = useState(false);
  const { chartGradesByTab, fpcChartGrades } = useMemo(()  =>  ({
    chartGradesByTab: {
      played: levelChartGrades.filter((cg)  =>  cg.score !== null  &&  cg.gradeGroup !== 'fpc').sort(byScore),
      'not-played': levelChartGrades.filter((cg)  =>  cg.score === null).sort(byRivalCount),
    },
    fpcChartGrades: levelChartGrades.filter((cg)  =>  cg.gradeGroup === 'fpc').sort(byNewestDate),
  }), [levelChartGrades]);

  const playedTabIsOpen = selectedTab === 'played';
  const listedChartGrades = chartGradesByTab[selectedTab];
  const listedFpcCount = (playedTabIsOpen  ?  fpcChartGrades.length  :  0);

  const renderRow = (cg: ChartGrade)  =>  (
    // A broken best's score is dimmed; FPCs and those above the score cap, track and score, a little less.
    <tr key={cg.chartId}
      className={[(cg.score !== null  &&  ! cg.passed  &&  'broken'), (isAboveCap(cg, scoreCap)  &&  'above-cap'), (cg.gradeGroup === 'fpc'  &&  'fpc')].filter(Boolean).join(' ')  ||  undefined}>
      <td className="grade-song" title={cg.trackTitle}>{cg.track}</td>
      {(playedTabIsOpen
        ?  (
          <>
            {/* The score is in its own colour, with the grade on hover. */}
            <td className="num" style={{ color: scoreColor(cg.score  ??  0) }}
              title={`${(cg.grade  ?  gradeLabel(cg.grade)  :  'No grade')}${(cg.passed  ?  ''  :  ', broken')}`}>
              {! cg.passed  &&  <span className="grade-broken" role="img" aria-label="Broken">💔</span>}
              <span className="grade-score"><Score value={cg.score} tailClass="tail" /></span>
            </td>
            <td className="grade-date">{cg.date  ??  ''}</td>
          </>
        )
        :  <td className="num grade-rivals">{cg.rivalCount  ||  ''}</td>)}
    </tr>
  );

  return (
    <div className="score-content">
      <div className="tabs" role="tablist" aria-label="Charts">
        {PASSES_TABS.map((id)  =>  (
          <button key={id} className="tab" type="button" role="tab" aria-selected={id === selectedTab} data-tab={id} onClick={()  =>  onSelectTab(id)}>
            <span className="tab-label">{TAB_LABELS[id].label}</span>
            <span className="tab-label short">{TAB_LABELS[id].shortLabel}</span>
            <span className="tab-count">{chartGradesByTab[id].length}</span>
          </button>
        ))}
      </div>
      <div className="dlg-body" role="tabpanel">
        {! (listedChartGrades.length  ||  listedFpcCount)
          ?  <p className="empty">{emptyMessage  ??  `No ${TAB_LABELS[selectedTab].label.toLowerCase()} charts at this level.`}</p>
          :  (
            <table className="grades-table">
              <thead>
                <tr>
                  <th className="grade-level">{(level  ?  <ChartBall chartLabel={level} />  :  'Song')}</th>
                  {(playedTabIsOpen
                    ?  <><th className="num">Score</th><th className="grade-date">Date</th></>
                    :  <th className="num">Rivals</th>)}
                </tr>
              </thead>
              <tbody>
                {listedChartGrades.map(renderRow)}
                {!! listedFpcCount  &&  (
                  <tr className="grades-fold" style={{ color: scoreColor(MAX_SCORE) }}>
                    <td colSpan={3}>
                      <button type="button" aria-expanded={fpcsAreUnfolded} onClick={()  =>  setFpcsAreUnfolded(! fpcsAreUnfolded)}>
                        <svg viewBox="0 0 8 12" aria-hidden="true"><path d="M2 1l5 5-5 5" /></svg>
                        FPC<span className="fold-count">{listedFpcCount}</span>
                      </button>
                    </td>
                  </tr>
                )}
                {!! listedFpcCount  &&  fpcsAreUnfolded  &&  fpcChartGrades.map(renderRow)}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
