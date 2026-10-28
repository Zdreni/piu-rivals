import { text, waitForChange } from './common.js';


export const isNewestSessionOpen = ()  =>
  !! document.querySelector('[data-testid="session-card"]')?.classList.contains('sbd-card-now')
  &&  ! findPageButton('newer');


export function getSessionCards() {
  return [...document.querySelectorAll('[data-testid="session-card"]')];
}


function getSessionCardMix(card) {
  const meta = text(card.querySelector('.sbd-card-meta')).replace(/\s+/g, ' ');
  if (/^Phoenix 2(?:\s|$)/i.test(meta))
    return 'Phoenix 2';

  if (/^Phoenix(?:\s|$)/i.test(meta))
    return 'Phoenix';

  return null;
}


function getPhoenix2CardInfoOrNull(card) {
  if (getSessionCardMix(card) !== 'Phoenix 2')
    return null;

  const meta = text(card.querySelector('.sbd-card-meta')).replace(/\s+/g, ' ');

  const title = meta.replace(/^Phoenix 2\s*(?:·|-)?\s*/i, '').trim();
  const timestamp = text(card.querySelector('.sbd-card-when')).replace(/\s+/g, ' ');
  if (! title  ||  ! timestamp)
    return null;

  return { title, timestamp };
}


export function currentPhoenix2Sessions() {
  const sessions = [];
  for (const card of getSessionCards()) {
    const mix = getSessionCardMix(card);
    if (mix === 'Phoenix')
      return { sessions, reachedOlderMix: true };

    if (mix !== 'Phoenix 2')
      continue;

    const info = getPhoenix2CardInfoOrNull(card);
    if (info)
      sessions.push({ card, info });
  }

  return { sessions, reachedOlderMix: false };
}


export function sessionCardSignature() {
  return JSON.stringify(getSessionCards().map((card)  =>  getPhoenix2CardInfoOrNull(card)  ||  text(card)));
}


export function sessionCheckpointMatches(checkpoint, info) {
  return checkpoint?.title === info.title  &&  checkpoint?.timestamp === info.timestamp;
}


// Card timestamps look like "Mon 12 Oct · 6:55 PM"; returns null when the format is different.
function parseCardTimestamp(timestamp) {
  const match = timestamp.match(/\b(\d{1,2})\s+([A-Za-z]{3})\s*·\s*(\d{1,2}):(\d{2})\s*([AP])M\b/i);
  if (! match)
    return null;

  const [, day, month, hours, minutes, half] = match;
  return {
    date: `${Number(day)} ${month.toLowerCase()}`,
    minutes: (Number(hours) % 12 + (half.toUpperCase() === 'P'  ?  12  :  0)) * 60 + Number(minutes),
  };
}


// A session that is still active grows when more plays are imported, and its card timestamp
// moves to the latest play, so the stored checkpoint no longer matches exactly. Only the newest
// session can grow, so it is the first card on the first page: same title, same day, later time,
// while the exact checkpoint card is not on the page (otherwise the first card is a new session).
export function findGrownSession(checkpoint, sessions) {
  const first = sessions[0]?.info;
  if (! checkpoint  ||  ! first  ||  findPageButton('newer'))
    return null;

  if (sessions.some(({ info })  =>  sessionCheckpointMatches(checkpoint, info)))
    return null;

  const was = parseCardTimestamp(checkpoint.timestamp);
  const now = parseCardTimestamp(first.timestamp);
  return ((first.title === checkpoint.title  &&  was  &&  now  &&  was.date === now.date  &&  now.minutes > was.minutes)
    ?  first
    :  null);
}


export function findPageButton(direction) {
  const main = document.querySelector('main')  ||  document;
  const controls = [...main.querySelectorAll(
    '.mud-pagination button, [aria-label*="page" i] button, button[aria-label*="page" i]',
  )];

  const candidates = (controls.length
    ?  controls
    :  [...main.querySelectorAll('button, a[role="button"]')]);

  const label = (button)  =>  [
    button.getAttribute('aria-label'),
    button.getAttribute('title'),
    text(button),
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();

  const patterns = {
    older: /\bolder\b|\bnext page\b|^next$/,
    newer: /\bnewer\b|\bprevious page\b|^previous$/,
  };

  return candidates.find((button)  => {
    const value = label(button);
    return patterns[direction].test(value)
      &&  ! button.disabled
      &&  button.getAttribute('aria-disabled') !== 'true';
  })  ||  null;
}


export async function clickPageButton(button, direction) {
  if (! button)
    return false;

  const before = sessionCardSignature();
  button.click();
  await waitForChange(()  =>  sessionCardSignature() !== before, `${direction} Sessions page`);
  return true;
}


export function findCurrentCard(info) {
  return currentPhoenix2Sessions().sessions.find((item)  =>
    sessionCheckpointMatches(info, item.info))?.card  ||  null;
}
