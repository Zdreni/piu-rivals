// Player metadata is stored as
// { players: { <playerId>: { name, pumbility, lastScrapedSession, scrapStats: { scores, sessions } } } }.
// Scores are stored as results["<track>|<chart>"][playerId] = score.
export const STORAGE_VERSION = 1;
export const MIN_SCRAPE_LEVEL = 10;
export const MIN_SCORE_CAP = 995000;
export const MAX_SCORE_CAP = 1000000;
export const SCORE_CAP_STEP = 1000;

// Names carry a "#1234" tag suffix; it's left out when showing them.
export const displayName = (name) => name.replace(/\s*#\d{4}$/, '');

export const storageKey = (row) => `${row.track}|${row.chart}`;

export const isScrapLevel = (chart) => {
  const level = chart.match(/\d+/);
  return level !== null && Number(level[0]) >= MIN_SCRAPE_LEVEL;
};

// Positive = I'm ahead, same sign convention as the site. Scores above the cap compare as equal to it.
export const delta = (mine, theirs, cap = MAX_SCORE_CAP) =>
  mine === null || mine === undefined || theirs === null ? null : Math.min(mine, cap) - Math.min(theirs, cap);

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
  const { scoreCap } = parsePreferences(all.preferences);
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
          delta: delta(mine, score, scoreCap),
          // Uncapped difference, for display only.
          realDelta: delta(mine, score),
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


// bestCounts[playerId] is the number of charts with a stored best score for that player.
export async function loadPlayers() {
  const { players, ownPlayerId, results } = await chrome.storage.local.get(['players', 'ownPlayerId', 'results']);
  const bestCounts = {};
  for (const scores of Object.values(results && typeof results === 'object' ? results : {})) {
    for (const playerId of Object.keys(scores || {})) bestCounts[playerId] = (bestCounts[playerId] || 0) + 1;
  }
  return {
    players: players && typeof players === 'object' ? players : {},
    ownPlayerId: typeof ownPlayerId === 'string' ? ownPlayerId : null,
    bestCounts,
  };
}


export const clampScoreCap = (cap) =>
  Math.min(MAX_SCORE_CAP, Math.max(MIN_SCORE_CAP, Math.round(cap / SCORE_CAP_STEP) * SCORE_CAP_STEP));

function parsePreferences(preferences) {
  const prefs = preferences && typeof preferences === 'object' ? preferences : {};
  return {
    hiddenRivals: Array.isArray(prefs.hiddenRivals) ? prefs.hiddenRivals : [],
    scoreCap: typeof prefs.scoreCap === 'number' ? clampScoreCap(prefs.scoreCap) : MAX_SCORE_CAP,
  };
}


// Preferences are stored as { preferences: { hiddenRivals: [<playerId>, ...], scoreCap: <score> } }.
export async function loadPreferences() {
  const { preferences } = await chrome.storage.local.get('preferences');
  return parsePreferences(preferences);
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


// Removes a rival's metadata, scores and hidden-rival preference. For your own ID only the
// score data goes (scores, session checkpoint and scrap counters); the player record and
// ownPlayerId stay.
export async function deletePlayer(playerId) {
  const { players, results, preferences, ownPlayerId } =
    await chrome.storage.local.get(['players', 'results', 'preferences', 'ownPlayerId']);
  const { [playerId]: removed, ...restPlayers } = players || {};
  if (playerId === ownPlayerId && removed) {
    const { lastScrapedSession, scrapStats, ...record } = removed;
    restPlayers[playerId] = record;
  }
  const restResults = {};
  for (const [key, scores] of Object.entries(results || {})) {
    const { [playerId]: __, ...rest } = scores || {};
    if (Object.keys(rest).length) restResults[key] = rest;
  }
  const updates = { players: restPlayers, results: restResults };
  if (preferences?.hiddenRivals?.includes(playerId)) {
    updates.preferences = { ...preferences, hiddenRivals: preferences.hiddenRivals.filter((id) => id !== playerId) };
  }
  await chrome.storage.local.set(updates);
}
