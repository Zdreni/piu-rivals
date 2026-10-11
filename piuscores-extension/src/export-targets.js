import { byTargetWeight, delta, normalize, targetWeight } from './storage.js';

const fmt = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));

// Export charts where a rival is ahead or I have no score.
export async function exportTargets() {
  const all = await chrome.storage.local.get(null);
  const charts = [];

  for (const [key, raw] of Object.entries(all)) {
    if (!key.startsWith('chart:')) continue;
    const [track, chart] = key.slice('chart:'.length).split(/\|(?=[^|]*$)/);
    const { mine, rivals } = normalize(raw);

    const entries = Object.entries(rivals)
      .map(([rival, score]) => ({ rival, score, difference: delta(mine, score) }))
      .filter((r) => r.difference === null || r.difference < 0)
      .sort((a, b) => b.score - a.score);

    if (entries.length) {
      charts.push({
        track,
        chart,
        entries,
        unplayed: mine === null || mine === undefined,
        weight: targetWeight(entries.map((r) => r.difference)),
      });
    }
  }

  charts.sort(byTargetWeight);

  const lines = [`PIU Scores targets — ${new Date().toLocaleString()}`, `${charts.length} chart(s)`, ''];
  for (const { track, chart, entries } of charts) {
    lines.push(`${track}  ${chart}`);
    const nameW = Math.max(...entries.map((r) => r.rival.length)) + 1;
    const scoreW = Math.max(...entries.map((r) => fmt(r.score).length));
    const diffW = Math.max(0, ...entries.filter((r) => r.difference !== null).map((r) => fmt(r.difference).length));
    for (const r of entries) {
      const note = (r.difference === null ? '—' : fmt(r.difference)).padStart(diffW);
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
