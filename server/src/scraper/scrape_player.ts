import type { SessionsBrowser } from './browser.ts';
import { type CardStep, cardDates, type Checkpoint, planScan, stepCard } from './scan_plan.ts';
import { parseOpenSession, parseSessionPlays, type ParsedPlay, type SessionCard } from './session_page.ts';
import type { StoredSessionResult } from './store.ts';

// Where scraped data goes: the database, or the console for a dry run.
export interface ScrapeSink {
  checkpoint(): Promise<Checkpoint>;
  savePlayerInfo(name: string | null, pumbility: number | null): Promise<void>;
  storeSession(session: { card: SessionCard; date: string | null; plays: ParsedPlay[]; grown: boolean }):
    Promise<StoredSessionResult>;
  // A session of another mix: only the checkpoint moves.
  skipSession(session: { card: SessionCard; grown: boolean }): Promise<void>;
}

export interface SessionProgress extends StoredSessionResult {
  card: SessionCard;
  grown: boolean;
  index: number;
  total: number;
}

export interface PlayerScrapeResult {
  name: string | null;
  sessions: number;
  playsAdded: number;
  bestsImproved: number;
}

// A guard against paging forever if the pagination misbehaves.
const MAX_PAGES = 500;


// Scrapes a player's sessions newer than their checkpoint, oldest first, storing each session as
// soon as it's read, so an interrupted scrape keeps everything up to that point. Sessions of other
// mixes than Phoenix 2 aren't opened: they only move the checkpoint.
export async function scrapePlayer(
  browser: SessionsBrowser,
  playerId: string,
  sink: ScrapeSink,
  onSession: (progress: SessionProgress) => Promise<void> | void = ()  =>  {},
): Promise<PlayerScrapeResult> {
  const checkpoint = await sink.checkpoint();
  const hasSessions = await browser.openPlayer(playerId);
  let page = await browser.readPage();

  // The open session shows PUMBILITY as of that session, so it is current only for the newest one,
  // which is open when the page loads. A Phoenix session shows Phoenix's PUMBILITY, so it's read
  // only when the newest session is Phoenix 2.
  const newestCard = (page.hasNewerPage  ?  undefined  :  page.cards[0]);
  const newestOpen = !! newestCard?.isOpen  &&  newestCard.mix === 'Phoenix 2';
  const pumbility = (newestOpen  ?  await browser.readOpenPumbility()  :  null);
  await sink.savePlayerInfo(page.playerName, pumbility);

  const result: PlayerScrapeResult = { name: page.playerName, sessions: 0, playsAdded: 0, bestsImproved: 0 };
  if (! hasSessions)
    return result;

  // Page back through the history until a stored session or the end of Phoenix 2 history is reached.
  const collectedCards: SessionCard[] = [];
  const pageOf = new Map<SessionCard, number>();
  let pageIndex = 0;
  let stop: CardStep | null = null;
  const dateOf = cardDates();
  while (true) {
    for (const card of page.cards) {
      const step = stepCard(checkpoint, card, dateOf(card.timestamp));
      if (step.kind !== 'continue') {
        stop = step;
        break;
      }

      collectedCards.push(card);
      pageOf.set(card, pageIndex);
    }

    if (stop  ||  ! page.hasOlderPage)
      break;

    if (pageIndex + 1 >= MAX_PAGES)
      throw new Error(`Stopped after ${MAX_PAGES} Sessions pages`);

    await browser.goToPage('older');
    page = await browser.readPage();
    pageIndex++;
  }

  const plan = planScan(checkpoint, collectedCards, stop);
  const queue = [
    ...(plan.grown  ?  [{ card: plan.grown, grown: true }]  :  []),
    ...plan.fresh.map((card)  =>  ({ card, grown: false })),
  ];

  const sessionsTotal = queue.filter(({ card })  =>  card.mix === 'Phoenix 2').length;
  for (const { card: queuedCard, grown } of queue) {
    if (queuedCard.mix !== 'Phoenix 2') {
      await sink.skipSession({ card: queuedCard, grown });
      continue;
    }

    while (pageIndex > pageOf.get(queuedCard)!) {
      await browser.goToPage('newer');
      pageIndex--;
    }

    // The checkpoint keeps the card as it reads when opened, so it has the session's current length.
    const { html, card } = await browser.openSession(queuedCard);
    const openSession = parseOpenSession(html);
    const { plays } = parseSessionPlays(html);
    const sessionResult = await sink.storeSession({ card, date: openSession?.date  ??  null, plays, grown });
    result.sessions++;
    result.playsAdded += sessionResult.playsAdded;
    result.bestsImproved += sessionResult.bestsImproved;
    await onSession({ ...sessionResult, card, grown, index: result.sessions - 1, total: sessionsTotal });
  }

  return result;
}
