import { showToast } from './notifications.js';
import { createScoresUI } from './scores-ui.js';
import { delta, isScrapLevel, STORAGE_VERSION, storageKey } from './storage.js';
import { exportTargets } from './export-targets.js';

const TAG = '[piuscores]';
const ui = createScoresUI(exportTargets);
let lastSignature = null;
let timer = null;

const text = (el) => (el ? el.textContent.trim() : '');

function findOwnPlayerId() {
  for (const link of document.querySelectorAll('a[href]')) {
    if (text(link).replace(/\s+/g, ' ') !== 'My Sessions') continue;

    const url = new URL(link.href, location.href);
    if (url.hostname !== location.hostname) continue;
    const match = url.pathname.match(/^\/Player\/([^/]+)\/Sessions\/?$/);
    if (match) return match[1];
  }
  return null;
}

async function syncOwnPlayerId() {
  const scrapedId = findOwnPlayerId();
  const { ownPlayerId } = await chrome.storage.local.get('ownPlayerId');
  if (scrapedId && scrapedId !== ownPlayerId) {
    await chrome.storage.local.set({ ownPlayerId: scrapedId });
    return scrapedId;
  }
  return typeof ownPlayerId === 'string' ? ownPlayerId : null;
}

async function ensureStorageVersion() {
  const { storageVersion } = await chrome.storage.local.get('storageVersion');
  if (storageVersion === undefined) {
    await chrome.storage.local.set({ storageVersion: STORAGE_VERSION });
  } else if (storageVersion !== STORAGE_VERSION) {
    console.warn(`${TAG} Stored data version ${storageVersion} differs from supported version ${STORAGE_VERSION}`);
  }
}

function playerName() {
  return text(document.querySelector('main h5')).replace(/\s+[—–-]\s+Sessions$/i, '').trim();
}

function playerDisplayName(players, playerId) {
  return players[playerId]?.name || playerId;
}

function saveHigherScore(scores, playerId, score) {
  if (!playerId || score === null || score <= (scores[playerId] ?? -1)) return null;
  const prevScore = scores[playerId] ?? null;
  scores[playerId] = score;
  return { prevScore, change: prevScore === null ? 'new' : 'upd' };
}

function parseScore(cell) {
  const p = cell && cell.querySelector('.rvl-cmp-score p');
  if (!p) return null;
  const n = parseInt(p.textContent.replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

function parseSessionScore(element) {
  const p = element?.querySelector('[data-testid="peer-score"] p');
  if (!p) return null;
  const n = parseInt(p.textContent.replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

function scrapeSessionScores() {
  const highlights = document.querySelector('[data-testid="session-highlight-cards"]');
  const allPlays = document.querySelector('[data-testid="session-all-plays"]');
  if (!highlights && !allPlays) return null;

  const rowsByChart = new Map();
  const addScore = (track, chart, score) => {
    if (!track || !isScrapLevel(chart) || score === null) return;
    const row = { track, chart, score };
    const key = storageKey(row);
    if (score > (rowsByChart.get(key)?.score ?? -1)) rowsByChart.set(key, row);
  };

  for (const card of highlights?.querySelectorAll('[data-testid="session-highlight-card"]') || []) {
    addScore(
      text(card.querySelector('.hl-card-song')),
      card.querySelector('img.difficulty-bubble')?.getAttribute('alt') || '',
      parseSessionScore(card),
    );
  }

  for (const row of document.querySelectorAll('[data-testid="session-score-row"]')) {
    addScore(
      text(row.querySelector('[data-testid="session-row-chart"]')),
      row.querySelector('img.difficulty-bubble')?.getAttribute('alt') || '',
      parseSessionScore(row),
    );
  }

  return {
    playerId: location.pathname.match(/^\/Player\/([^/]+)(?:\/|$)/)?.[1] ?? null,
    rows: [...rowsByChart.values()],
  };
}

function scrape() {
  const playerId = location.pathname.match(/^\/Player\/([^/]+)(?:\/|$)/)?.[1] ?? null;
  const table = document.querySelector('[data-testid="rival-compare-table"]');

  const headers = table?.querySelectorAll('thead th');
  const rival = text(headers?.[2]) || text(document.querySelector('[data-testid="player-hero"] h5'));
  const rows = [];
  for (const tr of table?.querySelectorAll('tbody tr') || []) {
    const cells = tr.querySelectorAll('td');
    if (cells.length < 3) continue;

    const songEl = cells[0].querySelector('.rvl-cmp-song');
    const track = songEl ? (songEl.getAttribute('title') || text(songEl)) : '';
    const chart = cells[0].querySelector('img.difficulty-bubble')?.getAttribute('alt') || '';
    if (!isScrapLevel(chart)) continue;
    rows.push({ track, chart, mine: parseScore(cells[1]), score: parseScore(cells[2]) });
  }
  return { rival, playerId, rows };
}

async function runSessionScores(result, ownPlayerId) {
  const signature = JSON.stringify({ sessions: result, ownPlayerId });
  if (signature === lastSignature) return;
  lastSignature = signature;

  const stored = await chrome.storage.local.get(['results', 'players']);
  const playerId = result.playerId;
  if (!playerId) {
    console.warn(`${TAG} Unable to identify the player ID for session scores`);
    return;
  }
  const name = playerName();
  const updates = {};
  const events = [];
  const results = { ...(stored.results || {}) };
  let resultsChanged = false;

  if (name) {
    const players = { ...(stored.players || {}) };
    if (players[playerId]?.name !== name) {
      players[playerId] = { ...players[playerId], name };
      updates.players = players;
    }
  }

  for (const row of result.rows) {
    const key = storageKey(row);
    const scores = { ...(results[key] || {}) };
    const scoreUpdate = saveHigherScore(scores, playerId, row.score);
    if (!scoreUpdate) continue;
    results[key] = scores;
    resultsChanged = true;
    if (scoreUpdate) events.push({
      kind: 'rival',
      change: scoreUpdate.change,
      track: row.track,
      chart: row.chart,
      player: playerId === ownPlayerId ? 'You' : name || playerId,
      score: row.score,
      prevScore: scoreUpdate.prevScore,
      delta: null,
    });
  }

  if (resultsChanged) updates.results = results;
  if (Object.keys(updates).length) await chrome.storage.local.set(updates);
  if (events.length === 0) return;

  const player = playerId === ownPlayerId ? 'You' : name || playerId;
  console.log(`${TAG} sessions: ${player}, ${events.length} best-score update(s)`);
  console.table(events.map((event) => ({
    type: event.change, track: event.track, chart: event.chart, player,
    score: event.score, prevScore: event.prevScore,
  })));
  showToast(ui.ensure(), player, events);
}

async function run() {
  await ensureStorageVersion();
  const ownPlayerId = await syncOwnPlayerId();
  const sessionResult = scrapeSessionScores();
  if (sessionResult) {
    await runSessionScores(sessionResult, ownPlayerId);
    return;
  }

  const result = scrape();
  if (!result) return;

  const signature = JSON.stringify({ result, ownPlayerId });
  if (signature === lastSignature) return;
  lastSignature = signature;

  const { rival, playerId } = result;
  const stored = await chrome.storage.local.get(['results', 'players']);
  const events = [];
  const updates = {};
  const results = { ...(stored.results || {}) };
  let resultsChanged = false;
  if (rival && playerId) {
    const players = { ...(stored.players || {}) };
    if (players[playerId]?.name !== rival) {
      players[playerId] = { ...players[playerId], name: rival };
      updates.players = players;
    }
  }

  for (const row of result.rows) {
    const key = storageKey(row);
    const scores = { ...(results[key] || {}) };
    const { track, chart } = row;

    const rivalUpdate = saveHigherScore(scores, playerId, row.score);
    if (rivalUpdate) {
      events.push({
        kind: 'rival',
        change: rivalUpdate.change,
        track,
        chart,
        player: playerId === ownPlayerId ? 'You' : rival,
        score: row.score,
        prevScore: rivalUpdate.prevScore,
        delta: delta(scores[ownPlayerId] ?? null, row.score),
      });
    }

    const mineUpdate = saveHigherScore(scores, ownPlayerId, row.mine);
    if (mineUpdate) {
      const deltas = Object.entries(scores)
        .filter(([id]) => id !== ownPlayerId)
        .map(([id, score]) => ({
          player: playerDisplayName(stored.players || {}, id),
          score,
          delta: delta(row.mine, score),
        }))
        .sort((a, b) => a.delta - b.delta);
      events.push({
        kind: 'mine',
        change: mineUpdate.change,
        track,
        chart,
        score: row.mine,
        prevScore: mineUpdate.prevScore,
        deltas,
      });
    }

    if (rivalUpdate || mineUpdate) {
      results[key] = scores;
      resultsChanged = true;
    }
  }

  if (resultsChanged) updates.results = results;
  if (Object.keys(updates).length) await chrome.storage.local.set(updates);
  if (events.length === 0) return;

  const player = playerId === ownPlayerId ? 'You' : rival;
  console.log(`${TAG} rival: ${player}, ${events.length} change(s)`);
  console.table(events.flatMap((event) => (event.kind === 'rival'
    ? [{ type: event.change, track: event.track, chart: event.chart, player: event.player, score: event.score, prevScore: event.prevScore, delta: event.delta }]
    : [
        { type: `mine ${event.change}`, track: event.track, chart: event.chart, player: 'You', score: event.score, prevScore: event.prevScore, delta: null },
        ...event.deltas.map((d) => ({ type: 'delta', track: event.track, chart: event.chart, player: d.player, score: d.score, prevScore: null, delta: d.delta })),
      ])));
  showToast(ui.ensure(), player, events);
}

chrome.storage.onChanged.addListener((_, area) => {
  if (area === 'local' && ui.isOpen()) ui.render().catch((error) => console.error(TAG, error));
});

ui.initialize();

let pending = Promise.resolve();
const schedule = () => {
  ui.ensure();
  clearTimeout(timer);
  timer = setTimeout(() => {
    pending = pending.then(run).catch((error) => console.error(TAG, error));
  }, 500);
};

new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
schedule();
