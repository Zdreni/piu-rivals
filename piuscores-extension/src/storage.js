// Player metadata is stored as
// { players: { <playerId>: { name, pumbility, lastScrapedSession, scrapStats: { scores, sessions }, sessionsVisitedAt } } }.
// sessionsVisitedAt is a ms timestamp of the last time the player's Sessions page was ready to scrap.
// Scores are stored as results["<track>|<chart>"][playerId] = { bestScore, bestScoreDate, lastTryDate }.
// Dates are session dates as "YYYY-MM-DD"; scores migrated from version 1 have no dates.
export const STORAGE_VERSION = 2;
export const MIN_SCRAPE_LEVEL = 10;
export const MIN_SCORE_CAP = 995000;
export const MAX_SCORE_CAP = 1000000;
export const SCORE_CAP_STEP = 1000;
export const MAX_RETRY_COOLDOWN = 7;

// Names carry a "#1234" tag suffix; it's left out when showing them.
export const displayName = (name) => name.replace(/\s*#\d{4}$/, '');

export const storageKey = (row) => `${row.track}|${row.chart}`;


// New players are only added by the scrap button on their Sessions page; automatic page scraping
// only updates yourself and players that are already stored.
export function isKnownPlayer(players, playerId, ownPlayerId) {
  return playerId === ownPlayerId  ||  !! players?.[playerId];
}


export const isScrapLevel = (chart) => {
  const level = chart.match(/\d+/);
  return level !== null  &&  Number(level[0]) >= MIN_SCRAPE_LEVEL;
};


// Positive = I'm ahead, same sign convention as the site. Scores above the cap compare as equal to it.
export const delta = (mine, theirs, cap = MAX_SCORE_CAP) =>
  mine === null  ||  mine === undefined  ||  theirs === null ? null : Math.min(mine, cap) - Math.min(theirs, cap);


export const targetWeight = (diffs) =>
  diffs.reduce((acc, d) => acc + (d !== null  &&  d < 0 ? Math.sqrt(-d) : 0), 0);


export const byTargetWeight = (a, b) =>
  b.weight - a.weight  ||  Number(b.unplayed) - Number(a.unplayed)  ||  a.track.localeCompare(b.track);


export const leadWeight = (chart) =>
  chart.rivals.reduce((acc, rival) =>
    acc + (rival.delta !== null  &&  rival.delta > 0 ? Math.sqrt(rival.delta) : 0), 0);


export const byLeadWeight = (a, b) =>
  leadWeight(b) - leadWeight(a)  ||  a.track.localeCompare(b.track);


// Version 1 stored each score as a bare number.
export async function migrateStorage() {
  const { storageVersion, results } = await chrome.storage.local.get(['storageVersion', 'results']);
  // Data saved before versioning has no storageVersion and is in the version 1 format.
  const version = storageVersion ?? (results ? 1 : STORAGE_VERSION);
  if (version === STORAGE_VERSION) {
    if (storageVersion === undefined)
      await chrome.storage.local.set({ storageVersion: STORAGE_VERSION });

    return;
  }

  if (version > STORAGE_VERSION) {
    console.warn(`[piuscores] Stored data version ${version} is newer than supported version ${STORAGE_VERSION}`);
    return;
  }

  const updates = { storageVersion: STORAGE_VERSION };
  if (version < 2  &&  results) {
    updates.results = Object.fromEntries(Object.entries(results).map(([key, scores]) => [
      key,
      Object.fromEntries(Object.entries(scores  ||  {}).map(([playerId, score]) =>
        [playerId, typeof score === 'number' ? { bestScore: score } : score])),
    ]));
  }

  await chrome.storage.local.set(updates);
  console.log(`[piuscores] Migrated stored data from version ${version} to ${STORAGE_VERSION}`);
}


export async function loadCharts() {
  const all = await chrome.storage.local.get(null);
  const players = all.players  &&  typeof all.players === 'object' ? all.players : {};

  const playerName = (playerId) => {
    const player = players[playerId];
    if (player  &&  typeof player === 'object'  &&  typeof player.name === 'string')
      return player.name;

    return playerId;
  };

  const ownPlayerId = typeof all.ownPlayerId === 'string' ? all.ownPlayerId : null;
  const results = all.results  &&  typeof all.results === 'object' ? all.results : {};
  const { scoreCap } = parsePreferences(all.preferences);
  const charts = [];

  for (const [key, rawScores] of Object.entries(results)) {
    if (! rawScores  ||  typeof rawScores !== 'object')
      continue;

    const [track, chart] = key.split(/\|(?=[^|]*$)/);
    const scores = rawScores;
    const myRecord = ownPlayerId ? scores[ownPlayerId] : null;
    const mine = myRecord?.bestScore ?? null;
    const rivals = [
      ...Object.entries(scores)
        .filter(([playerId]) => playerId !== ownPlayerId)
        .map(([playerId, { bestScore: score, bestScoreDate, lastTryDate }]) => ({
          player: playerName(playerId),
          playerId,
          score,
          bestScoreDate,
          lastTryDate,
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
        myDates: { bestScoreDate: myRecord?.bestScoreDate, lastTryDate: myRecord?.lastTryDate },
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
  for (const scores of Object.values(results  &&  typeof results === 'object' ? results : {})) {
    for (const playerId of Object.keys(scores  ||  {}))
      bestCounts[playerId] = (bestCounts[playerId]  ||  0) + 1;
  }

  return {
    players: players  &&  typeof players === 'object' ? players : {},
    ownPlayerId: typeof ownPlayerId === 'string' ? ownPlayerId : null,
    bestCounts,
  };
}


export const clampRetryCooldown = (days) => Math.min(MAX_RETRY_COOLDOWN, Math.max(0, Math.round(days)));


// Whole days from a "YYYY-MM-DD" date to today (local), or null when the date is unknown.
export function daysSince(date) {
  if (! date)
    return null;

  const now = new Date();
  return Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
}


export const clampScoreCap = (cap) =>
  Math.min(MAX_SCORE_CAP, Math.max(MIN_SCORE_CAP, Math.round(cap / SCORE_CAP_STEP) * SCORE_CAP_STEP));


function parsePreferences(preferences) {
  const prefs = preferences  &&  typeof preferences === 'object' ? preferences : {};
  return {
    hiddenRivals: Array.isArray(prefs.hiddenRivals) ? prefs.hiddenRivals : [],
    scoreCap: typeof prefs.scoreCap === 'number' ? clampScoreCap(prefs.scoreCap) : MAX_SCORE_CAP,
    retryCooldown: typeof prefs.retryCooldown === 'number' ? clampRetryCooldown(prefs.retryCooldown) : 0,
  };
}


// Preferences are stored as
// { preferences: { hiddenRivals: [<playerId>, ...], scoreCap: <score>, retryCooldown: <days> } }.
export async function loadPreferences() {
  const { preferences } = await chrome.storage.local.get('preferences');
  return parsePreferences(preferences);
}


export async function savePreferences(changes) {
  const { preferences } = await chrome.storage.local.get('preferences');
  await chrome.storage.local.set({ preferences: { ...(preferences  ||  {}), ...changes } });
}


// Returns the chart limited to rivals passing `keep`, or null when none remain.
export function withRivals(chart, keep) {
  const rivals = chart.rivals.filter(keep);
  if (rivals.length === chart.rivals.length)
    return chart;

  if (! rivals.length)
    return null;

  return { ...chart, rivals, weight: targetWeight(rivals.map((rival) => rival.delta)) };
}


// Removes a rival's metadata, scores and hidden-rival preference. For your own ID only the
// score data goes (scores, session checkpoint and scrap counters); the player record and
// ownPlayerId stay.
export async function deletePlayer(playerId) {
  const { players, results, preferences, ownPlayerId } =
    await chrome.storage.local.get(['players', 'results', 'preferences', 'ownPlayerId']);

  const { [playerId]: removed, ...restPlayers } = players  ||  {};
  if (playerId === ownPlayerId  &&  removed) {
    const { lastScrapedSession, scrapStats, ...record } = removed;
    restPlayers[playerId] = record;
  }

  const restResults = {};
  for (const [key, scores] of Object.entries(results  ||  {})) {
    const { [playerId]: __, ...rest } = scores  ||  {};
    if (Object.keys(rest).length)
      restResults[key] = rest;
  }

  const updates = { players: restPlayers, results: restResults };
  if (preferences?.hiddenRivals?.includes(playerId)) {
    updates.preferences = { ...preferences, hiddenRivals: preferences.hiddenRivals.filter((id) => id !== playerId) };
  }

  await chrome.storage.local.set(updates);
}
