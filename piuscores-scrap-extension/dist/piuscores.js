(() => {
  // src/config.js
  var TAG = "[piuscores-scrap]";
  var TOKEN_KEY = "token";

  // src/player_links.js
  var MARK = "data-piu-rivals";
  var BUTTON_CLASS = "piu-rivals-scrape";
  var STYLE_ID = "piu-rivals-player-links";
  var styles = `
  a[${MARK}] { border-radius: 6px; outline: 2px solid; outline-offset: 1px; }
  a[${MARK}="known"] { outline-color: #4FE33F; }
  a[${MARK}="unknown"] { outline-color: #FFB020; }
  .${BUTTON_CLASS} { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;
                     width: 18px; height: 18px; margin-left: 6px; padding: 0; vertical-align: middle;
                     background: #FFD400; color: #14201A; border: none; border-radius: 4px;
                     font: 700 13px/1 Roboto, Arial, sans-serif; cursor: pointer; }
  .${BUTTON_CLASS}:hover:not(:disabled) { background: #FFE34D; }
  .${BUTTON_CLASS}:disabled { opacity: .6; cursor: default; }
  .${BUTTON_CLASS}.failed { background: #FF2A00; color: #FFFFFF; }
`;
  function addStyle() {
    if (document.getElementById(STYLE_ID))
      return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = styles;
    document.head.appendChild(style);
  }
  function buttonState(request) {
    if (request?.state === "sending")
      return { label: "\u2026", title: "Adding to piu-rivals", enabled: false };
    if (request?.state === "requested")
      return { label: "\u2713", title: "Queued for scraping on piu-rivals", enabled: false };
    if (request?.state === "failed")
      return { label: "!", title: `${request.message}. Click to try again.`, enabled: true, failed: true };
    return { label: "+", title: "Add to piu-rivals and scrape", enabled: true };
  }
  function createPlayerLinks({ playerIdOf: playerIdOf2, onScrape }) {
    const requests = /* @__PURE__ */ new Map();
    let knownIds = null;
    function linkPlayerId(link) {
      return playerIdOf2(new URL(link.href, location.href).pathname);
    }
    async function scrape(playerId) {
      requests.set(playerId, { state: "sending" });
      mark(knownIds);
      const result = await onScrape(playerId);
      requests.set(playerId, result.run ? { state: "requested" } : { state: "failed", message: result.message || "Not signed in to piu-rivals as an admin" });
      mark(knownIds);
    }
    function createButton(playerId) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = BUTTON_CLASS;
      button.dataset.player = playerId;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        scrape(playerId);
      });
      return button;
    }
    function showButton(link, playerId) {
      let button = link.nextElementSibling;
      if (!button?.classList.contains(BUTTON_CLASS)) {
        button = createButton(playerId);
        link.after(button);
      }
      const { label, title, enabled, failed } = buttonState(requests.get(playerId));
      if (button.textContent !== label)
        button.textContent = label;
      button.title = title;
      button.disabled = !enabled;
      button.classList.toggle("failed", !!failed);
    }
    function removeStaleButtons() {
      for (const button of document.querySelectorAll(`.${BUTTON_CLASS}`)) {
        const link = button.previousElementSibling;
        const stale = !knownIds || link?.getAttribute(MARK) !== "unknown" || linkPlayerId(link) !== button.dataset.player;
        if (stale)
          button.remove();
      }
    }
    function mark(ids) {
      knownIds = ids;
      if (knownIds)
        addStyle();
      for (const link of document.querySelectorAll("a[href]")) {
        const playerId = knownIds ? linkPlayerId(link) : null;
        const linkMark = playerId ? knownIds.has(playerId) ? "known" : "unknown" : null;
        if (linkMark !== link.getAttribute(MARK)) {
          if (linkMark)
            link.setAttribute(MARK, linkMark);
          else
            link.removeAttribute(MARK);
        }
        if (linkMark === "unknown")
          showButton(link, playerId);
      }
      removeStaleButtons();
      for (const playerId of requests.keys()) {
        if (knownIds?.has(playerId))
          requests.delete(playerId);
      }
    }
    return {
      mark,
      // Whether a player requested here isn't in piu-rivals yet, so the marks are worth checking again.
      waiting: () => [...requests.values()].some((request) => request.state === "requested")
    };
  }

  // src/ui/badge.js
  var styles2 = `
  .box { position: fixed; top: 72px; right: 16px; z-index: 2147483647; max-width: 300px;
         background: #14201A; color: #EAF5EC; border-left: 4px solid #4FE33F; border-radius: 6px;
         padding: 10px 12px; font: 13px/1.4 Roboto, Arial, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.5);
         display: flex; flex-direction: column; gap: 8px; }
  .box[hidden] { display: none; }
  .box.unknown { border-left-color: #FFB020; }
  .box.error { border-left-color: #FF2A00; }
  .title { font-weight: 600; color: #4FE33F; }
  .box.unknown .title { color: #FFB020; }
  .box.error .title { color: #FF2A00; }
  .muted { color: #9FB5A4; }
  .btn { align-self: flex-start; background: #14201A; color: #4FE33F; border: 1px solid #4FE33F;
         border-radius: 6px; padding: 7px 10px; font: 600 13px/1 Roboto, Arial, sans-serif; cursor: pointer; }
  .btn:hover:not(:disabled) { background: #1C2B22; }
  .btn:disabled { opacity: .5; cursor: default; }
  .btn[hidden] { display: none; }
`;
  var ACTIVE_STATUSES = ["queued", "running"];
  function ago(iso) {
    const minutes = Math.round((Date.now() - Date.parse(iso)) / 6e4);
    if (minutes < 60)
      return minutes <= 1 ? "just now" : `${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24)
      return hours === 1 ? "an hour ago" : `${hours} hours ago`;
    const days = Math.round(hours / 24);
    return days === 1 ? "yesterday" : `${days} days ago`;
  }
  var counts = (run) => `${run.sessionsAdded} new sessions, ${run.playsAdded} plays`;
  function runText(run) {
    if (run.status === "queued")
      return ["Queued for scraping", "Waiting for the scrape worker\u2026"];
    if (run.status === "running")
      return ["Scraping", `${counts(run)} so far\u2026`];
    if (run.status === "done")
      return ["Scraped", run.failures ? `${counts(run)}; ${run.failures} failed` : counts(run)];
    return [`Scrape ${run.status}`, run.failures ? `${run.failures} failed` : `${counts(run)} before it stopped`];
  }
  function playerText(run, runPlayer) {
    const solo = run.playersTotal <= 1;
    const others = run.playersTotal - 1;
    switch (runPlayer.state) {
      case "waiting": {
        const playersAhead = runPlayer.index - run.playersDone;
        return ["Queued for scraping", run.status === "queued" || playersAhead <= 0 ? "Waiting for the scrape worker\u2026" : `${playersAhead} player${playersAhead === 1 ? "" : "s"} ahead in the run\u2026`];
      }
      case "running":
        return ["Scraping", solo ? `${counts(run)} so far\u2026` : `Player ${runPlayer.index + 1} of ${run.playersTotal} in the run\u2026`];
      case "done":
        return ["Scraped", solo ? counts(run) : `Scraped in a run with ${others} other player${others === 1 ? "" : "s"}`];
      case "failed":
        return ["Scrape failed", "The run on piu-rivals has the error"];
      default:
        return ["Scrape stopped", `The run was ${run.status} before this player`];
    }
  }
  var ADD_LABEL = "Add to piu-rivals and scrape";
  var ADDED_LABEL = "Already in piu-rivals";
  function buttonFor(view) {
    if (view.run)
      return { label: "Scraping\u2026", enabled: false };
    return view.state === "known" ? { label: ADDED_LABEL, enabled: false } : { label: ADD_LABEL, enabled: true };
  }
  function describe(view) {
    if (view.state === "error")
      return { kind: "error", title: "piu-rivals", detail: view.message, button: null };
    const button = buttonFor(view);
    const { run, runPlayer } = view.run ? view : view.finished ?? {};
    if (run) {
      const [title, detail] = runPlayer ? playerText(run, runPlayer) : runText(run);
      const failed = runPlayer ? ["failed", "skipped"].includes(runPlayer.state) : !ACTIVE_STATUSES.includes(run.status) && run.status !== "done";
      return { kind: failed ? "error" : "known", title, detail, button };
    }
    if (view.state === "known") {
      const lastScrapedAt = view.player.lastScrapedAt;
      return { kind: "known", title: "In piu-rivals", detail: lastScrapedAt ? `Last scraped ${ago(lastScrapedAt)}` : "Not scraped yet", button };
    }
    return { kind: "unknown", title: "Not in piu-rivals", detail: `${view.name || "This player"} isn't stored yet.`, button };
  }
  function createBadge({ onRegister }) {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${styles2}</style>
    <div class="box" hidden>
      <div class="title"></div>
      <div class="detail muted"></div>
      <button class="btn" hidden></button>
    </div>`;
    const box = root.querySelector(".box");
    const button = root.querySelector(".btn");
    button.addEventListener("click", () => {
      button.disabled = true;
      onRegister();
    });
    function attach() {
      if (!host.isConnected)
        document.body.appendChild(host);
    }
    function show(view) {
      attach();
      const { kind, title, detail, button: buttonState2 } = describe(view);
      box.className = `box ${kind}`;
      box.querySelector(".title").textContent = title;
      box.querySelector(".detail").textContent = detail;
      button.hidden = !buttonState2;
      button.textContent = buttonState2?.label ?? "";
      button.disabled = !buttonState2?.enabled;
      box.hidden = false;
    }
    return {
      attach,
      show,
      hide: () => {
        box.hidden = true;
      }
    };
  }

  // src/piuscores.js
  var GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var RUN_POLL_MS = 3e3;
  var LINKS_POLL_MS = 1e4;
  var ACTIVE_STATUSES2 = ["queued", "running"];
  var text = (el) => el ? el.textContent.trim() : "";
  function ownPlayerId() {
    for (const link of document.querySelectorAll("a[href]")) {
      if (text(link).replace(/\s+/g, " ") !== "My Sessions")
        continue;
      const match = new URL(link.href, location.href).pathname.match(/^\/Player\/([^/]+)\/Sessions\/?$/);
      if (match && GUID_RE.test(match[1]))
        return match[1].toLowerCase();
    }
    return null;
  }
  var accountUsername = () => text(document.querySelector(".shell-menu-caption")).match(/^(.+?)\s*\(/)?.[1] ?? null;
  function playerIdOf(pathname) {
    const segment = pathname.match(/^\/Player\/([^/]+)(?:\/Sessions)?\/?$/)?.[1];
    if (!segment)
      return null;
    const id = decodeURIComponent(segment);
    if (GUID_RE.test(id))
      return id.toLowerCase();
    const username = accountUsername();
    return username && id.toLowerCase() === username.toLowerCase() ? ownPlayerId() : null;
  }
  var pagePlayerId = () => playerIdOf(location.pathname);
  var pagePlayerName = () => text(document.querySelector("main h5")).replace(/\s+[—–-]\s+Sessions$/i, "").trim();
  async function send(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      return { state: "error", message: error.message };
    }
  }
  var badge = createBadge({ onRegister: register });
  var shownPlayerId = null;
  var status = null;
  var finishedRun = null;
  var pollTimer = null;
  function render() {
    if (status.state === "signed-out" || status.state === "not-admin") {
      badge.hide();
      return;
    }
    badge.show({ ...status, finished: finishedRun, name: pagePlayerName() });
  }
  async function refresh() {
    const playerId = shownPlayerId;
    const nextStatus = await send({ type: "status", playerId });
    if (playerId !== shownPlayerId)
      return;
    status = nextStatus;
    render();
    if (status.run)
      watchRun(status.run.id);
  }
  async function scrapeFromLink(playerId) {
    const result = await send({ type: "register", playerId });
    if (playerId === shownPlayerId && !status?.run)
      refresh().catch((error) => console.error(TAG, error));
    return result;
  }
  var playerLinks = createPlayerLinks({ playerIdOf, onScrape: scrapeFromLink });
  var marksRequest = 0;
  var marksTimer = null;
  async function markLinks() {
    const request = ++marksRequest;
    clearTimeout(marksTimer);
    const result = await send({ type: "players" });
    if (request !== marksRequest)
      return;
    if (result.state !== "error")
      playerLinks.mark(result.ids ? new Set(result.ids) : null);
    if (playerLinks.waiting())
      marksTimer = setTimeout(markLinksLogged, LINKS_POLL_MS);
  }
  var markLinksLogged = () => markLinks().catch((error) => console.error(TAG, error));
  function watchRun(runId) {
    const playerId = shownPlayerId;
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      const result = await send({ type: "run", runId, playerId });
      if (playerId !== shownPlayerId)
        return;
      if (result.state === "error" || result.state === "signed-out") {
        status = result;
        render();
        return;
      }
      const { run, runPlayer } = result;
      if (runPlayer ? ["waiting", "running"].includes(runPlayer.state) : ACTIVE_STATUSES2.includes(run.status)) {
        status = { ...status, run, runPlayer };
        render();
        watchRun(runId);
        return;
      }
      finishedRun = { run, runPlayer };
      markLinksLogged();
      await refresh();
    }, RUN_POLL_MS);
  }
  async function register() {
    const playerId = shownPlayerId;
    const result = await send({ type: "register", playerId });
    if (playerId !== shownPlayerId)
      return;
    if (result.run) {
      finishedRun = null;
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
      if (playerId && status)
        badge.attach();
      return;
    }
    shownPlayerId = playerId;
    status = null;
    finishedRun = null;
    clearTimeout(pollTimer);
    if (!playerId) {
      badge.hide();
      return;
    }
    refresh().catch((error) => console.error(TAG, error));
  }
  var timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      showPage();
      markLinksLogged();
    }, 300);
  }).observe(document.body, { childList: true, subtree: true });
  function recheck() {
    markLinksLogged();
    if (shownPlayerId && !status?.run)
      refresh().catch((error) => console.error(TAG, error));
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[TOKEN_KEY])
      recheck();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible")
      recheck();
  });
  showPage();
  markLinksLogged();
})();
