import { showPlayerAddedToast, showPumbilityToast } from '../ui/toasts.js';

export const TAG = '[piuscores]';

export const text = (el) => (el ? el.textContent.trim() : '');

export const parseNumber = (value) => {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
};


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


const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let knownOwnPlayerId = null;


// The account menu caption reads "<username> (<in-game name>)".
function accountUsername() {
  return text(document.querySelector('.shell-menu-caption')).match(/^(.+?)\s*\(/)?.[1] ?? null;
}


// Player pages can be addressed by GUID or by account username (e.g. /Player/Dino for your
// own profile). Only GUIDs are used as player IDs; your username maps to your own ID.
export function pagePlayerId() {
  const segment = location.pathname.match(/^\/Player\/([^/]+)(?:\/|$)/)?.[1];
  if (!segment) return null;
  const id = decodeURIComponent(segment);
  if (GUID_RE.test(id)) return id;
  const username = accountUsername();
  return username && id.toLowerCase() === username.toLowerCase() ? knownOwnPlayerId : null;
}


// Merges data saved under the username alias (by older versions) into the own GUID.
async function mergeOwnAlias(ownPlayerId) {
  const alias = accountUsername();
  if (!ownPlayerId || !alias) return;
  const { players, results, preferences } = await chrome.storage.local.get(['players', 'results', 'preferences']);
  const updates = {};
  if (players?.[alias]) {
    const { [alias]: aliasInfo, ...rest } = players;
    updates.players = { ...rest, [ownPlayerId]: { ...aliasInfo, ...rest[ownPlayerId] } };
  }
  let resultsChanged = false;
  const merged = { ...(results || {}) };
  for (const [key, scores] of Object.entries(merged)) {
    if (!scores || !(alias in scores)) continue;
    const { [alias]: aliasScore, ...rest } = scores;
    rest[ownPlayerId] = Math.max(aliasScore, rest[ownPlayerId] ?? -1);
    merged[key] = rest;
    resultsChanged = true;
  }
  if (resultsChanged) updates.results = merged;
  if (preferences?.hiddenRivals?.includes(alias)) {
    updates.preferences = { ...preferences, hiddenRivals: preferences.hiddenRivals.filter((id) => id !== alias) };
  }
  if (Object.keys(updates).length) {
    console.log(`${TAG} Merged data saved under "${alias}" into own player ID ${ownPlayerId}`);
    await chrome.storage.local.set(updates);
  }
}


export async function syncOwnPlayerId() {
  const scrapedId = findOwnPlayerId();
  const { ownPlayerId } = await chrome.storage.local.get('ownPlayerId');
  if (scrapedId && scrapedId !== ownPlayerId) {
    await chrome.storage.local.set({ ownPlayerId: scrapedId });
  }
  const id = scrapedId || (typeof ownPlayerId === 'string' ? ownPlayerId : null);
  if (id && id !== knownOwnPlayerId) {
    knownOwnPlayerId = id;
    await mergeOwnAlias(id);
  }
  return id;
}


// New players are only added by the scrap button on their Sessions page; automatic page scraping
// only updates yourself and players that are already stored.
export function isKnownPlayer(players, playerId, ownPlayerId) {
  return playerId === ownPlayerId || !!players?.[playerId];
}


export function saveHigherScore(scores, playerId, score) {
  if (!playerId || score === null || score <= (scores[playerId] ?? -1)) return null;
  const prevScore = scores[playerId] ?? null;
  scores[playerId] = score;
  return { prevScore, change: prevScore === null ? 'new' : 'upd' };
}


// The page check runs on every DOM mutation, so repeat decisions are logged only once.
let lastPumbilityLog = null;


export function logPumbility(message) {
  if (message === lastPumbilityLog) return;
  lastPumbilityLog = message;
  console.log(`${TAG} PUMBILITY ${message}`);
}


// PUMBILITY never decreases, so a lower value than the stored one must come from a history
// record (e.g. an old session) and is ignored. Only the scrap button (allowNewPlayer) may add
// a player that is not stored yet.
export async function savePlayerInfo(playerId, name, pumbility, ownPlayerId, source, allowNewPlayer = false) {
  if (!name && pumbility === null) return;

  const { players } = await chrome.storage.local.get('players');
  const isNew = !isKnownPlayer(players, playerId, ownPlayerId);
  if (!allowNewPlayer && isNew) {
    logPumbility(`found for ${name || playerId} (${playerId}) on ${source}: not a known player, skipping`);
    return;
  }
  const prev = players?.[playerId] || {};
  const player = { ...prev };
  if (name) player.name = name;

  const who = `${player.name || playerId} (${playerId}) on ${source}`;
  const prevPumbility = prev.pumbility ?? null;
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
  const raised = pumbility !== null && (prevPumbility === null || pumbility > prevPumbility);
  if (raised) player.pumbility = pumbility;

  if (player.name === prev.name && player.pumbility === prev.pumbility) return;
  await chrome.storage.local.set({ players: { ...(players || {}), [playerId]: player } });
  if (isNew) {
    showPlayerAddedToast(player.name || playerId, playerId, player.pumbility ?? null);
  } else if (raised) {
    const label = playerId === ownPlayerId ? 'You' : player.name || playerId;
    showPumbilityToast(label, pumbility, prevPumbility);
  }
}


export function waitForChange(predicate, description, timeoutMs = 10000) {
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
