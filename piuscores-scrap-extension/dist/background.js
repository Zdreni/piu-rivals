(() => {
  // src/config.js
  var TAG = "[piuscores-scrap]";
  var API_URL = "https://api.pumpking.top:6767";
  var TOKEN_KEY = "token";
  var REJECTED_TOKEN_KEY = "rejectedToken";

  // src/background.js
  var USER_TTL_MS = 5 * 6e4;
  var PLAYERS_TTL_MS = 6e4;
  var ACTIVE_STATUSES = ["queued", "running"];
  var userCache = null;
  var playersCache = null;
  var ApiError = class extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  };
  async function storedToken() {
    const { [TOKEN_KEY]: token } = await chrome.storage.local.get(TOKEN_KEY);
    return typeof token === "string" ? token : null;
  }
  async function api(method, path, body) {
    const token = await storedToken();
    if (!token)
      throw new ApiError(401, "Not signed in to piu-rivals");
    let response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...body !== void 0 ? { "content-type": "application/json" } : {}
        },
        body: body !== void 0 ? JSON.stringify(body) : void 0
      });
    } catch {
      throw new ApiError(0, "The piu-rivals server is unreachable");
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && await storedToken() === token) {
        await chrome.storage.local.set({ [REJECTED_TOKEN_KEY]: token });
        await chrome.storage.local.remove(TOKEN_KEY);
      }
      throw new ApiError(response.status, data?.error || `piu-rivals answered ${response.status}`);
    }
    return data;
  }
  async function currentUser() {
    const token = await storedToken();
    if (userCache?.token !== token || Date.now() - userCache.at > USER_TTL_MS)
      userCache = { token, at: Date.now(), user: (await api("GET", "/me")).user };
    return userCache.user;
  }
  async function knownPlayers() {
    if (!playersCache || Date.now() - playersCache.at > PLAYERS_TTL_MS) {
      const { players } = await api("GET", "/players");
      playersCache = { at: Date.now(), byId: new Map(players.map((p) => [p.id, p])) };
    }
    return playersCache.byId;
  }
  async function activeRunFor(playerId) {
    const { runs } = await api("GET", "/admin/scrape-runs?active=true");
    return runs.find((run) => ACTIVE_STATUSES.includes(run.status) && (run.playerIds?.includes(playerId) || run.currentPlayer?.id === playerId)) ?? null;
  }
  async function playerStatus({ playerId }) {
    if (!await storedToken())
      return { state: "signed-out" };
    if (!(await currentUser()).isAdmin)
      return { state: "not-admin" };
    const [players, run] = await Promise.all([knownPlayers(), activeRunFor(playerId)]);
    const player = players.get(playerId) ?? null;
    return { state: player ? "known" : "unknown", player, run };
  }
  async function registerPlayer({ playerId }) {
    const { run } = await api("POST", "/admin/scrape-runs", { kind: "register", players: [playerId] });
    playersCache = null;
    return { run };
  }
  async function scrapeRun({ runId }) {
    const { run } = await api("GET", `/admin/scrape-runs/${runId}`);
    if (!ACTIVE_STATUSES.includes(run.status))
      playersCache = null;
    return { run };
  }
  var handlers = { status: playerStatus, register: registerPlayer, run: scrapeRun };
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handler = handlers[message?.type];
    if (!handler)
      return false;
    handler(message).then(sendResponse, (error) => {
      if (error.status === 401)
        return sendResponse({ state: "signed-out" });
      if (error.status === 403) {
        userCache = null;
        return sendResponse({ state: "not-admin" });
      }
      console.error(TAG, error);
      sendResponse({ state: "error", message: error.message });
    });
    return true;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[TOKEN_KEY])
      return;
    userCache = null;
    playersCache = null;
  });
})();
