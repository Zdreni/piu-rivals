import { showSessionToast, showToast } from '../ui/toasts.js';
import { isKnownPlayer, storageKey } from '../storage.js';
import { playerNameFor, saveScoreTry, syncOwnPlayerId, TAG } from './common.js';
import { loadSessionContent, scrapeSessionScores } from './sessions_content.js';

let lastSignature = null;


// Only the scrap button (allowNewPlayer) may add a player that is not stored yet.
async function saveSessionScores(result, playerName, ownPlayerId, allowNewPlayer = false) {
  const playerId = result.playerId;
  if (! playerId) {
    console.warn(`${TAG} Unable to identify the player ID for session scores`);
    return;
  }

  const stored = await chrome.storage.local.get(['results', 'players']);
  if (! allowNewPlayer  &&  ! isKnownPlayer(stored.players, playerId, ownPlayerId))
    return;

  const signature = JSON.stringify({ sessions: result, ownPlayerId });
  if (signature === lastSignature)
    return;

  lastSignature = signature;

  const updates = {};
  const events = [];
  const results = { ...(stored.results  ||  {}) };
  let resultsChanged = false;

  if (playerName) {
    const players = { ...(stored.players  ||  {}) };
    if (players[playerId]?.name !== playerName) {
      players[playerId] = { ...players[playerId], name: playerName };
      updates.players = players;
    }
  }

  for (const row of result.rows) {
    const key = storageKey(row);
    const scores = { ...(results[key]  ||  {}) };
    const scoreUpdate = saveScoreTry(scores, playerId, row.score, result.date);
    if (scores[playerId] === results[key]?.[playerId])
      continue;

    results[key] = scores;
    resultsChanged = true;
    if (scoreUpdate)
      events.push({
        kind: 'rival',
        change: scoreUpdate.change,
        track: row.track,
        chart: row.chart,
        player: playerId === ownPlayerId ? 'You' : playerName  ||  playerId,
        score: row.score,
        prevScore: scoreUpdate.prevScore,
        delta: null,
      });
  }

  if (resultsChanged)
    updates.results = results;

  if (Object.keys(updates).length)
    await chrome.storage.local.set(updates);

  if (events.length === 0)
    return;

  const player = playerId === ownPlayerId ? 'You' : playerName  ||  playerId;
  console.log(`${TAG} sessions: ${player}, ${events.length} best-score update(s)`);
  console.table(events.map((event) => ({
    type: event.change, track: event.track, chart: event.chart, player,
    score: event.score, prevScore: event.prevScore,
  })));
  showToast(player, events);
}


// Scrap counters only grow here: each session is scraped once by the button thanks to the
// checkpoint, while automatic scraping of the open session may repeat and is not counted.
// A grown checkpoint session is scraped again, adding its new scores but not another session.
async function saveScrapProgress(playerId, playerName, info, scrapedScores, isNewSession) {
  const stored = await chrome.storage.local.get(['players']);
  const players = { ...(stored.players  ||  {}) };
  const scrapStats = players[playerId]?.scrapStats  ||  {};
  players[playerId] = {
    ...players[playerId],
    lastScrapedSession: info,
    scrapStats: {
      scores: (scrapStats.scores  ||  0) + scrapedScores,
      sessions: (scrapStats.sessions  ||  0) + (isNewSession ? 1 : 0),
    },
  };

  if (playerName)
    players[playerId].name = playerName;

  await chrome.storage.local.set({ players });
}


// Opens the session of `card` (described by `info`), saves its scores and the scrap checkpoint,
// and returns the number of scraped scores. `isNewSession` is false for a grown checkpoint session.
export async function scrapeSession(card, info, playerId, pageName, isNewSession) {
  card.click();
  await loadSessionContent(info);

  const result = scrapeSessionScores();
  if (! result)
    throw new Error(`Unable to parse Phoenix 2 session "${info.title}"`);

  if (result.playerId !== playerId)
    throw new Error('Session player changed while scraping');

  const ownPlayerId = await syncOwnPlayerId();
  const playerName = playerNameFor(playerId, ownPlayerId, pageName);
  await saveSessionScores(result, playerName, ownPlayerId, true);
  await saveScrapProgress(playerId, playerName, info, result.scrapedScores, isNewSession);
  showSessionToast(
    playerName  ||  playerId,
    info.title,
    info.timestamp,
    result.scannedResults,
  );
  return result.scrapedScores;
}
