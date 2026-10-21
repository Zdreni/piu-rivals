import { API_URL, REJECTED_TOKEN_KEY, TAG, TOKEN_KEY } from './config.js';

// Calls the piu-rivals API for the piuscores pages. Requests from content scripts count as coming
// from piuscores, which the API's CORS doesn't allow; requests from here, with the API in the
// manifest's host_permissions, aren't limited by CORS.
const USER_TTL_MS = 5 * 60_000;
const PLAYERS_TTL_MS = 60_000;
const ACTIVE_STATUSES = ['queued', 'running'];

let userCache = null;
let playersCache = null;


class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}


async function storedToken() {
  const { [TOKEN_KEY]: token } = await chrome.storage.local.get(TOKEN_KEY);
  return typeof token === 'string' ? token : null;
}


async function api(method, path, body) {
  const token = await storedToken();
  if (! token)
    throw new ApiError(401, 'Not signed in to piu-rivals');

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'The piu-rivals server is unreachable');
  }

  const data = await response.json().catch(() => null);
  if (! response.ok) {
    // The session ended (signed out, expired): drop the copy, unless the site gave a new one meanwhile.
    if (response.status === 401  &&  await storedToken() === token) {
      await chrome.storage.local.set({ [REJECTED_TOKEN_KEY]: token });
      await chrome.storage.local.remove(TOKEN_KEY);
    }

    throw new ApiError(response.status, data?.error  ||  `piu-rivals answered ${response.status}`);
  }

  return data;
}


async function currentUser() {
  const token = await storedToken();
  if (userCache?.token !== token  ||  Date.now() - userCache.at > USER_TTL_MS)
    userCache = { token, at: Date.now(), user: (await api('GET', '/me')).user };

  return userCache.user;
}


async function knownPlayers() {
  if (! playersCache  ||  Date.now() - playersCache.at > PLAYERS_TTL_MS) {
    const { players } = await api('GET', '/players');
    playersCache = { at: Date.now(), byId: new Map(players.map((p) => [p.id, p])) };
  }

  return playersCache.byId;
}


// A queued or running scrape run the player is still waiting in or being scraped by. A run's players
// from playersDone on are the ones not finished yet.
async function activeRunFor(playerId) {
  const { runs } = await api('GET', '/admin/scrape-runs?state=current');
  return runs.find((run) => ACTIVE_STATUSES.includes(run.status)
    &&  (run.playerIds?.slice(run.playersDone).includes(playerId)  ||  run.currentPlayer?.id === playerId))  ??  null;
}


// A run response as { run, runPlayer }: runPlayer is the player's entry in the run, { id, name, state,
// index }, the latest one when the player was added again after being scraped.
function withRunPlayer({ run, players }, playerId) {
  const index = players.findLastIndex((p) => p.id === playerId);
  return { run, runPlayer: index >= 0 ? { ...players[index], index } : null };
}


async function runDetails(runId, playerId) {
  return withRunPlayer(await api('GET', `/admin/scrape-runs/${runId}`), playerId);
}


// The extension works only for admins; for anyone else the page shows nothing. Gives the state to
// answer with when the user isn't a signed-in admin, null when they are.
async function notAdminState() {
  if (! await storedToken())
    return { state: 'signed-out' };

  return (await currentUser()).isAdmin ? null : { state: 'not-admin' };
}


async function playerStatus({ playerId }) {
  const notAdmin = await notAdminState();
  if (notAdmin)
    return notAdmin;

  const [players, run] = await Promise.all([knownPlayers(), activeRunFor(playerId)]);
  const player = players.get(playerId)  ??  null;
  return { state: player ? 'known' : 'unknown', player, ...(run ? await runDetails(run.id, playerId) : { run: null }) };
}


// The server adds the player to an active run when there is one, so players added one after another
// are scraped together.
async function registerPlayer({ playerId }) {
  const response = await api('POST', '/admin/scrape-runs', { kind: 'register', players: [playerId] });
  playersCache = null;
  return withRunPlayer(response, playerId);
}


async function scrapeRun({ runId, playerId }) {
  const details = await runDetails(runId, playerId);
  if (! ['waiting', 'running'].includes(details.runPlayer?.state))
    playersCache = null;

  return details;
}


// The IDs of the players in piu-rivals, to mark the links to players on piuscores pages.
async function knownPlayerIds() {
  const notAdmin = await notAdminState();
  return notAdmin  ??  { state: 'ok', ids: [...(await knownPlayers()).keys()] };
}


const handlers = { status: playerStatus, register: registerPlayer, run: scrapeRun, players: knownPlayerIds };


chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (! handler)
    return false;

  handler(message).then(sendResponse, (error) => {
    if (error.status === 401)
      return sendResponse({ state: 'signed-out' });

    // Admin rights taken away since the user was last checked.
    if (error.status === 403) {
      userCache = null;
      return sendResponse({ state: 'not-admin' });
    }

    console.error(TAG, error);
    sendResponse({ state: 'error', message: error.message });
  });

  return true;
});


chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local'  ||  ! changes[TOKEN_KEY])
    return;

  userCache = null;
  playersCache = null;
});
