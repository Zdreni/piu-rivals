import { isKnownPlayer } from '../storage.js';
import { showOwnPlayerToast, showPlayerAddedToast, showPumbilityToast } from '../ui/toasts.js';

export const TAG = '[piuscores]';

export const text = (el)  =>  (el  ?  el.textContent.trim()  :  '');


export const parseNumber = (value)  => {
  const digits = value.replace(/[^\d]/g, '');
  return (digits  ?  Number(digits)  :  null);
};


function findOwnPlayerId() {
  for (const link of document.querySelectorAll('a[href]')) {
    if (text(link).replace(/\s+/g, ' ') !== 'My Sessions')
      continue;

    const url = new URL(link.href, location.href);
    if (url.hostname !== location.hostname)
      continue;

    const match = url.pathname.match(/^\/Player\/([^/]+)\/Sessions\/?$/);
    if (match)
      return match[1];
  }

  return null;
}


const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let knownOwnPlayerId = null;


// The account menu caption reads "<username> (<in-game name>)", e.g. "Dino (DINO #3869)".
function accountUsername() {
  return text(document.querySelector('.shell-menu-caption')).match(/^(.+?)\s*\(/)?.[1]  ??  null;
}


// Player pages can be addressed by GUID or by account username (e.g. /Player/Dino for your
// own profile). Only GUIDs are used as player IDs; your username maps to your own ID.
export function pagePlayerId() {
  const segment = location.pathname.match(/^\/Player\/([^/]+)(?:\/|$)/)?.[1];
  if (! segment)
    return null;

  const id = decodeURIComponent(segment);
  if (GUID_RE.test(id))
    return id;

  const username = accountUsername();
  return ((username  &&  id.toLowerCase() === username.toLowerCase())  ?  knownOwnPlayerId  :  null);
}


// Your name always comes from the account menu (the username), not from your own pages, which
// show the in-game name.
export const playerNameFor = (playerId, ownPlayerId, pageName)  =>
  (playerId === ownPlayerId  ?  accountUsername()  :  null)  ||  pageName;


// Saves your username from the account menu, so it is known before any of your pages are visited.
// The first save creates your player record and shows a toast.
async function saveOwnName(ownPlayerId) {
  const name = accountUsername();
  if (! ownPlayerId  ||  ! name)
    return;

  const { players } = await chrome.storage.local.get('players');
  if (players?.[ownPlayerId]?.name === name)
    return;

  await chrome.storage.local.set({ players: { ...(players  ||  {}), [ownPlayerId]: { ...players?.[ownPlayerId], name } } });
  console.log(`${TAG} Saved own name "${name}" for player ID ${ownPlayerId}`);
  if (! players?.[ownPlayerId])
    showOwnPlayerToast(name, ownPlayerId);
}


// Merges data saved under the username alias (by older versions) into the own GUID.
async function mergeOwnAlias(ownPlayerId) {
  const alias = accountUsername();
  if (! ownPlayerId  ||  ! alias)
    return;

  const { players, results, preferences } = await chrome.storage.local.get(['players', 'results', 'preferences']);
  const updates = {};
  if (players?.[alias]) {
    const { [alias]: aliasInfo, ...rest } = players;
    updates.players = { ...rest, [ownPlayerId]: { ...aliasInfo, ...rest[ownPlayerId] } };
  }

  let resultsChanged = false;
  const merged = { ...(results  ||  {}) };
  for (const [key, scores] of Object.entries(merged)) {
    if (! scores  ||  ! (alias in scores))
      continue;

    const { [alias]: aliasScore, ...rest } = scores;
    rest[ownPlayerId] = mergeScoreRecords(aliasScore, rest[ownPlayerId]);
    merged[key] = rest;
    resultsChanged = true;
  }

  if (resultsChanged)
    updates.results = merged;

  if (preferences?.hiddenRivals?.includes(alias)) {
    updates.preferences = { ...preferences, hiddenRivals: preferences.hiddenRivals.filter((id)  =>  id !== alias) };
  }

  if (Object.keys(updates).length) {
    console.log(`${TAG} Merged data saved under "${alias}" into own player ID ${ownPlayerId}`);
    await chrome.storage.local.set(updates);
  }
}


export async function syncOwnPlayerId() {
  const scrapedId = findOwnPlayerId();
  const { ownPlayerId } = await chrome.storage.local.get('ownPlayerId');
  if (scrapedId  &&  scrapedId !== ownPlayerId) {
    await chrome.storage.local.set({ ownPlayerId: scrapedId });
  }

  const id = scrapedId  ||  (typeof ownPlayerId === 'string'  ?  ownPlayerId  :  null);
  if (id  &&  id !== knownOwnPlayerId) {
    knownOwnPlayerId = id;
    await mergeOwnAlias(id);
  }

  await saveOwnName(id);

  return id;
}


// Dates are "YYYY-MM-DD" strings, so the later one also compares greater; null is unknown.
const laterDate = (a, b)  =>  ((! a  ||  (b  &&  b > a))  ?  b  :  a)  ??  null;


// Records a try of `score` on `date` (null when unknown). lastTryDate moves to every newer try,
// while bestScore and bestScoreDate change only when the score is higher. Returns the best-score
// change, or null when the best score stays.
export function saveScoreTry(scores, playerId, score, date) {
  if (! playerId  ||  score === null)
    return null;

  const prev = scores[playerId]  ||  null;
  const record = { ...prev };
  const lastTryDate = laterDate(prev?.lastTryDate, date);
  if (lastTryDate)
    record.lastTryDate = lastTryDate;

  const improved = score > (prev?.bestScore  ??  -1);
  if (improved) {
    record.bestScore = score;
    if (date)
      record.bestScoreDate = date;
    else
      delete record.bestScoreDate;
  }

  if (improved  ||  record.lastTryDate !== prev?.lastTryDate)
    scores[playerId] = record;

  if (! improved)
    return null;

  const prevScore = prev?.bestScore  ??  null;
  return { prevScore, change: (prevScore === null  ?  'new'  :  'upd') };
}


// Combines two score records of the same player and chart.
function mergeScoreRecords(a, b) {
  if (! a  ||  ! b)
    return a  ||  b;

  const best = (b.bestScore > a.bestScore  ?  b  :  a);
  const record = { bestScore: best.bestScore };
  if (best.bestScoreDate)
    record.bestScoreDate = best.bestScoreDate;

  const lastTryDate = laterDate(a.lastTryDate, b.lastTryDate);
  if (lastTryDate)
    record.lastTryDate = lastTryDate;

  return record;
}


// The page check runs on every DOM mutation, so repeat decisions are logged only once.
let lastPumbilityLog = null;


export function logPumbility(message) {
  if (message === lastPumbilityLog)
    return;

  lastPumbilityLog = message;
  console.log(`${TAG} PUMBILITY ${message}`);
}


// PUMBILITY never decreases, so a lower value than the stored one must come from a history
// record (e.g. an old session) and is ignored. Only the scrap button (allowNewPlayer) may add
// a player that is not stored yet.
export async function savePlayerInfo(playerId, pageName, pumbility, ownPlayerId, source, allowNewPlayer = false) {
  if (! pageName  &&  pumbility === null)
    return;

  const { players } = await chrome.storage.local.get('players');
  const isNew = ! isKnownPlayer(players, playerId, ownPlayerId);
  if (! allowNewPlayer  &&  isNew) {
    logPumbility(`found for ${pageName  ||  playerId} (${playerId}) on ${source}: not a known player, skipping`);
    return;
  }

  const prev = players?.[playerId]  ||  {};
  const player = { ...prev };
  const name = playerNameFor(playerId, ownPlayerId, pageName);
  if (name)
    player.name = name;

  const who = `${player.name  ||  playerId} (${playerId}) on ${source}`;
  const prevPumbility = prev.pumbility  ??  null;
  if (pumbility === null) {
    logPumbility(`not found for ${who}`);
  } else if (prevPumbility === null) {
    logPumbility(`found ${pumbility} for ${who}: new, saving`);
  } else if (pumbility > prevPumbility) {
    logPumbility(`found ${pumbility} for ${who}: raised from ${prevPumbility}, saving`);
  } else if (pumbility < prevPumbility) {
    logPumbility(`found ${pumbility} for ${who}: lower than ${prevPumbility}, skipping`);
  } else {
    logPumbility(`found ${pumbility} for ${who}: unchanged, skipping`);
  }

  const raised = pumbility !== null  &&  (prevPumbility === null  ||  pumbility > prevPumbility);
  if (raised)
    player.pumbility = pumbility;

  if (player.name === prev.name  &&  player.pumbility === prev.pumbility)
    return;

  await chrome.storage.local.set({ players: { ...(players  ||  {}), [playerId]: player } });
  if (isNew) {
    showPlayerAddedToast(player.name  ||  playerId, playerId, player.pumbility  ??  null);
  } else if (raised) {
    const label = (playerId === ownPlayerId  ?  'You'  :  player.name  ||  playerId);
    showPumbilityToast(label, pumbility, prevPumbility);
  }
}


export function waitForChange(predicate, description, timeoutMs = 10000) {
  return new Promise((resolve, reject)  => {
    const startedAt = Date.now();

    const observer = new MutationObserver(()  => {
      if (predicate()) {
        observer.disconnect();
        clearInterval(timerId);
        resolve();
      }
    });

    const timerId = setInterval(()  => {
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
