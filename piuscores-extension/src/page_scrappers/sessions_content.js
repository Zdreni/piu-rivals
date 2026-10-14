import { isScrapLevel, storageKey } from '../storage.js';
import { pagePlayerId, parseNumber, TAG, text, waitForChange } from './common.js';
import { getSessionCards, isNewestSessionOpen } from './sessions_list.js';


export function isSessionsPage() {
  return /^\/Player\/[^/]+\/Sessions\/?$/.test(location.pathname);
}


export function sessionPagePlayerId() {
  return isSessionsPage() ? pagePlayerId() : null;
}


export function pagePlayerName() {
  return text(document.querySelector('main h5')).replace(/\s+[—–-]\s+Sessions$/i, '').trim();
}


export const readOpenSessionPumbility = () => parseNumber(text(document.querySelector(
  '[data-testid="session-ceremony"] .sbd-pumb-big',
)));


// Returns { playerId, name, pumbility } for the open Sessions page once its cards have loaded,
// or null. pumbility is null unless the newest session is showing.
export function readSessionsPage() {
  const playerId = sessionPagePlayerId();
  if (! playerId  ||  getSessionCards().length === 0)
    return null;

  return { playerId, name: pagePlayerName(), pumbility: isNewestSessionOpen() ? readOpenSessionPumbility() : null };
}


function parsePlayScore(element) {
  const p = element?.querySelector('[data-testid="peer-score"] p');
  if (! p)
    return null;

  const n = parseInt(p.textContent.replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}


function isPhoenix2Chart(element) {
  return /\/difficulty\/Phoenix2\//i.test(element?.getAttribute('src')  ||  '');
}


// The session summary reads like "Phoenix 2 · 9/24/2026 8:27 PM · 740 min..."; only the date right after the
// mix is parsed. Returns "YYYY-MM-DD", or null when the format is different.
function parseSummaryDate(summary) {
  const match = (summary.split('·')[1]  ||  '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/);
  if (! match)
    return null;

  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}


export function scrapeSessionScores() {
  const highlights = document.querySelector('[data-testid="session-highlight-cards"]');
  const allPlays = document.querySelector('[data-testid="session-all-plays"]');
  if (! highlights  &&  ! allPlays)
    return null;

  const summary = text(document.querySelector('[data-testid="session-hero"] .sbd-hero-when'));
  const mix = summary.split('·')[0].trim();
  if (mix !== 'Phoenix 2')
    return null;

  const date = parseSummaryDate(summary);
  if (! date)
    console.warn(`${TAG} Unable to parse the session date from "${summary}"`);

  const rowsByChart = new Map();

  const addScore = (track, chart, score) => {
    if (! track  ||  ! isScrapLevel(chart)  ||  score === null)
      return false;

    const row = { track, chart, score };
    const key = storageKey(row);
    if (score > (rowsByChart.get(key)?.score ?? -1))
      rowsByChart.set(key, row);

    return true;
  };

  for (const card of highlights?.querySelectorAll('[data-testid="session-highlight-card"]')  ||  []) {
    const difficulty = card.querySelector('img.difficulty-bubble');
    if (! isPhoenix2Chart(difficulty))
      continue;

    addScore(
      text(card.querySelector('.hl-card-song')),
      difficulty.getAttribute('alt')  ||  '',
      parsePlayScore(card),
    );
  }

  // Highlight cards repeat plays from the full list, so only the list rows are counted.
  const playRows = [...(allPlays?.querySelectorAll('[data-testid="session-score-row"]')  ||  [])];
  let scrapedScores = 0;
  for (const row of playRows) {
    const difficulty = row.querySelector('img.difficulty-bubble');
    if (! isPhoenix2Chart(difficulty))
      continue;

    if (addScore(
      text(row.querySelector('[data-testid="session-row-chart"]')),
      difficulty.getAttribute('alt')  ||  '',
      parsePlayScore(row),
    ))
      scrapedScores++;
  }

  return {
    playerId: pagePlayerId(),
    date,
    rows: [...rowsByChart.values()],
    scannedResults: playRows.length,
    scrapedScores,
  };
}


function sameSessionTime(cardTimestamp, summary) {
  const cardDate = cardTimestamp.match(/\b(\d{1,2})\s+([A-Za-z]{3})\s*·\s*(\d{1,2}:\d{2}\s*[AP]M)\b/i);
  // No trailing \b: imported sessions glue the next text right after AM/PM ("6:31 PMimported from ...").
  const summaryDate = summary.match(/\b(\d{1,2})\/(\d{1,2})\/\d{4}\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (! cardDate  ||  ! summaryDate)
    return false;

  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return Number(cardDate[1]) === Number(summaryDate[2])
    &&  months.indexOf(cardDate[2].toLowerCase()) + 1 === Number(summaryDate[1])
    &&  cardDate[3].replace(/\s+/g, '').toLowerCase() === summaryDate[3].replace(/\s+/g, '').toLowerCase();
}


// Lists why the opened session doesn't match the clicked card yet; empty once it does.
function openSessionMismatches(info) {
  const header = document.querySelector('[data-testid="session-hero"]');
  if (! header)
    return ['session header is missing'];

  const summary = text(header.querySelector('.sbd-hero-when'));
  const sessionTitle = text(header.querySelector('.sbd-hero-title'));
  const mix = summary.split('·')[0].trim();
  const cardTitle = info.title.split('·')[0].trim();
  const mismatches = [];
  if (mix !== 'Phoenix 2')
    mismatches.push(`mix: opened "${mix}", expected "Phoenix 2"`);

  if (sessionTitle !== cardTitle)
    mismatches.push(`title: opened "${sessionTitle}", card "${cardTitle}"`);

  if (! sameSessionTime(info.timestamp, summary)) {
    mismatches.push(`date: opened "${summary}", card "${info.timestamp}"`);
  }

  if (! document.querySelector('[data-testid="session-all-plays"]'))
    mismatches.push('all plays list is missing');

  return mismatches;
}


// Waits until the session of the clicked card (`info`) is open, then shows all of its plays.
export async function loadSessionContent(info) {
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
      if (! document.querySelector('[data-testid="session-show-all-plays"]'))
        return true;

      const tally = [...document.querySelectorAll('[data-testid="session-hero"] .sbd-tally > div')]
        .find((item) => text(item.querySelector('.sbd-tally-k')) === 'Plays');

      const total = parseInt(text(tally?.querySelector('.sbd-tally-v')).replace(/[^\d]/g, ''), 10);
      return Number.isFinite(total)
        &&  document.querySelectorAll('[data-testid="session-score-row"]').length >= total;
    },
      `all plays for "${info.title}" to load`);
  }
}
