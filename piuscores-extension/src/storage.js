// Stored in chrome.storage.local, one entry per chart:
//   "chart:<track>|<chart>" -> { mine: <score|null>, rivals: { <name>: <score> } }
// `mine` is null when there is no score, and absent when it was never seen.
export const storageKey = (row) => `chart:${row.track}|${row.chart}`;

export const normalize = (entry) =>
  entry && entry.rivals ? { ...entry, rivals: { ...entry.rivals } } : { rivals: {} };

// Positive = I'm ahead, same sign convention as the site.
export const delta = (mine, theirs) =>
  mine === null || mine === undefined || theirs === null ? null : mine - theirs;

export const targetWeight = (diffs) =>
  diffs.reduce((acc, d) => acc + (d !== null && d < 0 ? Math.sqrt(-d) : 0), 0);

export const byTargetWeight = (a, b) =>
  b.weight - a.weight || Number(b.unplayed) - Number(a.unplayed) || a.track.localeCompare(b.track);

export async function loadCharts() {
  const all = await chrome.storage.local.get(null);
  const charts = [];

  for (const [key, raw] of Object.entries(all)) {
    if (!key.startsWith('chart:')) continue;
    const [track, chart] = key.slice('chart:'.length).split(/\|(?=[^|]*$)/);
    const { mine, rivals } = normalize(raw);
    const list = Object.entries(rivals)
      .map(([player, score]) => ({ player, score, delta: delta(mine, score) }))
      .sort((a, b) => b.score - a.score);

    if (list.length) {
      charts.push({
        track,
        chart,
        mine: mine ?? null,
        rivals: list,
        unplayed: mine === null || mine === undefined,
        weight: targetWeight(list.map((r) => r.delta)),
      });
    }
  }

  return charts;
}
