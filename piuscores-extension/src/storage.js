// Player metadata is stored as { players: { <playerId>: { name, pumbility } } }.
// Scores are stored as results["<track>|<chart>"][playerId] = score.
export const STORAGE_VERSION = 1;
export const MIN_SCRAPE_LEVEL = 10;

export const storageKey = (row) => `${row.track}|${row.chart}`;

export const isScrapLevel = (chart) => {
  const level = chart.match(/\d+/);
  return level !== null && Number(level[0]) >= MIN_SCRAPE_LEVEL;
};

// Positive = I'm ahead, same sign convention as the site.
export const delta = (mine, theirs) =>
  mine === null || mine === undefined || theirs === null ? null : mine - theirs;

export const targetWeight = (diffs) =>
  diffs.reduce((acc, d) => acc + (d !== null && d < 0 ? Math.sqrt(-d) : 0), 0);

export const byTargetWeight = (a, b) =>
  b.weight - a.weight || Number(b.unplayed) - Number(a.unplayed) || a.track.localeCompare(b.track);

export const leadWeight = (chart) =>
  chart.rivals.reduce((acc, rival) =>
    acc + (rival.delta !== null && rival.delta > 0 ? Math.sqrt(rival.delta) : 0), 0);

export const byLeadWeight = (a, b) =>
  leadWeight(b) - leadWeight(a) || a.track.localeCompare(b.track);

export async function loadCharts() {
  const all = await chrome.storage.local.get(null);
  const players = all.players && typeof all.players === 'object' ? all.players : {};
  const playerName = (playerId) => {
    const player = players[playerId];
    if (player && typeof player === 'object' && typeof player.name === 'string') return player.name;
    return playerId;
  };
  const ownPlayerId = typeof all.ownPlayerId === 'string' ? all.ownPlayerId : null;
  const results = all.results && typeof all.results === 'object' ? all.results : {};
  const charts = [];

  for (const [key, rawScores] of Object.entries(results)) {
    if (!rawScores || typeof rawScores !== 'object') continue;
    const [track, chart] = key.split(/\|(?=[^|]*$)/);
    const scores = rawScores;
    const mine = ownPlayerId ? scores[ownPlayerId] ?? null : null;
    const rivals = [
      ...Object.entries(scores)
        .filter(([playerId]) => playerId !== ownPlayerId)
        .map(([playerId, score]) => ({
          player: playerName(playerId),
          playerId,
          score,
          delta: delta(mine, score),
        })),
    ].sort((a, b) => b.score - a.score);

    if (rivals.length) {
      charts.push({
        track,
        chart,
        mine,
        rivals,
        unplayed: mine === null,
        weight: targetWeight(rivals.map((rival) => rival.delta)),
      });
    }
  }

  return charts;
}

export async function loadPlayers() {
  const { players, ownPlayerId } = await chrome.storage.local.get(['players', 'ownPlayerId']);
  return {
    players: players && typeof players === 'object' ? players : {},
    ownPlayerId: typeof ownPlayerId === 'string' ? ownPlayerId : null,
  };
}

// Preferences are stored as { preferences: { hiddenRivals: [<playerId>, ...] } }.
export async function loadPreferences() {
  const { preferences } = await chrome.storage.local.get('preferences');
  const prefs = preferences && typeof preferences === 'object' ? preferences : {};
  return { hiddenRivals: Array.isArray(prefs.hiddenRivals) ? prefs.hiddenRivals : [] };
}

export async function savePreferences(changes) {
  const { preferences } = await chrome.storage.local.get('preferences');
  await chrome.storage.local.set({ preferences: { ...(preferences || {}), ...changes } });
}

// Returns the chart limited to rivals passing `keep`, or null when none remain.
export function withRivals(chart, keep) {
  const rivals = chart.rivals.filter(keep);
  if (rivals.length === chart.rivals.length) return chart;
  if (!rivals.length) return null;
  return { ...chart, rivals, weight: targetWeight(rivals.map((rival) => rival.delta)) };
}
