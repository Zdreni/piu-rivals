import { showPumbilityToast } from '../ui/toasts.js';

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

export async function syncOwnPlayerId() {
  const scrapedId = findOwnPlayerId();
  const { ownPlayerId } = await chrome.storage.local.get('ownPlayerId');
  if (scrapedId && scrapedId !== ownPlayerId) {
    await chrome.storage.local.set({ ownPlayerId: scrapedId });
    return scrapedId;
  }
  return typeof ownPlayerId === 'string' ? ownPlayerId : null;
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

export async function savePlayerInfo(ui, playerId, name, pumbility, ownPlayerId, source) {
  if (!name && pumbility === null) return;

  const { players } = await chrome.storage.local.get('players');
  const prev = players?.[playerId] || {};
  const player = { ...prev };
  if (name) player.name = name;
  if (pumbility !== null) player.pumbility = pumbility;

  const who = `${player.name || playerId} (${playerId}) on ${source}`;
  const prevPumbility = prev.pumbility ?? null;
  if (pumbility === null) {
    logPumbility(`not found for ${who}`);
  } else if (prevPumbility === null) {
    logPumbility(`found ${pumbility} for ${who}: new, saving`);
  } else if (pumbility !== prevPumbility) {
    logPumbility(`found ${pumbility} for ${who}: changed from ${prevPumbility}, saving`);
  } else {
    logPumbility(`found ${pumbility} for ${who}: unchanged, skipping`);
  }

  if (player.name === prev.name && player.pumbility === prev.pumbility) return;
  await chrome.storage.local.set({ players: { ...(players || {}), [playerId]: player } });
  if (pumbility !== null && pumbility !== prevPumbility) {
    const label = playerId === ownPlayerId ? 'You' : player.name || playerId;
    showPumbilityToast(ui.ensure(), label, pumbility, prevPumbility);
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
