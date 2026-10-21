import { TAG, TOKEN_KEY } from './config.js';
import { createBadge } from './ui/badge.js';

// Runs on piuscores: on a player's profile or Sessions page, shows whether the player is in
// piu-rivals and offers to add and scrape one that isn't. Shows nothing unless you're signed in
// to piu-rivals as an admin.
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_POLL_MS = 3000;
const ACTIVE_STATUSES = ['queued', 'running'];

const text = (el) => (el ? el.textContent.trim() : '');


function ownPlayerId() {
  for (const link of document.querySelectorAll('a[href]')) {
    if (text(link).replace(/\s+/g, ' ') !== 'My Sessions')
      continue;

    const match = new URL(link.href, location.href).pathname.match(/^\/Player\/([^/]+)\/Sessions\/?$/);
    if (match  &&  GUID_RE.test(match[1]))
      return match[1].toLowerCase();
  }

  return null;
}


// The account menu caption reads "<username> (<in-game name>)", e.g. "Dino (DINO #3869)".
const accountUsername = () => text(document.querySelector('.shell-menu-caption')).match(/^(.+?)\s*\(/)?.[1]  ??  null;


// Profile (/Player/<id>) and Sessions (/Player/<id>/Sessions) pages. Your own pages can also be
// addressed by your username, e.g. /Player/Dino.
function pagePlayerId() {
  const segment = location.pathname.match(/^\/Player\/([^/]+)(?:\/Sessions)?\/?$/)?.[1];
  if (! segment)
    return null;

  const id = decodeURIComponent(segment);
  if (GUID_RE.test(id))
    return id.toLowerCase();

  const username = accountUsername();
  return username  &&  id.toLowerCase() === username.toLowerCase() ? ownPlayerId() : null;
}


const pagePlayerName = () => text(document.querySelector('main h5')).replace(/\s+[—–-]\s+Sessions$/i, '').trim();


// After the extension is reloaded, this page's script can no longer reach it.
async function send(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return { state: 'error', message: error.message };
  }
}


const badge = createBadge({ onRegister: register });

let shownPlayerId = null;
let status = null;
let finishedRun = null;
let pollTimer = null;


function render() {
  if (status.state === 'signed-out'  ||  status.state === 'not-admin') {
    badge.hide();
    return;
  }

  badge.show({ ...status, finishedRun, name: pagePlayerName() });
}


async function refresh() {
  const playerId = shownPlayerId;
  const next = await send({ type: 'status', playerId });
  if (playerId !== shownPlayerId)
    return;

  status = next;
  render();
  if (status.run)
    watchRun(status.run.id);
}


function watchRun(runId) {
  const playerId = shownPlayerId;
  clearTimeout(pollTimer);

  pollTimer = setTimeout(async () => {
    const result = await send({ type: 'run', runId });
    if (playerId !== shownPlayerId)
      return;

    if (result.state === 'error'  ||  result.state === 'signed-out') {
      status = result;
      render();
      return;
    }

    if (ACTIVE_STATUSES.includes(result.run.status)) {
      status = { ...status, run: result.run };
      render();
      watchRun(runId);
      return;
    }

    finishedRun = result.run;
    await refresh();
  }, RUN_POLL_MS);
}


async function register() {
  const playerId = shownPlayerId;
  const result = await send({ type: 'register', playerId });
  if (playerId !== shownPlayerId)
    return;

  if (result.run) {
    finishedRun = null;
    status = { ...status, run: result.run };
    watchRun(result.run.id);
  } else {
    status = result;
  }

  render();
}


function showPage() {
  const playerId = pagePlayerId();
  if (playerId === shownPlayerId) {
    if (playerId  &&  status)
      badge.attach();

    return;
  }

  shownPlayerId = playerId;
  status = null;
  finishedRun = null;
  clearTimeout(pollTimer);
  if (! playerId) {
    badge.hide();
    return;
  }

  // Not shown as "checking" yet: for non-admins nothing should appear at all.
  refresh().catch((error) => console.error(TAG, error));
}


// piuscores navigates without reloading the page, so its changes are watched.
let timer = null;


new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(showPage, 300);
}).observe(document.body, { childList: true, subtree: true });


// Signing in or out on the piu-rivals site, or coming back to this tab, checks again.
const recheck = () => {
  if (shownPlayerId  &&  ! status?.run)
    refresh().catch((error) => console.error(TAG, error));
};


chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local'  &&  changes[TOKEN_KEY])
    recheck();
});


document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible')
    recheck();
});


showPage();
