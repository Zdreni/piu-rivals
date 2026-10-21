import { TAG, TOKEN_KEY } from './config.js';
import { createPlayerLinks } from './player_links.js';
import { createBadge } from './ui/badge.js';

// Runs on piuscores: on a player's profile or Sessions page, shows whether the player is in
// piu-rivals and offers to add and scrape one that isn't, and on every page marks the links to
// players by whether they're in piu-rivals, with a button to add and scrape the ones who aren't. Shows nothing unless you're signed in to piu-rivals
// as an admin.
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_POLL_MS = 3000;
const LINKS_POLL_MS = 10_000;
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


// The player of a profile (/Player/<id>) or Sessions (/Player/<id>/Sessions) path. Your own pages
// can also be addressed by your username, e.g. /Player/Dino.
function playerIdOf(pathname) {
  const segment = pathname.match(/^\/Player\/([^/]+)(?:\/Sessions)?\/?$/)?.[1];
  if (! segment)
    return null;

  const id = decodeURIComponent(segment);
  if (GUID_RE.test(id))
    return id.toLowerCase();

  const username = accountUsername();
  return username  &&  id.toLowerCase() === username.toLowerCase() ? ownPlayerId() : null;
}


const pagePlayerId = () => playerIdOf(location.pathname);


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
// The run that last scraped the player, once the player is finished in it: { run, runPlayer }.
let finished = null;
let pollTimer = null;


function render() {
  if (status.state === 'signed-out'  ||  status.state === 'not-admin') {
    badge.hide();
    return;
  }

  badge.show({ ...status, finished, name: pagePlayerName() });
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


// A player added from a link's button who is shown here gets the status box updated too.
async function scrapeFromLink(playerId) {
  const result = await send({ type: 'register', playerId });
  if (playerId === shownPlayerId  &&  ! status?.run)
    refresh().catch((error) => console.error(TAG, error));

  return result;
}


const playerLinks = createPlayerLinks({ playerIdOf, onScrape: scrapeFromLink });

// Answers can come back out of order; only the latest request's is used.
let marksRequest = 0;
let marksTimer = null;


// While a player requested from a link isn't in piu-rivals yet, the marks are checked again now and
// then, so the link turns green once the player is scraped.
async function markLinks() {
  const request = ++marksRequest;
  clearTimeout(marksTimer);
  const result = await send({ type: 'players' });
  if (request !== marksRequest)
    return;

  // Marks already shown stay when the server can't be asked.
  if (result.state !== 'error')
    playerLinks.mark(result.ids ? new Set(result.ids) : null);

  if (playerLinks.waiting())
    marksTimer = setTimeout(markLinksLogged, LINKS_POLL_MS);
}


const markLinksLogged = () => markLinks().catch((error) => console.error(TAG, error));


function watchRun(runId) {
  const playerId = shownPlayerId;
  clearTimeout(pollTimer);

  pollTimer = setTimeout(async () => {
    const result = await send({ type: 'run', runId, playerId });
    if (playerId !== shownPlayerId)
      return;

    if (result.state === 'error'  ||  result.state === 'signed-out') {
      status = result;
      render();
      return;
    }

    // A run can go on with other players after this one is finished.
    const { run, runPlayer } = result;
    if (runPlayer ? ['waiting', 'running'].includes(runPlayer.state) : ACTIVE_STATUSES.includes(run.status)) {
      status = { ...status, run, runPlayer };
      render();
      watchRun(runId);
      return;
    }

    finished = { run, runPlayer };
    markLinksLogged();
    await refresh();
  }, RUN_POLL_MS);
}


async function register() {
  const playerId = shownPlayerId;
  const result = await send({ type: 'register', playerId });
  if (playerId !== shownPlayerId)
    return;

  if (result.run) {
    finished = null;
    status = { ...status, run: result.run, runPlayer: result.runPlayer };
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
  finished = null;
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
  timer = setTimeout(() => {
    showPage();
    markLinksLogged();
  }, 300);
}).observe(document.body, { childList: true, subtree: true });


// Signing in or out on the piu-rivals site, or coming back to this tab, checks again.
function recheck() {
  markLinksLogged();
  if (shownPlayerId  &&  ! status?.run)
    refresh().catch((error) => console.error(TAG, error));
}


chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local'  &&  changes[TOKEN_KEY])
    recheck();
});


document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible')
    recheck();
});


showPage();
markLinksLogged();
