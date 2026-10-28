import type { SessionCard } from './session_page.ts';

// Decides which sessions of a player to scan, from the stored checkpoint and the session cards
// read so far (newest first, across pages). Only the newest session can gain plays: when more
// scores are imported, they land in it and its timestamp moves later. So the latest stored
// session may be gone from the page, while the anchor (the one before it) never changes.
// Sessions of every mix count the same here, as a player can play Phoenix again after Phoenix 2;
// only Phoenix 2 ones have their plays read. Paging stops at the first session from before
// Phoenix 2 came out.

export interface StoredSession {
  title: string;
  timestamp: string;
}

export interface Checkpoint {
  latest: StoredSession | null;
  anchor: StoredSession | null;
}

export type CardStep =
  // Keep reading cards (and older pages).
  | { kind: 'continue' }
  // The latest stored session is on the page unchanged: the cards before it are all new.
  | { kind: 'latest-found' }
  // The anchor is on the page, but not the latest stored session: it has grown.
  | { kind: 'anchor-found' }
  // A session from before Phoenix 2 came out: no older one can be Phoenix 2.
  | { kind: 'history-end' };

export interface ScanPlan {
  // The previous latest session after it grew, or null.
  grown: SessionCard | null;
  // New sessions, oldest first.
  fresh: SessionCard[];
}

export const sameSession = (stored: StoredSession | null, card: SessionCard)  =>
  !! stored  &&  stored.title === card.title  &&  stored.timestamp === card.timestamp;


// Phoenix 2 came out on 9 July 2026.
const PHOENIX2_RELEASE = Date.UTC(2026, 6, 9);
const DAY_MS = 24 * 60 * 60_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];


// Dates the cards of a history, read newest first. Card times have no year ("Sun 11 Oct · 7:43 PM"),
// so each card gets the latest year, no later than the card before it, in which its day falls on
// its weekday. Returns the card's day as a UTC timestamp, or null when the format is different.
export function cardDates(now = Date.now()) {
  // A day of slack for piuscores' time zone.
  let notAfter = now + DAY_MS;
  return (timestamp: string): number | null  => {
    const match = timestamp.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+([A-Za-z]{3})\b/);
    const weekday = WEEKDAYS.indexOf(match?.[1]  ??  '');
    const month = MONTHS.indexOf(match?.[3]  ??  '');
    if (weekday < 0  ||  month < 0)
      return null;

    const day = Number(match![2]);
    const lastYear = new Date(notAfter).getUTCFullYear();
    for (let year = lastYear; year > lastYear - 30; year--) {
      const date = new Date(Date.UTC(year, month, day));
      if (date.getTime() <= notAfter  &&  date.getUTCDate() === day  &&  date.getUTCDay() === weekday) {
        notAfter = date.getTime();
        return notAfter;
      }
    }

    return null;
  };
}


// Classifies one card while paging back through the history; `date` is its day from cardDates.
export function stepCard(checkpoint: Checkpoint, card: SessionCard, date: number | null): CardStep {
  if (date !== null  &&  date < PHOENIX2_RELEASE)
    return { kind: 'history-end' };

  if (sameSession(checkpoint.latest, card))
    return { kind: 'latest-found' };

  if (sameSession(checkpoint.anchor, card))
    return { kind: 'anchor-found' };

  return { kind: 'continue' };
}


// `collected` are the cards above the stop point, newest first. `stop` is the step that ended the
// paging, or null when the history ran out of pages.
export function planScan(checkpoint: Checkpoint, collectedCards: SessionCard[], stop: CardStep | null): ScanPlan {
  const oldestFirst = [...collectedCards].reverse();
  if (stop?.kind === 'latest-found'  ||  ! checkpoint.latest)
    return { grown: null, fresh: oldestFirst };

  // The latest stored session isn't on the page as stored, so it has grown. It's taken to be the
  // oldest Phoenix 2 card above the anchor, or in the history when it was the player's only one;
  // cards of other mixes below that one need nothing stored. This also covers checkpoints stored
  // before sessions of other mixes were tracked, which can have Phoenix sessions between the anchor
  // and the latest one. When the latest one was a Phoenix session, a newer Phoenix 2 session is
  // taken as grown: its plays get the previous Phoenix 2 session's number, which only matters for
  // telling re-imported tries apart. With no Phoenix 2 card, the oldest card is the grown one.
  const latestSession = checkpoint.latest;
  const reachedHistoryStart = stop?.kind !== 'anchor-found';
  if (reachedHistoryStart  &&  checkpoint.anchor)
    throw new Error(`Neither the latest scanned session ("${describe(latestSession)}") nor the one `
      + `before it ("${describe(checkpoint.anchor)}") is in the Sessions history; the player needs a rescan`);

  const index = Math.max(0, oldestFirst.findIndex((c)  =>  c.mix === 'Phoenix 2'));
  if (! oldestFirst.length)
    throw new Error(`The latest scanned session ("${describe(latestSession)}") is missing from the `
      + 'Sessions history; the player needs a rescan');

  return { grown: oldestFirst[index]!, fresh: oldestFirst.slice(index + 1) };
}


const describe = (session: StoredSession)  =>  `${session.title}, ${session.timestamp}`;
