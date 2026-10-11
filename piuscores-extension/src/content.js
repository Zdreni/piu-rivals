import { showToast } from './notifications.js';
import { createScoresUI } from './scores-ui.js';
import { delta, normalize, storageKey } from './storage.js';
import { exportTargets } from './export-targets.js';

const TAG = '[piuscores]';
const ui = createScoresUI(exportTargets);
let lastSignature = null;
let timer = null;

const text = (el) => (el ? el.textContent.trim() : '');

function parseScore(cell) {
  const p = cell && cell.querySelector('.rvl-cmp-score p');
  if (!p) return null;
  const n = parseInt(p.textContent.replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

function scrape() {
  const table = document.querySelector('[data-testid="rival-compare-table"]');
  if (!table) return null;

  const headers = table.querySelectorAll('thead th');
  const rival = text(headers[2]) || text(document.querySelector('[data-testid="player-hero"] h5'));
  const rows = [];
  for (const tr of table.querySelectorAll('tbody tr')) {
    const cells = tr.querySelectorAll('td');
    if (cells.length < 3) continue;

    const songEl = cells[0].querySelector('.rvl-cmp-song');
    const track = songEl ? (songEl.getAttribute('title') || text(songEl)) : '';
    const chart = cells[0].querySelector('img.difficulty-bubble')?.getAttribute('alt') || '';
    rows.push({ track, chart, mine: parseScore(cells[1]), score: parseScore(cells[2]) });
  }
  return { rival, rows };
}

async function run() {
  const result = scrape();
  if (!result || result.rows.length === 0) return;

  const signature = JSON.stringify(result);
  if (signature === lastSignature) return;
  lastSignature = signature;

  const { rival } = result;
  const keys = [...new Set(result.rows.map(storageKey))];
  const stored = await chrome.storage.local.get(keys);
  const events = [];
  const updates = {};

  for (const row of result.rows) {
    const key = storageKey(row);
    const entry = updates[key] || normalize(stored[key]);
    const before = JSON.stringify(entry);
    const { track, chart } = row;

    if (row.score !== null && entry.rivals[rival] !== row.score) {
      const prevScore = entry.rivals[rival] ?? null;
      entry.rivals[rival] = row.score;
      events.push({
        kind: 'rival', change: prevScore === null ? 'new' : 'upd', track, chart, player: rival,
        score: row.score, prevScore, delta: delta(row.mine, row.score),
      });
    }

    if (entry.mine !== row.mine) {
      const prevScore = entry.mine ?? null;
      entry.mine = row.mine;
      if (row.mine !== null) {
        const deltas = Object.entries(entry.rivals)
          .map(([player, score]) => ({ player, score, delta: delta(row.mine, score) }))
          .sort((a, b) => a.delta - b.delta);
        events.push({
          kind: 'mine', change: prevScore === null ? 'new' : 'upd', track, chart,
          score: row.mine, prevScore, deltas,
        });
      }
    }

    if (JSON.stringify(entry) !== before) updates[key] = entry;
  }

  if (Object.keys(updates).length) await chrome.storage.local.set(updates);
  if (events.length === 0) return;

  console.log(`${TAG} rival: ${rival}, ${events.length} change(s)`);
  console.table(events.flatMap((event) => (event.kind === 'rival'
    ? [{ type: event.change, track: event.track, chart: event.chart, player: event.player, score: event.score, prevScore: event.prevScore, delta: event.delta }]
    : [
        { type: `mine ${event.change}`, track: event.track, chart: event.chart, player: 'You', score: event.score, prevScore: event.prevScore, delta: null },
        ...event.deltas.map((d) => ({ type: 'delta', track: event.track, chart: event.chart, player: d.player, score: d.score, prevScore: null, delta: d.delta })),
      ])));
  showToast(ui.ensure(), rival, events);
}

chrome.storage.onChanged.addListener((_, area) => {
  if (area === 'local' && ui.isOpen()) ui.render().catch((error) => console.error(TAG, error));
});

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
