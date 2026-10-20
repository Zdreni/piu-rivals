import type { SessionCard } from './session_page.ts';

// Decides which sessions of a player to scan, from the stored checkpoint and the session cards
// read so far (newest first, across pages). Only the newest session can gain plays: when more
// scores are imported, they land in it and its timestamp moves later. So the latest stored
// session may be gone from the page, while the anchor (the one before it) never changes.

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
  // The first older-mix session: Phoenix 2 history ends here.
  | { kind: 'history-end' };

export interface ScanPlan {
  // The previous latest session after it grew, or null.
  grown: SessionCard | null;
  // New sessions, oldest first.
  fresh: SessionCard[];
}

export const sameSession = (stored: StoredSession | null, card: SessionCard) =>
  !! stored  &&  stored.title === card.title  &&  stored.timestamp === card.timestamp;


// Classifies one card while paging back through the history.
export function stepCard(checkpoint: Checkpoint, card: SessionCard): CardStep {
  if (card.mix !== 'Phoenix 2')
    return card.mix === 'Phoenix' ? { kind: 'history-end' } : { kind: 'continue' };

  if (sameSession(checkpoint.latest, card))
    return { kind: 'latest-found' };

  if (sameSession(checkpoint.anchor, card))
    return { kind: 'anchor-found' };

  return { kind: 'continue' };
}


// `collected` are the Phoenix 2 cards above the stop point, newest first. `stop` is the step that
// ended the paging, or null when the history ran out of pages.
export function planScan(checkpoint: Checkpoint, collected: SessionCard[], stop: CardStep | null): ScanPlan {
  const oldestFirst = [...collected].reverse();
  if (stop?.kind === 'latest-found'  ||  ! checkpoint.latest)
    return { grown: null, fresh: oldestFirst };

  // The latest stored session isn't on the page as stored, so it has grown. It's the oldest card
  // above the anchor, or the oldest Phoenix 2 session when it was the player's only one.
  const reachedHistoryStart = stop?.kind !== 'anchor-found';
  if (reachedHistoryStart  &&  checkpoint.anchor)
    throw new Error(`Neither the latest scanned session ("${describe(checkpoint.latest)}") nor the one `
      + `before it ("${describe(checkpoint.anchor)}") is in the Sessions history; the player needs a rescan`);

  const [grown, ...fresh] = oldestFirst;
  if (! grown)
    throw new Error(`The latest scanned session ("${describe(checkpoint.latest)}") is missing from the `
      + 'Sessions history; the player needs a rescan');

  return { grown, fresh };
}


const describe = (session: StoredSession) => `${session.title}, ${session.timestamp}`;
