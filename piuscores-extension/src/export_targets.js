import { byTargetWeight, loadCharts, targetWeight } from './storage.js';

const fmt = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));


// Export charts where a rival is ahead or I have no score.
export async function exportTargets() {
  const charts = (await loadCharts()).flatMap(({ track, chart, rivals, unplayed }) => {
    const entries = rivals
      .filter(({ delta }) => delta === null || delta < 0)
      .map(({ player, score, delta, realDelta }) => ({ rival: player, score, difference: delta, realDifference: realDelta }))
      .sort((a, b) => b.score - a.score);

    return entries.length
      ? [{ track, chart, entries, unplayed, weight: targetWeight(entries.map((r) => r.difference)) }]
      : [];
  });

  charts.sort(byTargetWeight);

  const lines = [`PIU Scores targets — ${new Date().toLocaleString()}`, `${charts.length} chart(s)`, ''];
  for (const { track, chart, entries } of charts) {
    lines.push(`${track}  ${chart}`);
    const nameW = Math.max(...entries.map((r) => r.rival.length)) + 1;
    const scoreW = Math.max(...entries.map((r) => fmt(r.score).length));
    const diffW = Math.max(0, ...entries.filter((r) => r.realDifference !== null).map((r) => fmt(r.realDifference).length));
    for (const r of entries) {
      const note = (r.realDifference === null ? '—' : fmt(r.realDifference)).padStart(diffW);
      lines.push(`  ${(r.rival + ':').padEnd(nameW)}  ${fmt(r.score).padStart(scoreW)}  ${note}`);
    }
    lines.push('');
  }

  const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `piuscores-targets-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
