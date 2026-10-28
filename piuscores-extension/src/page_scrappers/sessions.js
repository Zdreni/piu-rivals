import { isKnownPlayer } from '../storage.js';
import { logPumbility, savePlayerInfo, syncOwnPlayerId, TAG, waitForChange } from './common.js';
import { pagePlayerName, readOpenSessionPumbility, sessionPagePlayerId } from './sessions_content.js';
import { scrapeSession } from './session_scores.js';
import {
  clickPageButton, currentPhoenix2Sessions, findCurrentCard, findGrownSession, findPageButton, isNewestSessionOpen,
  sessionCardSignature, sessionCheckpointMatches,
} from './sessions_list.js';

let isScrapingSessions = false;


// The open session shows PUMBILITY as of that session, so it is only current
// when the newest session (first card on the first page) is the one showing.
async function saveNewestSessionPumbility(ownPlayerId) {
  const playerId = sessionPagePlayerId();
  if (! playerId)
    return;

  const pumbility = readOpenSessionPumbility();
  if (pumbility === null)
    return;

  if (! isNewestSessionOpen()) {
    logPumbility(`found ${pumbility} for ${pagePlayerName()  ||  playerId} (${playerId}) on Sessions page: `
      + 'not the newest session, ignoring');
    return;
  }

  await savePlayerInfo(playerId, pagePlayerName(), pumbility, ownPlayerId, 'Sessions page');
}


// A new player is added with their PUMBILITY before any session is opened, while the newest
// session still shows. The PUMBILITY may render after the cards, so it is awaited briefly;
// without it the player is still added and PUMBILITY is filled in after the scan.
async function addNewPlayer(playerId, report) {
  report('Adding player');
  if (isNewestSessionOpen()) {
    await waitForChange(()  =>  readOpenSessionPumbility() !== null, 'PUMBILITY', 3000)
      .catch((error)  =>  console.warn(TAG, error.message));
  }

  const pumbility = (isNewestSessionOpen()  ?  readOpenSessionPumbility()  :  null);
  await savePlayerInfo(playerId, pagePlayerName(), pumbility, await syncOwnPlayerId(), 'Sessions page', true);
}


export async function scrapePlayerSessions(report = ()  =>  {}) {
  const playerId = sessionPagePlayerId();
  if (! playerId)
    throw new Error('Grabbing scores is only available on a player Sessions page');

  if (isScrapingSessions)
    return;

  isScrapingSessions = true;

  try {
    const stored = await chrome.storage.local.get(['players', 'ownPlayerId']);
    if (! isKnownPlayer(stored.players, playerId, stored.ownPlayerId))
      await addNewPlayer(playerId, report);

    const checkpoint = stored.players?.[playerId]?.lastScrapedSession  ||  null;
    const pages = [];
    const seenPages = new Set();
    let checkpointFound = ! checkpoint;
    let reachedOlderMixBoundary = false;
    let grown = null;
    const countFound = ()  =>  pages.reduce((sum, page)  =>  sum + page.length, 0);
    const reportFound = ()  =>  report(`Searching sessions, ${countFound()} found...`);

    if (! checkpoint) {
      let signature = sessionCardSignature();
      while (! seenPages.has(signature)) {
        seenPages.add(signature);

        const page = currentPhoenix2Sessions();
        pages.push(page.sessions.map(({ info })  =>  info));
        reportFound();
        if (page.reachedOlderMix)
          break;

        const next = findPageButton('older');
        if (! next)
          break;

        await clickPageButton(next, 'older');
        signature = sessionCardSignature();
      }
    } else {
      grown = findGrownSession(checkpoint, currentPhoenix2Sessions().sessions);
      if (grown) {
        pages.push([grown]);
        checkpointFound = true;
        reportFound();
      }

      let signature = sessionCardSignature();
      while (! grown  &&  ! seenPages.has(signature)) {
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
        if (checkpointFound  ||  currentPage.reachedOlderMix) {
          reachedOlderMixBoundary = currentPage.reachedOlderMix;
          break;
        }

        const next = findPageButton('older');
        if (! next)
          break;

        await clickPageButton(next, 'older');
        signature = sessionCardSignature();
      }
    }

    if (checkpoint  &&  ! checkpointFound  &&  ! reachedOlderMixBoundary) {
      throw new Error('Saved session checkpoint was not found in the Sessions history');
    }

    const total = countFound();
    const playerName = pagePlayerName();
    let scrapedSessions = 0;
    let scrapedResults = 0;
    for (let pageIndex = pages.length - 1; pageIndex >= 0; pageIndex--) {
      for (const info of [...pages[pageIndex]].reverse()) {
        const card = findCurrentCard(info);
        if (! card)
          throw new Error(`Session "${info.title}" is no longer visible on its page`);

        report(`Scrapping session ${scrapedSessions + 1} of ${total}...`);
        scrapedResults += await scrapeSession(card, info, playerId, playerName, info !== grown);
        scrapedSessions++;
      }

      if (pageIndex > 0) {
        const newer = findPageButton('newer');
        if (! newer)
          throw new Error('Unable to return to newer Sessions pages');

        await clickPageButton(newer, 'newer');
      }
    }

    // Sessions are parsed oldest first, so the newest one is open now; this catches PUMBILITY
    // when it couldn't be read before scanning (e.g. an older session was open).
    if (scrapedSessions)
      await saveNewestSessionPumbility(await syncOwnPlayerId());

    const plural = (n, word)  =>  `${n} ${word}${(n === 1  ?  ''  :  's')}`;
    report(`Finished scrapping ${plural(scrapedSessions, 'session')} with ${plural(scrapedResults, 'result')}`);
    await recordSessionsVisit();
    return true;
  } finally {
    isScrapingSessions = false;
  }
}


// Counts the Phoenix 2 sessions on the current page newer than the last scraped one; `more` is
// set when all of them are new and older pages may hold further new sessions.
export function countNewSessions(checkpoint) {
  const { sessions, reachedOlderMix } = currentPhoenix2Sessions();
  const index = (checkpoint  ?  sessions.findIndex(({ info })  =>  sessionCheckpointMatches(checkpoint, info))  :  -1);
  if (index >= 0)
    return { count: index, more: false };

  if (findGrownSession(checkpoint, sessions))
    return { count: 1, more: false };

  return { count: sessions.length, more: ! reachedOlderMix  &&  !! findPageButton('older') };
}


// Stores when the open Sessions page was last seen with nothing left to grab, for known players only.
export async function recordSessionsVisit() {
  const playerId = sessionPagePlayerId();
  if (! playerId)
    return;

  const { players, ownPlayerId } = await chrome.storage.local.get(['players', 'ownPlayerId']);
  if (! isKnownPlayer(players, playerId, ownPlayerId))
    return;

  await chrome.storage.local.set({
    players: { ...players, [playerId]: { ...players[playerId], sessionsVisitedAt: Date.now() } },
  });
}


export async function runSessionsPage(ownPlayerId) {
  await saveNewestSessionPumbility(ownPlayerId);
}
