import { showSessionToast, showToast } from './notifications.js';
import { createScoresUI } from './scores-ui.js';
import { delta, isScrapLevel, STORAGE_VERSION, storageKey } from './storage.js';
import { exportTargets } from './export-targets.js';

const TAG = '[piuscores]';
const ui = createScoresUI(exportTargets, scrapePlayerSessions);
let lastSignature = null;
let timer = null;
let isScrapingSessions = false;

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

function isPhoenix2Chart(element) {
  return /\/difficulty\/Phoenix2\//i.test(element?.getAttribute('src') || '');
}

function scrapeSessionScores() {
  const highlights = document.querySelector('[data-testid="session-highlight-cards"]');
  const allPlays = document.querySelector('[data-testid="session-all-plays"]');
  if (!highlights && !allPlays) return null;
  const mix = text(document.querySelector('[data-testid="session-hero"] .sbd-hero-when'))
    .split('·')[0].trim();
  if (mix !== 'Phoenix 2') return null;

  const rowsByChart = new Map();
  const addScore = (track, chart, score) => {
    if (!track || !isScrapLevel(chart) || score === null) return;
    const row = { track, chart, score };
    const key = storageKey(row);
    if (score > (rowsByChart.get(key)?.score ?? -1)) rowsByChart.set(key, row);
  };

  for (const card of highlights?.querySelectorAll('[data-testid="session-highlight-card"]') || []) {
    const difficulty = card.querySelector('img.difficulty-bubble');
    if (!isPhoenix2Chart(difficulty)) continue;
    addScore(
      text(card.querySelector('.hl-card-song')),
      difficulty.getAttribute('alt') || '',
      parseSessionScore(card),
    );
  }

  const playRows = [...(allPlays?.querySelectorAll('[data-testid="session-score-row"]') || [])];
  for (const row of playRows) {
    const difficulty = row.querySelector('img.difficulty-bubble');
    if (!isPhoenix2Chart(difficulty)) continue;
    addScore(
      text(row.querySelector('[data-testid="session-row-chart"]')),
      difficulty.getAttribute('alt') || '',
      parseSessionScore(row),
    );
  }

  return {
    playerId: location.pathname.match(/^\/Player\/([^/]+)(?:\/|$)/)?.[1] ?? null,
    rows: [...rowsByChart.values()],
    scannedResults: playRows.length,
  };
}

function sessionPagePlayerId() {
  return location.pathname.match(/^\/Player\/([^/]+)\/Sessions\/?$/)?.[1] ?? null;
}

function getSessionCards() {
  return [...document.querySelectorAll('[data-testid="session-card"]')];
}

function getSessionCardMix(card) {
  const meta = text(card.querySelector('.sbd-card-meta')).replace(/\s+/g, ' ');
  if (/^Phoenix 2(?:\s|$)/i.test(meta)) return 'Phoenix 2';
  if (/^Phoenix(?:\s|$)/i.test(meta)) return 'Phoenix';
  return null;
}

function getSessionCardInfo(card) {
  if (getSessionCardMix(card) !== 'Phoenix 2') return null;
  const meta = text(card.querySelector('.sbd-card-meta')).replace(/\s+/g, ' ');

  const title = meta.replace(/^Phoenix 2\s*(?:·|-)?\s*/i, '').trim();
  const timestamp = text(card.querySelector('.sbd-card-when')).replace(/\s+/g, ' ');
  if (!title || !timestamp) return null;
  return { title, timestamp };
}

function currentPhoenix2Sessions() {
  const sessions = [];
  for (const card of getSessionCards()) {
    const mix = getSessionCardMix(card);
    if (mix === 'Phoenix') return { sessions, reachedPhoenix: true };
    if (mix !== 'Phoenix 2') continue;
    const info = getSessionCardInfo(card);
    if (info) sessions.push({ card, info });
  }
  return { sessions, reachedPhoenix: false };
}

function sessionCardSignature() {
  return JSON.stringify(getSessionCards().map((card) => getSessionCardInfo(card) || text(card)));
}

function sessionCheckpointMatches(checkpoint, info) {
  return checkpoint?.title === info.title && checkpoint?.timestamp === info.timestamp;
}

function findPageButton(direction) {
  const main = document.querySelector('main') || document;
  const controls = [...main.querySelectorAll(
    '.mud-pagination button, [aria-label*="page" i] button, button[aria-label*="page" i]',
  )];
  const candidates = controls.length
    ? controls
    : [...main.querySelectorAll('button, a[role="button"]')];
  const label = (button) => [
    button.getAttribute('aria-label'),
    button.getAttribute('title'),
    text(button),
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const patterns = {
    older: /\bolder\b|\bnext page\b|^next$/,
    newer: /\bnewer\b|\bprevious page\b|^previous$/,
  };

  return candidates.find((button) => {
    const value = label(button);
    return patterns[direction].test(value)
      && !button.disabled
      && button.getAttribute('aria-disabled') !== 'true';
  }) || null;
}

function sameSessionDate(cardTimestamp, heroTimestamp) {
  const cardDate = cardTimestamp.match(/\b(\d{1,2})\s+([A-Za-z]{3})\s*·\s*(\d{1,2}:\d{2}\s*[AP]M)\b/i);
  const heroDate = heroTimestamp.match(/\b(\d{1,2})\/(\d{1,2})\/\d{4}\s+(\d{1,2}:\d{2}\s*[AP]M)\b/i);
  if (!cardDate || !heroDate) return false;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return Number(cardDate[1]) === Number(heroDate[2])
    && months.indexOf(cardDate[2].toLowerCase()) + 1 === Number(heroDate[1])
    && cardDate[3].replace(/\s+/g, '').toLowerCase() === heroDate[3].replace(/\s+/g, '').toLowerCase();
}

function waitForChange(predicate, description, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const observer = new MutationObserver(() => {
      if (predicate()) {
        observer.disconnect();
        clearInterval(timerId);
        resolve();
      }
    });
    const timerId = setInterval(() => {
      if (predicate()) {
        observer.disconnect();
        clearInterval(timerId);
        resolve();
      } else if (Date.now() - startedAt >= timeoutMs) {
        observer.disconnect();
        clearInterval(timerId);
        reject(new Error(`Timed out waiting for ${description}`));
      }
    }, 100);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    if (predicate()) {
      observer.disconnect();
      clearInterval(timerId);
      resolve();
    }
  });
}

async function clickPageButton(button, direction) {
  if (!button) return false;
  const before = sessionCardSignature();
  button.click();
  await waitForChange(() => sessionCardSignature() !== before, `${direction} Sessions page`);
  return true;
}

async function saveSessionCheckpoint(playerId, info) {
  const stored = await chrome.storage.local.get(['players']);
  const players = { ...(stored.players || {}) };
  players[playerId] = {
    ...players[playerId],
    lastScrapedSession: info,
  };
  const name = playerName();
  if (name) players[playerId].name = name;
  await chrome.storage.local.set({ players });
}

async function parseSessionCard(card, info, playerId, report, progress) {
  card.click();
  await waitForChange(() => {
    const hero = document.querySelector('[data-testid="session-hero"]');
    const heroWhen = text(hero?.querySelector('.sbd-hero-when'));
    const heroTitle = text(hero?.querySelector('.sbd-hero-title'));
    const cardTitle = info.title.split('·')[0].trim();
    return heroWhen.split('·')[0].trim() === 'Phoenix 2'
      && heroTitle === cardTitle
      && sameSessionDate(info.timestamp, heroWhen)
      && !!document.querySelector('[data-testid="session-all-plays"]');
  }, `session "${info.title}" to open`);

  const showAll = document.querySelector('[data-testid="session-show-all-plays"]');
  if (showAll) {
    showAll.click();
    await waitForChange(() => {
      if (!document.querySelector('[data-testid="session-show-all-plays"]')) return true;
      const tally = [...document.querySelectorAll('[data-testid="session-hero"] .sbd-tally > div')]
        .find((item) => text(item.querySelector('.sbd-tally-k')) === 'Plays');
      const total = parseInt(text(tally?.querySelector('.sbd-tally-v')).replace(/[^\d]/g, ''), 10);
      return Number.isFinite(total)
        && document.querySelectorAll('[data-testid="session-score-row"]').length >= total;
    },
      `all plays for "${info.title}" to load`);
  }

  const result = scrapeSessionScores();
  if (!result) throw new Error(`Unable to parse Phoenix 2 session "${info.title}"`);
  if (result.playerId !== playerId) throw new Error('Session player changed while scraping');
  await runSessionScores(result, await syncOwnPlayerId());
  await saveSessionCheckpoint(playerId, info);
  progress.count++;
  report(`Scraped ${progress.count}: ${info.title} (${info.timestamp})`);
  showSessionToast(
    ui.ensure(),
    playerName() || playerId,
    info.title,
    info.timestamp,
    result.scannedResults,
  );
}

function currentPhoenix2SessionCards() {
  return currentPhoenix2Sessions().sessions;
}

function findCurrentCard(info) {
  return currentPhoenix2SessionCards().find((item) =>
    sessionCheckpointMatches(info, item.info))?.card || null;
}

async function scrapePlayerSessions(report = () => {}) {
  const playerId = sessionPagePlayerId();
  if (!playerId) throw new Error('Scrap results is only available on a player Sessions page');
  if (isScrapingSessions) return;
  isScrapingSessions = true;

  try {
    const stored = await chrome.storage.local.get(['players']);
    const checkpoint = stored.players?.[playerId]?.lastScrapedSession || null;
    const pages = [];
    const seenPages = new Set();
    let checkpointFound = !checkpoint;
    let reachedPhoenixBoundary = false;

    if (!checkpoint) {
      let signature = sessionCardSignature();
      while (!seenPages.has(signature)) {
        seenPages.add(signature);
        const page = currentPhoenix2Sessions();
        pages.push(page.sessions.map(({ info }) => info));
        if (page.reachedPhoenix) break;
        const next = findPageButton('older');
        if (!next) break;
        await clickPageButton(next, 'older');
        signature = sessionCardSignature();
      }
    } else {
      let signature = sessionCardSignature();
      while (!seenPages.has(signature)) {
        seenPages.add(signature);
        const page = [];
        const currentPage = currentPhoenix2Sessions();
        for (const { info } of currentPage.sessions) {
          if (sessionCheckpointMatches(checkpoint, info)) {
            checkpointFound = true;
            break;
          }
          page.push(info);
        }
        pages.push(page);
        if (checkpointFound || currentPage.reachedPhoenix) {
          reachedPhoenixBoundary = currentPage.reachedPhoenix;
          break;
        }
        const next = findPageButton('older');
        if (!next) break;
        await clickPageButton(next, 'older');
        signature = sessionCardSignature();
      }
    }

    if (checkpoint && !checkpointFound && !reachedPhoenixBoundary) {
      throw new Error('Saved session checkpoint was not found in the Sessions history');
    }

    const progress = { count: 0 };
    for (let pageIndex = pages.length - 1; pageIndex >= 0; pageIndex--) {
      for (const info of [...pages[pageIndex]].reverse()) {
        const card = findCurrentCard(info);
        if (!card) throw new Error(`Session "${info.title}" is no longer visible on its page`);
        report(`Opening ${info.title} (${info.timestamp})`);
        await parseSessionCard(card, info, playerId, report, progress);
      }
      if (pageIndex > 0) {
        const newer = findPageButton('newer');
        if (!newer) throw new Error('Unable to return to newer Sessions pages');
        await clickPageButton(newer, 'newer');
      }
    }
    report(`Scraping complete: ${progress.count} Phoenix 2 session(s)`);
  } finally {
    isScrapingSessions = false;
  }
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
