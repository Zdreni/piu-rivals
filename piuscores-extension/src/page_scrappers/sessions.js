import { showSessionToast, showToast } from '../ui/toasts.js';
import { displayName, isScrapLevel, storageKey } from '../storage.js';
import {
  isKnownPlayer, logPumbility, pagePlayerId, parseNumber, saveHigherScore, savePlayerInfo, syncOwnPlayerId, TAG, text, waitForChange,
} from './common.js';

let lastSignature = null;
let isScrapingSessions = false;


const sessionsPumbility = () => parseNumber(text(document.querySelector(
  '[data-testid="session-ceremony"] .sbd-pumb-big',
)));


const isNewestSessionOpen = () =>
  !!document.querySelector('[data-testid="session-card"]')?.classList.contains('sbd-card-now')
  && !findPageButton('newer');


// The ceremony block shows PUMBILITY as of the open session, so it is only current
// when the newest session (first card on the first page) is the one showing.
async function syncSessionsPumbility(ownPlayerId) {
  const playerId = sessionPagePlayerId();
  if (!playerId) return;
  const pumbility = sessionsPumbility();
  if (pumbility === null) return;
  if (!isNewestSessionOpen()) {
    logPumbility(`found ${pumbility} for ${playerName() || playerId} (${playerId}) on Sessions page: `
      + 'not the newest session, ignoring');
    return;
  }
  await savePlayerInfo(playerId, playerName(), pumbility, ownPlayerId, 'Sessions page');
}


// A new player is added with their PUMBILITY before any session is opened, while the newest
// session still shows. The ceremony block may render after the cards, so it is awaited briefly;
// without it the player is still added and PUMBILITY is filled in after the scan.
async function addNewPlayer(playerId, report) {
  report('Adding player');
  if (isNewestSessionOpen()) {
    await waitForChange(() => sessionsPumbility() !== null, 'PUMBILITY', 3000)
      .catch((error) => console.warn(TAG, error.message));
  }
  const pumbility = isNewestSessionOpen() ? sessionsPumbility() : null;
  await savePlayerInfo(playerId, playerName(), pumbility, await syncOwnPlayerId(), 'Sessions page', true);
}


function playerName() {
  return text(document.querySelector('main h5')).replace(/\s+[—–-]\s+Sessions$/i, '').trim();
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
    if (!track || !isScrapLevel(chart) || score === null) return false;
    const row = { track, chart, score };
    const key = storageKey(row);
    if (score > (rowsByChart.get(key)?.score ?? -1)) rowsByChart.set(key, row);
    return true;
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

  // Highlight cards repeat plays from the full list, so only the list rows are counted.
  const playRows = [...(allPlays?.querySelectorAll('[data-testid="session-score-row"]') || [])];
  let scrapedScores = 0;
  for (const row of playRows) {
    const difficulty = row.querySelector('img.difficulty-bubble');
    if (!isPhoenix2Chart(difficulty)) continue;
    if (addScore(
      text(row.querySelector('[data-testid="session-row-chart"]')),
      difficulty.getAttribute('alt') || '',
      parseSessionScore(row),
    )) scrapedScores++;
  }

  return {
    playerId: pagePlayerId(),
    rows: [...rowsByChart.values()],
    scannedResults: playRows.length,
    scrapedScores,
  };
}


function sessionPagePlayerId() {
  return isSessionsPage() ? pagePlayerId() : null;
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


// Card timestamps look like "Mon 12 Oct · 6:55 PM"; returns null when the format is different.
function parseCardTimestamp(timestamp) {
  const match = timestamp.match(/(\d{1,2})\s+([A-Za-z]{3})\s*·\s*(\d{1,2}):(\d{2})\s*([AP])M/i);
  if (!match) return null;
  const [, day, month, hours, minutes, half] = match;
  return {
    date: `${Number(day)} ${month.toLowerCase()}`,
    minutes: (Number(hours) % 12 + (half.toUpperCase() === 'P' ? 12 : 0)) * 60 + Number(minutes),
  };
}


// A session that is still active grows when more plays are imported, and its card timestamp
// moves to the latest play, so the stored checkpoint no longer matches exactly. Only the newest
// session can grow, so it is the first card on the first page: same title, same day, later time,
// while the exact checkpoint card is not on the page (otherwise the first card is a new session).
function findGrownCheckpoint(checkpoint, sessions) {
  const first = sessions[0]?.info;
  if (!checkpoint || !first || findPageButton('newer')) return null;
  if (sessions.some(({ info }) => sessionCheckpointMatches(checkpoint, info))) return null;
  const was = parseCardTimestamp(checkpoint.timestamp);
  const now = parseCardTimestamp(first.timestamp);
  return first.title === checkpoint.title && was && now && was.date === now.date && now.minutes > was.minutes
    ? first
    : null;
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
  // No trailing \b: imported sessions glue the next text right after AM/PM ("6:31 PMimported from ...").
  const heroDate = heroTimestamp.match(/\b(\d{1,2})\/(\d{1,2})\/\d{4}\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (!cardDate || !heroDate) return false;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return Number(cardDate[1]) === Number(heroDate[2])
    && months.indexOf(cardDate[2].toLowerCase()) + 1 === Number(heroDate[1])
    && cardDate[3].replace(/\s+/g, '').toLowerCase() === heroDate[3].replace(/\s+/g, '').toLowerCase();
}


async function clickPageButton(button, direction) {
  if (!button) return false;
  const before = sessionCardSignature();
  button.click();
  await waitForChange(() => sessionCardSignature() !== before, `${direction} Sessions page`);
  return true;
}


// Scrap counters only grow here: each session is scraped once by the button thanks to the
// checkpoint, while automatic scraping of the open session may repeat and is not counted.
// A grown checkpoint session is scraped again, adding its new scores but not another session.
async function saveSessionCheckpoint(playerId, info, scrapedScores, isNewSession) {
  const stored = await chrome.storage.local.get(['players']);
  const players = { ...(stored.players || {}) };
  const scrapStats = players[playerId]?.scrapStats || {};
  players[playerId] = {
    ...players[playerId],
    lastScrapedSession: info,
    scrapStats: {
      scores: (scrapStats.scores || 0) + scrapedScores,
      sessions: (scrapStats.sessions || 0) + (isNewSession ? 1 : 0),
    },
  };
  const name = playerName();
  if (name) players[playerId].name = name;
  await chrome.storage.local.set({ players });
}


// Lists why the opened session doesn't match the clicked card yet; empty once it does.
function openSessionMismatches(info) {
  const hero = document.querySelector('[data-testid="session-hero"]');
  if (!hero) return ['session hero is missing'];
  const heroWhen = text(hero.querySelector('.sbd-hero-when'));
  const heroTitle = text(hero.querySelector('.sbd-hero-title'));
  const heroMix = heroWhen.split('·')[0].trim();
  const cardTitle = info.title.split('·')[0].trim();
  const mismatches = [];
  if (heroMix !== 'Phoenix 2') mismatches.push(`mix: hero "${heroMix}", expected "Phoenix 2"`);
  if (heroTitle !== cardTitle) mismatches.push(`title: hero "${heroTitle}", card "${cardTitle}"`);
  if (!sameSessionDate(info.timestamp, heroWhen)) {
    mismatches.push(`date: hero "${heroWhen}", card "${info.timestamp}"`);
  }
  if (!document.querySelector('[data-testid="session-all-plays"]')) mismatches.push('all plays list is missing');
  return mismatches;
}


async function parseSessionCard(card, info, playerId, report, progress) {
  card.click();
  try {
    await waitForChange(() => openSessionMismatches(info).length === 0, `session "${info.title}" to open`);
  } catch (error) {
    console.error(`${TAG} Session "${info.title}" (${info.timestamp}) didn't open:\n  `
      + openSessionMismatches(info).join('\n  '));
    throw error;
  }

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
  await runSessionScores(result, await syncOwnPlayerId(), true);
  await saveSessionCheckpoint(playerId, info, result.scrapedScores, info !== progress.grown);
  progress.count++;
  progress.results += result.scrapedScores;
  showSessionToast(
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


export async function scrapePlayerSessions(report = () => {}) {
  const playerId = sessionPagePlayerId();
  if (!playerId) throw new Error('Grabbing scores is only available on a player Sessions page');
  if (isScrapingSessions) return;
  isScrapingSessions = true;

  try {
    const stored = await chrome.storage.local.get(['players', 'ownPlayerId']);
    if (!isKnownPlayer(stored.players, playerId, stored.ownPlayerId)) await addNewPlayer(playerId, report);
    const checkpoint = stored.players?.[playerId]?.lastScrapedSession || null;
    const pages = [];
    const seenPages = new Set();
    let checkpointFound = !checkpoint;
    let reachedPhoenixBoundary = false;
    let grown = null;
    const countFound = () => pages.reduce((sum, page) => sum + page.length, 0);
    const reportFound = () => report(`Searching sessions, ${countFound()} found...`);

    if (!checkpoint) {
      let signature = sessionCardSignature();
      while (!seenPages.has(signature)) {
        seenPages.add(signature);
        const page = currentPhoenix2Sessions();
        pages.push(page.sessions.map(({ info }) => info));
        reportFound();
        if (page.reachedPhoenix) break;
        const next = findPageButton('older');
        if (!next) break;
        await clickPageButton(next, 'older');
        signature = sessionCardSignature();
      }
    } else {
      grown = findGrownCheckpoint(checkpoint, currentPhoenix2Sessions().sessions);
      if (grown) {
        pages.push([grown]);
        checkpointFound = true;
        reportFound();
      }
      let signature = sessionCardSignature();
      while (!grown && !seenPages.has(signature)) {
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
        reportFound();
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

    const total = countFound();
    const progress = { count: 0, results: 0, grown };
    for (let pageIndex = pages.length - 1; pageIndex >= 0; pageIndex--) {
      for (const info of [...pages[pageIndex]].reverse()) {
        const card = findCurrentCard(info);
        if (!card) throw new Error(`Session "${info.title}" is no longer visible on its page`);
        report(`Scrapping session ${progress.count + 1} of ${total}...`);
        await parseSessionCard(card, info, playerId, report, progress);
      }
      if (pageIndex > 0) {
        const newer = findPageButton('newer');
        if (!newer) throw new Error('Unable to return to newer Sessions pages');
        await clickPageButton(newer, 'newer');
      }
    }
    // Sessions are parsed oldest first, so the newest one is open now; this catches PUMBILITY
    // when it couldn't be read before scanning (e.g. an older session was open).
    if (progress.count) await syncSessionsPumbility(await syncOwnPlayerId());
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    report(`Finished scrapping ${plural(progress.count, 'session')} with ${plural(progress.results, 'result')}`);
    return true;
  } finally {
    isScrapingSessions = false;
  }
}


// Only the scrap button (allowNewPlayer) may add a player that is not stored yet.
async function runSessionScores(result, ownPlayerId, allowNewPlayer = false) {
  const playerId = result.playerId;
  if (!playerId) {
    console.warn(`${TAG} Unable to identify the player ID for session scores`);
    return;
  }
  const stored = await chrome.storage.local.get(['results', 'players']);
  if (!allowNewPlayer && !isKnownPlayer(stored.players, playerId, ownPlayerId)) return;

  const signature = JSON.stringify({ sessions: result, ownPlayerId });
  if (signature === lastSignature) return;
  lastSignature = signature;

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
  showToast(player, events);
}


export function isSessionsPage() {
  return /^\/Player\/[^/]+\/Sessions\/?$/.test(location.pathname);
}


function isSessionsContentLoaded() {
  return isSessionsPage() && getSessionCards().length > 0;
}


// Counts the Phoenix 2 sessions on the current page newer than the last scraped one; `more` is
// set when all of them are new and older pages may hold further new sessions.
function countNewSessions(checkpoint) {
  const { sessions, reachedPhoenix } = currentPhoenix2Sessions();
  const index = checkpoint ? sessions.findIndex(({ info }) => sessionCheckpointMatches(checkpoint, info)) : -1;
  if (index >= 0) return { count: index, more: false };
  if (findGrownCheckpoint(checkpoint, sessions)) return { count: 1, more: false };
  return { count: sessions.length, more: !reachedPhoenix && !!findPageButton('older') };
}


// Stored players are cached so the scrap button state can be computed synchronously on every
// DOM change; null until first loaded.
let cachedStorage = null;


export async function loadScrapState() {
  const { players, ownPlayerId } = await chrome.storage.local.get(['players', 'ownPlayerId']);
  cachedStorage = { players: players || {}, ownPlayerId: typeof ownPlayerId === 'string' ? ownPlayerId : null };
}


// Returns { known, name, pumbility, count, more } for the open Sessions page, or null while it
// can't be told yet. pumbility is null unless the newest session is showing.
export function getScrapInfo() {
  const playerId = sessionPagePlayerId();
  if (!playerId || !cachedStorage || !isSessionsContentLoaded()) return null;
  const { players, ownPlayerId } = cachedStorage;
  return {
    known: isKnownPlayer(players, playerId, ownPlayerId),
    name: displayName(playerName()),
    pumbility: isNewestSessionOpen() ? sessionsPumbility() : null,
    ...countNewSessions(players[playerId]?.lastScrapedSession || null),
  };
}


export async function runSessionsPage(ownPlayerId) {
  await syncSessionsPumbility(ownPlayerId);
}
