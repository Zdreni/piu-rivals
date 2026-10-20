import { formatNumber } from '../../util.ts';
import { byTargetWeight, type ChartRow, displayName, targetWeight } from './model.ts';


// Downloads a text file of the charts where a rival is ahead or you have no score.
export function exportTargets(charts: ChartRow[]) {
  const targets = charts.flatMap((chart) => {
    const entries = chart.rivals
      .filter(({ delta }) => delta === null  ||  delta < 0)
      .map(({ player, score, delta, realDelta }) => ({ rival: displayName(player), score, difference: delta, realDifference: realDelta }))
      .sort((a, b) => b.score - a.score);

    return entries.length ? [{ ...chart, entries, weight: targetWeight(entries.map((entry) => entry.difference)) }] : [];
  });

  targets.sort(byTargetWeight);

  const lines = [`piu-rivals targets — ${new Date().toLocaleString()}`, `${targets.length} chart(s)`, ''];
  for (const { track, chart, entries } of targets) {
    lines.push(`${track}  ${chart}`);

    const nameWidth = Math.max(...entries.map((entry) => entry.rival.length)) + 1;
    const scoreWidth = Math.max(...entries.map((entry) => formatNumber(entry.score).length));
    const diffWidth = Math.max(0, ...entries.filter((entry) => entry.realDifference !== null)
      .map((entry) => formatNumber(entry.realDifference).length));

    for (const entry of entries) {
      const note = formatNumber(entry.realDifference).padStart(diffWidth);
      lines.push(`  ${`${entry.rival}:`.padEnd(nameWidth)}  ${formatNumber(entry.score).padStart(scoreWidth)}  ${note}`);
    }

    lines.push('');
  }

  const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `piu-rivals-targets-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
