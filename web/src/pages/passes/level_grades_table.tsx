import { useMemo, useState } from 'react';
import { ChartBall } from '../../components/charts/chart_card.tsx';
import { Score } from '../../components/charts/format.tsx';
import { byNewestDate, byRivalCount, byScore, type ChartGrade, isAboveCap } from '../../data/chart_grades.ts';
import { gradeLabel, MAX_SCORE } from '../../data/grade_groups.ts';
import { scoreColor } from '../../data/score_colors.ts';
import { useScrollVeil } from '../../components/scroll_veil.ts';
import type { PassesTab } from './ui_state.ts';

// Two tabs leave room for their whole labels, even on phones.
const TAB_LABELS: Record<PassesTab, string> = { played: 'Played', 'not-played': 'Not played' };

const PASSES_TABS: PassesTab[] = ['played', 'not-played'];


// The selected level's charts in two tabs: played, as a table of your results, the worst first, and not played, the
//  charts most rivals played first. Scores above `scoreCap` matter less, so they're dimmed, as are the charts not played
//  that fewer rivals than `npMinimalRivals` played, which the Rivals page leaves out. Snoozed charts are dimmed too,
//  after those. FPCs can't be improved, so they're folded under the other played charts, the latest first.
//  `emptyMessage` replaces the tab's message when there's nothing at all.
// A click on a chart opens its card (`onOpen`, with its row); its row has its chart id in data-chart.
// With `snoozeFlash`, the open tab splashes for a chart just snoozed or woken in it.
export function LevelGradesTable({
  levelChartGrades, scoreCap, npMinimalRivals, snoozes, snoozesCheckedAt, snoozeFlash, onSnoozeFlashEnd, selectedTab, emptyMessage,
  onSelectTab, onOpen,
}: {
  levelChartGrades: ChartGrade[];
  scoreCap: number;
  npMinimalRivals: number;
  // Snooze ends by chart id; those up to `snoozesCheckedAt` are over.
  snoozes: Map<number, number>;
  snoozesCheckedAt: number;
  // `n` restarts the splash.
  snoozeFlash: { woken: boolean; n: number } | null;
  onSnoozeFlashEnd: () => void;
  selectedTab: PassesTab;
  emptyMessage: string | null;
  onSelectTab: (tab: PassesTab) => void;
  onOpen: (chartId: number) => void;
}) {
  const [fpcsAreUnfolded, setFpcsAreUnfolded] = useState(false);
  const isSnoozed = (cg: ChartGrade)  =>  (snoozes.get(cg.chartId)  ??  0) > snoozesCheckedAt;
  // The sorts already put the charts above the cap or played by too few rivals last; the snoozed ones go after them.
  const snoozedLast = (chartGrades: ChartGrade[])  =>  [...chartGrades.filter((cg)  =>  ! isSnoozed(cg)), ...chartGrades.filter(isSnoozed)];
  const { chartGradesByTab, fpcChartGrades } = useMemo(()  =>  ({
    chartGradesByTab: {
      played: snoozedLast(levelChartGrades.filter((cg)  =>  cg.score !== null  &&  cg.gradeGroup !== 'fpc').sort(byScore)),
      'not-played': snoozedLast(levelChartGrades.filter((cg)  =>  cg.score === null).sort(byRivalCount)),
    },
    fpcChartGrades: levelChartGrades.filter((cg)  =>  cg.gradeGroup === 'fpc').sort(byNewestDate),
  }), [levelChartGrades, snoozes, snoozesCheckedAt]);

  const playedTabIsOpen = selectedTab === 'played';
  const listedChartGrades = chartGradesByTab[selectedTab];
  const listedFpcCount = (playedTabIsOpen  ?  fpcChartGrades.length  :  0);
  const isBelowNpMinimum = (cg: ChartGrade)  =>  cg.score === null  &&  cg.rivalCount < npMinimalRivals;
  const isDimmed = (cg: ChartGrade)  =>  isAboveCap(cg, scoreCap)  ||  isBelowNpMinimum(cg)  ||  isSnoozed(cg);

  // Each tab counts its charts and the dimmed ones apart, as "A + B".
  const tabCount = (tab: PassesTab)  =>  {
    const tabChartGrades = chartGradesByTab[tab];
    const dimmedCount = tabChartGrades.filter(isDimmed).length;
    return (dimmedCount  ?  `${tabChartGrades.length - dimmedCount} + ${dimmedCount}`  :  tabChartGrades.length);
  };

  // An empty row sets the dimmed charts apart from the others.
  const firstDimmedIndex = listedChartGrades.findIndex(isDimmed);

  // A broken best's score is dimmed; FPCs, those above the score cap and the not played ones too few rivals played, the
  //  whole row, a little less.
  const renderRow = (cg: ChartGrade)  =>  {
    const classNames = [(cg.score !== null  &&  ! cg.passed  &&  'broken'), (isAboveCap(cg, scoreCap)  &&  'above-cap'), (cg.gradeGroup === 'fpc'  &&  'fpc'),
      (isBelowNpMinimum(cg)  &&  'below-np-min'), (isSnoozed(cg)  &&  'snoozed')];

    return (
      <tr key={cg.chartId} className={classNames.filter(Boolean).join(' ')  ||  undefined} data-chart={cg.chartId} onClick={()  =>  onOpen(cg.chartId)}>
        <td className="grade-ball"><ChartBall chartLabel={cg.chartLabel} /></td>
        <td className="grade-song" title={cg.trackTitle}>{cg.track}</td>
        {(playedTabIsOpen
          ?  (
            <>
              {/* The score in its own colour, with the grade on hover. */}
              <td className="num" style={{ color: scoreColor(cg.score  ??  0) }}
                title={`${(cg.grade  ?  gradeLabel(cg.grade)  :  'No grade')}${(cg.passed  ?  ''  :  ', broken')}`}>
                {! cg.passed  &&  <span className="grade-broken" role="img" aria-label="Broken">💔</span>}
                <span className="grade-score"><Score value={cg.score} tailClass="tail" /></span>
              </td>
              <td className="grade-date">{cg.date  ??  ''}</td>
            </>
          )
          :  <td className="num"><span className="grade-rivals">{cg.rivalCount  ||  ''}</span></td>)}
      </tr>
    );
  };

  const veilRef = useScrollVeil<HTMLDivElement>(null);
  return (
    <div className="score-content">
      <div className="tabs" role="tablist" aria-label="Charts">
        {PASSES_TABS.map((id)  =>  (
          <button key={id} className="tab" type="button" role="tab" aria-selected={id === selectedTab} data-tab={id} onClick={()  =>  onSelectTab(id)}>
            <span className="tab-label">{TAB_LABELS[id]}</span>
            <span className="tab-label short">{TAB_LABELS[id]}</span>
            <span className="tab-count">{tabCount(id)}</span>
            {snoozeFlash  &&  id === selectedTab  &&  (
              <span key={snoozeFlash.n} className={`tab-flash${(snoozeFlash.woken  ?  ' woken'  :  '')}`} aria-hidden="true"
                onAnimationEnd={onSnoozeFlashEnd} />
            )}
          </button>
        ))}
      </div>
      <div className="dlg-body" role="tabpanel" ref={veilRef}>
        {! (listedChartGrades.length  ||  listedFpcCount)
          ?  <p className="empty">{emptyMessage  ??  `No ${TAB_LABELS[selectedTab].toLowerCase()} charts at this level.`}</p>
          :  (
            <table className="grades-table">
              <tbody>
                {listedChartGrades.map((cg, i)  =>  (
                  (i > 0  &&  i === firstDimmedIndex)
                    ?  [<tr key="cap-gap" className="grade-cap-gap" aria-hidden="true"><td colSpan={4}>&nbsp;</td></tr>, renderRow(cg)]
                    :  renderRow(cg)
                ))}
                {!! listedFpcCount  &&  (
                  <tr className="grades-fold" style={{ color: scoreColor(MAX_SCORE) }}>
                    <td colSpan={4}>
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
