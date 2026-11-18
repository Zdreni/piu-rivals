import { useMemo, useState } from 'react';
import { Score } from '../../components/charts/format.tsx';
import { byNewestDate, byRivalCount, byScore, type ChartGrade, isAboveCap } from '../../data/chart_grades.ts';
import { gradeLabel } from '../../data/grade_groups.ts';
import type { PassesTab } from './ui_state.ts';

const TAB_LABELS: Record<PassesTab, { label: string; shortLabel: string }> = {
  played: { label: 'Played', shortLabel: 'Played' },
  'not-played': { label: 'Not played', shortLabel: 'NP' },
};

const PASSES_TABS: PassesTab[] = ['played', 'not-played'];

// Played charts folded under the others, under a button with their label and count.
type FoldId = 'above-cap' | 'fpc';

interface Fold {
  id: FoldId;
  label: string;
  chartGrades: ChartGrade[];
}


// The selected level's charts in two tabs: played, as a table of your results, the worst first, and not played, the
//  charts most rivals played first. Scores above `scoreCap` and FPCs matter least, so they're folded under the other
//  played charts; FPCs the latest first. `emptyMessage` replaces the tab's message when there's nothing at all.
export function LevelGradesTable({ levelChartGrades, scoreCap, selectedTab, emptyMessage, onSelectTab }: {
  levelChartGrades: ChartGrade[];
  scoreCap: number;
  selectedTab: PassesTab;
  emptyMessage: string | null;
  onSelectTab: (tab: PassesTab) => void;
}) {
  const [unfoldedFoldIds, setUnfoldedFoldIds] = useState<Set<FoldId>>(new Set());
  const { chartGradesByTab, folds } = useMemo(()  => {
    const isFolded = (cg: ChartGrade)  =>  cg.gradeGroup === 'fpc'  ||  isAboveCap(cg, scoreCap);
    const playedChartGrades = levelChartGrades.filter((cg)  =>  cg.score !== null);
    const folds: Fold[] = [
      { id: 'above-cap', label: `${scoreCap / 1000}k+`,
        chartGrades: playedChartGrades.filter((cg)  =>  isAboveCap(cg, scoreCap)).sort(byScore) },
      { id: 'fpc', label: 'FPC', chartGrades: playedChartGrades.filter((cg)  =>  cg.gradeGroup === 'fpc').sort(byNewestDate) },
    ];

    return {
      chartGradesByTab: {
        played: playedChartGrades.filter((cg)  =>  ! isFolded(cg)).sort(byScore),
        'not-played': levelChartGrades.filter((cg)  =>  cg.score === null).sort(byRivalCount),
      },
      folds: folds.filter((fold)  =>  fold.chartGrades.length),
    };
  }, [levelChartGrades, scoreCap]);

  const playedTabIsOpen = selectedTab === 'played';
  const listedChartGrades = chartGradesByTab[selectedTab];
  const listedFolds = (playedTabIsOpen  ?  folds  :  []);
  const tabCounts = {
    played: levelChartGrades.length - chartGradesByTab['not-played'].length,
    'not-played': chartGradesByTab['not-played'].length,
  };

  const toggleFold = (foldId: FoldId)  => {
    const nextFoldIds = new Set(unfoldedFoldIds);
    if (! nextFoldIds.delete(foldId))
      nextFoldIds.add(foldId);

    setUnfoldedFoldIds(nextFoldIds);
  };

  const renderRow = (cg: ChartGrade)  =>  (
    // A broken best's track and score are dimmed.
    <tr key={cg.chartId} className={((cg.score !== null  &&  ! cg.passed)  ?  'broken'  :  undefined)}>
      <td className="grade-song" title={cg.trackTitle}>{cg.track}</td>
      {(playedTabIsOpen
        ?  (
          <>
            {/* The score is in its grade group's colour, or the score cap's above it, with the grade itself on hover. */}
            <td className={`num grade-text-${(isAboveCap(cg, scoreCap)  ?  'above-cap'  :  cg.gradeGroup)}`}
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
            <span className="tab-count">{tabCounts[id]}</span>
          </button>
        ))}
      </div>
      <div className="dlg-body" role="tabpanel">
        {! tabCounts[selectedTab]
          ?  <p className="empty">{emptyMessage  ??  `No ${TAB_LABELS[selectedTab].label.toLowerCase()} charts at this level.`}</p>
          :  (
            <table className="grades-table">
              <thead>
                <tr>
                  <th>Song</th>
                  {(playedTabIsOpen
                    ?  <><th className="num">Score</th><th className="grade-date">Date</th></>
                    :  <th className="num">Rivals</th>)}
                </tr>
              </thead>
              <tbody>
                {listedChartGrades.map(renderRow)}
                {listedFolds.map((fold)  =>  {
                  const foldIsOpen = unfoldedFoldIds.has(fold.id);
                  return [
                    <tr key={fold.id} className={`grades-fold ${fold.id}`}>
                      <td colSpan={3}>
                        <button type="button" aria-expanded={foldIsOpen} onClick={()  =>  toggleFold(fold.id)}>
                          <svg viewBox="0 0 8 12" aria-hidden="true"><path d="M2 1l5 5-5 5" /></svg>
                          {fold.label}<span className="fold-count">{fold.chartGrades.length}</span>
                        </button>
                      </td>
                    </tr>,
                    ...(foldIsOpen  ?  fold.chartGrades.map(renderRow)  :  []),
                  ];
                })}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
