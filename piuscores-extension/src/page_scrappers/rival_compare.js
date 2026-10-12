import { showToast } from '../ui/toasts.js';
import { delta, isScrapLevel, storageKey } from '../storage.js';
import { isKnownPlayer, pagePlayerId, saveHigherScore, TAG, text } from './common.js';

let lastSignature = null;


function playerDisplayName(players, playerId) {
  return players[playerId]?.name || playerId;
}


function parseScore(cell) {
  const p = cell && cell.querySelector('.rvl-cmp-score p');
  if (!p) return null;
  const n = parseInt(p.textContent.replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}


function scrape() {
  const playerId = pagePlayerId();
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


export async function runRivalCompare(ui, ownPlayerId) {
  const result = scrape();
  if (!result) return;

  const signature = JSON.stringify({ result, ownPlayerId });
  if (signature === lastSignature) return;
  lastSignature = signature;

  const { rival, playerId } = result;
  const stored = await chrome.storage.local.get(['results', 'players']);
  // Your own scores are always saved; the rival's only once they were added via the scrap button.
  const rivalKnown = !!playerId && isKnownPlayer(stored.players, playerId, ownPlayerId);
  const events = [];
  const updates = {};
  const results = { ...(stored.results || {}) };
  let resultsChanged = false;
  if (rival && rivalKnown) {
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

    const rivalUpdate = rivalKnown ? saveHigherScore(scores, playerId, row.score) : null;
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
