(() => {
  // src/notifications.js
  var MAX_LINES = 8;
  var TOAST_MS = 5e3;
  var fmt = (n) => n === null || n === void 0 ? "\u2014" : n.toLocaleString("en-US");
  var fmtDelta = (n) => {
    if (n === null || n === void 0) return "<span>\u2014</span>";
    const cls = n > 0 ? "pos" : n < 0 ? "neg" : "";
    return `<span class="${cls}">${n > 0 ? "+" : ""}${fmt(n)}</span>`;
  };
  var fmtScore = (score, prev) => prev === null || prev === score ? fmt(score) : `${fmt(prev)} \u2192 ${fmt(score)}`;
  var esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function eventLines(event) {
    const name = `${esc(event.track)} <b>${esc(event.chart)}</b>`;
    const badge = event.change === "new" ? '<span class="new">NEW</span>' : '<span class="upd">UPD</span>';
    if (event.kind === "rival") {
      return [`${badge} ${name} ${esc(event.player)}: ${fmtScore(event.score, event.prevScore)} (${fmtDelta(event.delta)})`];
    }
    return [
      `${badge} ${name} You: ${fmtScore(event.score, event.prevScore)}`,
      ...event.deltas.map((d) => `<span class="sub">${esc(d.player)}: ${fmt(d.score)} (${fmtDelta(d.delta)})</span>`)
    ];
  }
  function showToast(shadow, rival, events) {
    const toast = document.createElement("div");
    toast.className = "toast";
    const all = events.flatMap(eventLines);
    const lines = all.slice(0, MAX_LINES).map((line) => `<div class="line">${line}</div>`).join("");
    const more = all.length > MAX_LINES ? `<div class="more">\u2026and ${all.length - MAX_LINES} more line(s) (see console)</div>` : "";
    toast.innerHTML = `<div class="title">${esc(rival)}: ${events.length} change(s)</div>${lines}${more}`;
    const close = () => {
      if (toast.classList.contains("out")) return;
      toast.classList.add("out");
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 600);
    };
    toast.addEventListener("click", close);
    setTimeout(close, TOAST_MS);
    shadow.querySelector(".stack").appendChild(toast);
  }

  // src/storage.js
  var STORAGE_VERSION = 1;
  var MIN_SCRAPE_LEVEL = 10;
  var storageKey = (row) => `${row.track}|${row.chart}`;
  var isScrapLevel = (chart) => {
    const level = chart.match(/\d+/);
    return level !== null && Number(level[0]) >= MIN_SCRAPE_LEVEL;
  };
  var delta = (mine, theirs) => mine === null || mine === void 0 || theirs === null ? null : mine - theirs;
  var targetWeight = (diffs) => diffs.reduce((acc, d) => acc + (d !== null && d < 0 ? Math.sqrt(-d) : 0), 0);
  var byTargetWeight = (a, b) => b.weight - a.weight || Number(b.unplayed) - Number(a.unplayed) || a.track.localeCompare(b.track);
  var leadWeight = (chart) => chart.rivals.reduce((acc, rival) => acc + (rival.delta !== null && rival.delta > 0 ? Math.sqrt(rival.delta) : 0), 0);
  var byLeadWeight = (a, b) => leadWeight(b) - leadWeight(a) || a.track.localeCompare(b.track);
  async function loadCharts() {
    const all = await chrome.storage.local.get(null);
    const players = all.players && typeof all.players === "object" ? all.players : {};
    const playerName2 = (playerId) => {
      const player = players[playerId];
      if (player && typeof player === "object" && typeof player.name === "string") return player.name;
      return playerId;
    };
    const ownPlayerId = typeof all.ownPlayerId === "string" ? all.ownPlayerId : null;
    const results = all.results && typeof all.results === "object" ? all.results : {};
    const charts = [];
    for (const [key, rawScores] of Object.entries(results)) {
      if (!rawScores || typeof rawScores !== "object") continue;
      const [track, chart] = key.split(/\|(?=[^|]*$)/);
      const scores = rawScores;
      const mine = ownPlayerId ? scores[ownPlayerId] ?? null : null;
      const rivals = [
        ...Object.entries(scores).filter(([playerId]) => playerId !== ownPlayerId).map(([playerId, score]) => ({
          player: playerName2(playerId),
          playerId,
          score,
          delta: delta(mine, score)
        }))
      ].sort((a, b) => b.score - a.score);
      if (rivals.length) {
        charts.push({
          track,
          chart,
          mine,
          rivals,
          unplayed: mine === null,
          weight: targetWeight(rivals.map((rival) => rival.delta))
        });
      }
    }
    return charts;
  }

  // src/scores-ui.js
  var fmt2 = (n) => n === null || n === void 0 ? "\u2014" : n.toLocaleString("en-US");
  var fmtDelta2 = (n) => {
    if (n === null || n === void 0) return "<span>\u2014</span>";
    const cls = n > 0 ? "pos" : n < 0 ? "neg" : "";
    return `<span class="${cls}">${n > 0 ? "+" : ""}${fmt2(n)}</span>`;
  };
  var esc2 = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var levelType = (level) => (level.match(/^[A-Za-z]+/) || [level])[0];
  var levelNum = (level) => parseInt((level.match(/\d+/) || ["0"])[0], 10);
  var TYPE_ORDER = { S: 0, D: 1 };
  function compareLevels(a, b) {
    const ta = levelType(a), tb = levelType(b);
    return (TYPE_ORDER[ta] ?? 9) - (TYPE_ORDER[tb] ?? 9) || ta.localeCompare(tb) || levelNum(a) - levelNum(b);
  }
  var chartTier = (chart) => chart.weight > 0 ? "rivals-win" : chart.unplayed ? "not-played" : "you-win";
  var TABS = [
    { id: "rivals-win", label: "Rivals win" },
    { id: "not-played", label: "Not played" },
    { id: "you-win", label: "You win" }
  ];
  var UI_STATE_KEY = "piuscores.rivalScores.uiState";
  function readUiState() {
    try {
      const raw = sessionStorage.getItem(UI_STATE_KEY);
      if (!raw) return { isOpen: false, selectedLevel: null, selectedTab: "rivals-win" };
      const saved = JSON.parse(raw);
      return {
        isOpen: saved.isOpen === true,
        selectedLevel: typeof saved.selectedLevel === "string" ? saved.selectedLevel : null,
        selectedTab: TABS.some(({ id }) => id === saved.selectedTab) ? saved.selectedTab : "rivals-win"
      };
    } catch (error) {
      console.error("[piuscores] Unable to restore rival scores window state", error);
      return { isOpen: false, selectedLevel: null, selectedTab: "rivals-win" };
    }
  }
  var styles = `
  .buttons { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; display: flex; gap: 8px; }
  .btn { background: #14201A; color: #4FE33F; border: 1px solid #4FE33F; border-radius: 6px;
         padding: 8px 12px; font: 600 13px/1 Roboto, Arial, sans-serif; cursor: pointer;
         box-shadow: 0 4px 14px rgba(0,0,0,.5); }
  .btn:hover { background: #1C2B22; }
  .btn.clear-data { color: #FF5A5A; border-color: #FF5A5A; }
  .btn.clear-data:hover { background: #2B1C1C; }
  .overlay { position: fixed; inset: 0; z-index: 2147483646; background: rgba(0,0,0,.6);
             display: flex; align-items: center; justify-content: center;
             font: 20px/1.4 Roboto, Arial, sans-serif; color: #EAF5EC; }
  .overlay[hidden] { display: none; }
  .dialog { background: #14201A; border: 1px solid #2B4034; border-radius: 8px;
            width: min(1200px, calc(100vw - 32px)); height: min(900px, calc(100vh - 64px));
            display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,.6); }
  .dlg-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px;
              border-bottom: 1px solid #2B4034; }
  .dlg-head h2 { margin: 0; font-size: 24px; font-weight: 600; flex: 1; }
  .dlg-count { color: #9AB3A3; }
  .dlg-close { background: none; border: none; color: #9AB3A3; font-size: 30px; line-height: 1;
               cursor: pointer; padding: 0 4px; }
  .dlg-close:hover { color: #EAF5EC; }
  .dlg-main { display: flex; flex: 1; min-height: 0; }
  .score-content { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
  .filters { display: flex; gap: 6px; padding: 10px; border-right: 1px solid #2B4034;
             overflow-y: auto; flex-shrink: 0; align-items: flex-start; }
  .filter-row { display: flex; flex-direction: column; gap: 6px; }
  .filter-row .chip { width: 100%; }
  .chip { background: #1C2B22; color: #9AB3A3; border: 1px solid #2B4034; border-radius: 999px;
          padding: 3px 10px; font: inherit; cursor: pointer; }
  .chip:hover { color: #EAF5EC; }
  .chip.on { background: #2B4034; color: #EAF5EC; border-color: #4FE33F; font-weight: 600;
             box-shadow: 0 0 0 1px #4FE33F inset; }
  .chip { display: inline-flex; flex-direction: column; align-items: center; line-height: 1.2; border-radius: 10px; }
  .chip-stats { font-size: .6em; font-weight: 400; color: #8A9590; }
  .chip-stats .blue { color: #3FA9F5; }
  .chip-stats .zero { opacity: .2; }
  .tabs { display: flex; gap: 6px; padding: 10px 16px; border-bottom: 1px solid #2B4034; }
  .tab { background: #1C2B22; color: #9AB3A3; border: 1px solid #2B4034; border-radius: 6px;
         padding: 6px 12px; font: 500 14px/1.2 Roboto, Arial, sans-serif; cursor: pointer; }
  .tab:hover { color: #EAF5EC; }
  .tab[aria-selected="true"] { background: #2B4034; color: #EAF5EC; border-color: #4FE33F; }
  .tab-count { margin-left: 6px; }
  .tab-count.rivals-win { color: #FF5A5A; }
  .tab-count.not-played { color: #3FA9F5; }
  .tab-count.you-win { color: #4FE33F; }
  .dlg-body { overflow: auto; padding: 0 16px 12px; flex: 1; }
  table { border-collapse: collapse; }
  .track { width: 420px; min-width: 420px; max-width: 420px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mine { color: #FFC433; font-weight: 600; }
  .won { opacity: .4; }
  .player-link { color: inherit; text-decoration: underline; text-decoration-color: #4FE33F66; }
  .player-link:hover { color: #4FE33F; }
  th { position: sticky; top: 0; background: #14201A; color: #9AB3A3; font-weight: 500;
       text-align: left; padding: 8px 6px; border-bottom: 1px solid #2B4034; }
  td { padding: 4px 6px; vertical-align: top; }
  tr.alt > td:not(.track):not([rowspan]) { background: rgba(255,255,255,.05); }
  tr.group td { border-top: 1px solid #2B4034; padding-top: 14px; }
  tbody tr.group:not(:first-child) td { border-top-width: 2px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: #9AB3A3; }
  .empty { padding: 24px; text-align: center; color: #9AB3A3; }
  .stack { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
           display: flex; flex-direction: column; gap: 8px; max-width: min(420px, calc(100vw - 32px));
           font: 13px/1.4 Roboto, Arial, sans-serif; }
  .toast { background: #14201A; color: #EAF5EC; border-left: 4px solid #4FE33F; border-radius: 6px;
           padding: 10px 12px; box-shadow: 0 6px 20px rgba(0,0,0,.5); cursor: pointer;
           animation: in .2s ease-out; transition: opacity .5s ease; }
  .toast.out { opacity: 0; }
  .title { font-weight: 600; margin-bottom: 4px; }
  .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { padding-left: 16px; }
  .new { color: #2BC1D8; }
  .upd { color: #FFC433; }
  .pos { color: #4FE33F; }
  .neg { color: #FF5A5A; }
  .more { color: #9AB3A3; margin-top: 2px; }
  @keyframes in { from { opacity: 0; transform: translateY(8px); } }
`;
  function createScoresUI(exportTargets2) {
    let uiHost = null;
    const savedState = readUiState();
    let isWindowOpen = savedState.isOpen;
    let selectedLevel = savedState.selectedLevel;
    let selectedTab = savedState.selectedTab;
    function saveUiState() {
      try {
        sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({ isOpen: isWindowOpen, selectedLevel, selectedTab }));
      } catch (error) {
        console.error("[piuscores] Unable to save rival scores window state", error);
      }
    }
    function ensure() {
      if (uiHost) {
        if (!uiHost.isConnected) document.body.appendChild(uiHost);
        return uiHost.shadowRoot;
      }
      uiHost = document.createElement("div");
      const shadow = uiHost.attachShadow({ mode: "open" });
      shadow.innerHTML = `
      <style>${styles}</style>
      <div class="stack"></div>
      <div class="buttons">
        <button class="btn export" type="button" title="Download charts where rivals beat you or you have no score">Export targets</button>
        <button class="btn show-scores" type="button" title="Show all saved rival scores">Rival scores</button>
        <button class="btn clear-data" type="button" title="Clear all PIU Scores data saved by this extension">Clear data</button>
      </div>
      <div class="overlay" ${isWindowOpen ? "" : "hidden"}>
        <div class="dialog" role="dialog" aria-label="Rival scores">
          <div class="dlg-head"><h2>Rival scores</h2><span class="dlg-count"></span>
            <button class="dlg-close" type="button" aria-label="Close">\xD7</button></div>
          <div class="dlg-main">
            <div class="filters"></div>
            <div class="score-content">
              <div class="tabs" role="tablist" aria-label="Score results"></div>
              <div class="dlg-body" role="tabpanel"></div>
            </div>
          </div>
        </div>
      </div>`;
      shadow.querySelector(".export").addEventListener("click", () => {
        exportTargets2().catch((error) => console.error("[piuscores]", error));
      });
      shadow.querySelector(".show-scores").addEventListener("click", () => open());
      shadow.querySelector(".clear-data").addEventListener("click", async () => {
        if (!window.confirm("Clear all PIU Scores data saved by this extension? This cannot be undone.")) return;
        try {
          await chrome.storage.local.clear();
          selectedLevel = null;
          selectedTab = "rivals-win";
          await render();
        } catch (error) {
          console.error("[piuscores] Unable to clear saved data", error);
        }
      });
      shadow.querySelector(".dlg-close").addEventListener("click", () => close());
      shadow.querySelector(".filters").addEventListener("click", (event) => {
        const chip = event.target.closest(".chip");
        if (!chip) return;
        selectedLevel = chip.dataset.level;
        saveUiState();
        render().catch((error) => console.error("[piuscores]", error));
      });
      shadow.querySelector(".tabs").addEventListener("click", (event) => {
        const tab = event.target.closest(".tab");
        if (!tab) return;
        selectedTab = tab.dataset.tab;
        saveUiState();
        render().catch((error) => console.error("[piuscores]", error));
      });
      document.body.appendChild(uiHost);
      return shadow;
    }
    function chartRows(chart) {
      const list = [...chart.rivals];
      if (chart.mine !== null) list.push({ player: "You", score: chart.mine, me: true });
      list.sort((a, b) => b.score - a.score || (b.me ? 1 : 0) - (a.me ? 1 : 0));
      return list.map((rival, i) => {
        const head = i === 0 ? `<td class="track" rowspan="${list.length}" title="${esc2(chart.track)}">${esc2(chart.track)}</td>
           <td rowspan="${list.length}"><b>${esc2(chart.chart)}</b></td>` : "";
        const tr = i === 0 ? '<tr class="group alt">' : i % 2 === 0 ? '<tr class="alt">' : "<tr>";
        if (rival.me) {
          return `${tr}${head}<td class="mine">You</td><td class="num mine">${fmt2(rival.score)}</td><td></td></tr>`;
        }
        const won = rival.delta !== null && rival.delta > 0 ? " won" : "";
        const playerId = rival.playerId;
        const name = playerId ? `<a class="player-link" href="https://piuscores.arroweclip.se/Player/${encodeURIComponent(playerId)}/Sessions">${esc2(rival.player)}</a>` : esc2(rival.player);
        return `${tr}${head}<td class="${won}">${name}</td><td class="num${won}">${fmt2(rival.score)}</td><td class="num${won}">${fmtDelta2(rival.delta)}</td></tr>`;
      });
    }
    async function render() {
      const shadow = ensure();
      const charts = await loadCharts();
      const levels = [...new Set(charts.map((chart) => chart.chart))].sort(compareLevels);
      if (!levels.includes(selectedLevel)) {
        selectedLevel = levels[0] ?? null;
        saveUiState();
      }
      const stats = {};
      const statsFor = (key) => stats[key] ||= { lose: 0, win: 0, unplayed: 0 };
      for (const chart of charts) {
        const statKey = { "rivals-win": "lose", "not-played": "unplayed", "you-win": "win" }[chartTier(chart)];
        statsFor(chart.chart)[statKey]++;
      }
      const stat = (cls, n) => `<span class="${cls}${n === 0 ? " zero" : ""}">${n}</span>`;
      const chip = (label) => {
        const on = label === selectedLevel;
        const counts = statsFor(label);
        return `<button class="chip${on ? " on" : ""}" type="button" role="radio" aria-checked="${on}" data-level="${esc2(label)}"><span>${esc2(label)}</span><span class="chip-stats" title="charts: losing / not played / best">${stat("neg", counts.lose)} / ${stat("blue", counts.unplayed)} / ${stat("pos", counts.win)}</span></button>`;
      };
      const types = [...new Set(levels.map(levelType))];
      shadow.querySelector(".filters").innerHTML = types.map((type) => `<div class="filter-row" role="radiogroup">${levels.filter((level) => levelType(level) === type).map(chip).join("")}</div>`).join("");
      const levelCharts = charts.filter((chart) => chart.chart === selectedLevel);
      const tabCounts = Object.fromEntries(TABS.map(({ id }) => [
        id,
        levelCharts.filter((chart) => chartTier(chart) === id).length
      ]));
      shadow.querySelector(".tabs").innerHTML = TABS.map(({ id, label }) => `<button class="tab" type="button" role="tab" aria-selected="${id === selectedTab}" data-tab="${id}">${label}<span class="tab-count ${id}">${tabCounts[id]}</span></button>`).join("");
      const visible = levelCharts.filter((chart) => chartTier(chart) === selectedTab);
      visible.sort(selectedTab === "you-win" ? byLeadWeight : byTargetWeight);
      shadow.querySelector(".dlg-count").textContent = `${visible.length} chart(s)`;
      const body = shadow.querySelector(".dlg-body");
      if (visible.length === 0) {
        const message = charts.length === 0 ? "No saved rival scores yet \u2014 open a rival's page to collect them." : `No ${TABS.find(({ id }) => id === selectedTab).label.toLowerCase()} charts at this level.`;
        body.innerHTML = `<div class="empty">${message}</div>`;
        return;
      }
      const rows = visible.flatMap(chartRows);
      body.innerHTML = `<table>
      <thead><tr><th class="track">Track</th><th>Chart</th><th>Player</th><th class="num">Score</th><th class="num">Diff</th></tr></thead>
      <tbody>${rows.join("")}</tbody></table>`;
    }
    function isOpen() {
      return isWindowOpen;
    }
    function open() {
      isWindowOpen = true;
      saveUiState();
      ensure().querySelector(".overlay").hidden = false;
      render().catch((error) => console.error("[piuscores]", error));
    }
    function close() {
      isWindowOpen = false;
      saveUiState();
      ensure().querySelector(".overlay").hidden = true;
    }
    function initialize() {
      ensure();
      if (isWindowOpen) render().catch((error) => console.error("[piuscores]", error));
    }
    return { ensure, initialize, render, isOpen };
  }

  // src/export-targets.js
  var fmt3 = (n) => n === null || n === void 0 ? "\u2014" : n.toLocaleString("en-US");
  async function exportTargets() {
    const charts = (await loadCharts()).flatMap(({ track, chart, rivals, unplayed }) => {
      const entries = rivals.map(({ player, score, delta: delta2 }) => ({ rival: player, score, difference: delta2 })).filter((r) => r.difference === null || r.difference < 0).sort((a2, b) => b.score - a2.score);
      return entries.length ? [{ track, chart, entries, unplayed, weight: targetWeight(entries.map((r) => r.difference)) }] : [];
    });
    charts.sort(byTargetWeight);
    const lines = [`PIU Scores targets \u2014 ${(/* @__PURE__ */ new Date()).toLocaleString()}`, `${charts.length} chart(s)`, ""];
    for (const { track, chart, entries } of charts) {
      lines.push(`${track}  ${chart}`);
      const nameW = Math.max(...entries.map((r) => r.rival.length)) + 1;
      const scoreW = Math.max(...entries.map((r) => fmt3(r.score).length));
      const diffW = Math.max(0, ...entries.filter((r) => r.difference !== null).map((r) => fmt3(r.difference).length));
      for (const r of entries) {
        const note = (r.difference === null ? "\u2014" : fmt3(r.difference)).padStart(diffW);
        lines.push(`  ${(r.rival + ":").padEnd(nameW)}  ${fmt3(r.score).padStart(scoreW)}  ${note}`);
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `piuscores-targets-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
  }

  // src/content.js
  var TAG = "[piuscores]";
  var ui = createScoresUI(exportTargets);
  var lastSignature = null;
  var timer = null;
  var text = (el) => el ? el.textContent.trim() : "";
  function findOwnPlayerId() {
    for (const link of document.querySelectorAll("a[href]")) {
      if (text(link).replace(/\s+/g, " ") !== "My Sessions") continue;
      const url = new URL(link.href, location.href);
      if (url.hostname !== location.hostname) continue;
      const match = url.pathname.match(/^\/Player\/([^/]+)\/Sessions\/?$/);
      if (match) return match[1];
    }
    return null;
  }
  async function syncOwnPlayerId() {
    const scrapedId = findOwnPlayerId();
    const { ownPlayerId } = await chrome.storage.local.get("ownPlayerId");
    if (scrapedId && scrapedId !== ownPlayerId) {
      await chrome.storage.local.set({ ownPlayerId: scrapedId });
      return scrapedId;
    }
    return typeof ownPlayerId === "string" ? ownPlayerId : null;
  }
  async function ensureStorageVersion() {
    const { storageVersion } = await chrome.storage.local.get("storageVersion");
    if (storageVersion === void 0) {
      await chrome.storage.local.set({ storageVersion: STORAGE_VERSION });
    } else if (storageVersion !== STORAGE_VERSION) {
      console.warn(`${TAG} Stored data version ${storageVersion} differs from supported version ${STORAGE_VERSION}`);
    }
  }
  function playerName() {
    return text(document.querySelector("main h5")).replace(/\s+[—–-]\s+Sessions$/i, "").trim();
  }
  function playerDisplayName(players, playerId) {
    return players[playerId]?.name || playerId;
  }
  function saveHigherScore(scores, playerId, score) {
    if (!playerId || score === null || score <= (scores[playerId] ?? -1)) return null;
    const prevScore = scores[playerId] ?? null;
    scores[playerId] = score;
    return { prevScore, change: prevScore === null ? "new" : "upd" };
  }
  function parseScore(cell) {
    const p = cell && cell.querySelector(".rvl-cmp-score p");
    if (!p) return null;
    const n = parseInt(p.textContent.replace(/[^\d]/g, ""), 10);
    return Number.isNaN(n) ? null : n;
  }
  function parseSessionScore(element) {
    const p = element?.querySelector('[data-testid="peer-score"] p');
    if (!p) return null;
    const n = parseInt(p.textContent.replace(/[^\d]/g, ""), 10);
    return Number.isNaN(n) ? null : n;
  }
  function scrapeSessionScores() {
    const highlights = document.querySelector('[data-testid="session-highlight-cards"]');
    const allPlays = document.querySelector('[data-testid="session-all-plays"]');
    if (!highlights && !allPlays) return null;
    const rowsByChart = /* @__PURE__ */ new Map();
    const addScore = (track, chart, score) => {
      if (!track || !isScrapLevel(chart) || score === null) return;
      const row = { track, chart, score };
      const key = storageKey(row);
      if (score > (rowsByChart.get(key)?.score ?? -1)) rowsByChart.set(key, row);
    };
    for (const card of highlights?.querySelectorAll('[data-testid="session-highlight-card"]') || []) {
      addScore(
        text(card.querySelector(".hl-card-song")),
        card.querySelector("img.difficulty-bubble")?.getAttribute("alt") || "",
        parseSessionScore(card)
      );
    }
    for (const row of document.querySelectorAll('[data-testid="session-score-row"]')) {
      addScore(
        text(row.querySelector('[data-testid="session-row-chart"]')),
        row.querySelector("img.difficulty-bubble")?.getAttribute("alt") || "",
        parseSessionScore(row)
      );
    }
    return {
      playerId: location.pathname.match(/^\/Player\/([^/]+)(?:\/|$)/)?.[1] ?? null,
      rows: [...rowsByChart.values()]
    };
  }
  function scrape() {
    const playerId = location.pathname.match(/^\/Player\/([^/]+)(?:\/|$)/)?.[1] ?? null;
    const table = document.querySelector('[data-testid="rival-compare-table"]');
    const headers = table?.querySelectorAll("thead th");
    const rival = text(headers?.[2]) || text(document.querySelector('[data-testid="player-hero"] h5'));
    const rows = [];
    for (const tr of table?.querySelectorAll("tbody tr") || []) {
      const cells = tr.querySelectorAll("td");
      if (cells.length < 3) continue;
      const songEl = cells[0].querySelector(".rvl-cmp-song");
      const track = songEl ? songEl.getAttribute("title") || text(songEl) : "";
      const chart = cells[0].querySelector("img.difficulty-bubble")?.getAttribute("alt") || "";
      if (!isScrapLevel(chart)) continue;
      rows.push({ track, chart, mine: parseScore(cells[1]), score: parseScore(cells[2]) });
    }
    return { rival, playerId, rows };
  }
  async function runSessionScores(result, ownPlayerId) {
    const signature = JSON.stringify({ sessions: result, ownPlayerId });
    if (signature === lastSignature) return;
    lastSignature = signature;
    const stored = await chrome.storage.local.get(["results", "players"]);
    const playerId = result.playerId;
    if (!playerId) {
      console.warn(`${TAG} Unable to identify the player ID for session scores`);
      return;
    }
    const name = playerName();
    const updates = {};
    const events = [];
    const results = { ...stored.results || {} };
    let resultsChanged = false;
    if (name) {
      const players = { ...stored.players || {} };
      if (players[playerId]?.name !== name) {
        players[playerId] = { ...players[playerId], name };
        updates.players = players;
      }
    }
    for (const row of result.rows) {
      const key = storageKey(row);
      const scores = { ...results[key] || {} };
      const scoreUpdate = saveHigherScore(scores, playerId, row.score);
      if (!scoreUpdate) continue;
      results[key] = scores;
      resultsChanged = true;
      if (scoreUpdate) events.push({
        kind: "rival",
        change: scoreUpdate.change,
        track: row.track,
        chart: row.chart,
        player: playerId === ownPlayerId ? "You" : name || playerId,
        score: row.score,
        prevScore: scoreUpdate.prevScore,
        delta: null
      });
    }
    if (resultsChanged) updates.results = results;
    if (Object.keys(updates).length) await chrome.storage.local.set(updates);
    if (events.length === 0) return;
    const player = playerId === ownPlayerId ? "You" : name || playerId;
    console.log(`${TAG} sessions: ${player}, ${events.length} best-score update(s)`);
    console.table(events.map((event) => ({
      type: event.change,
      track: event.track,
      chart: event.chart,
      player,
      score: event.score,
      prevScore: event.prevScore
    })));
    showToast(ui.ensure(), player, events);
  }
  async function run() {
    await ensureStorageVersion();
    const ownPlayerId = await syncOwnPlayerId();
    const sessionResult = scrapeSessionScores();
    if (sessionResult) {
      await runSessionScores(sessionResult, ownPlayerId);
      return;
    }
    const result = scrape();
    if (!result) return;
    const signature = JSON.stringify({ result, ownPlayerId });
    if (signature === lastSignature) return;
    lastSignature = signature;
    const { rival, playerId } = result;
    const stored = await chrome.storage.local.get(["results", "players"]);
    const events = [];
    const updates = {};
    const results = { ...stored.results || {} };
    let resultsChanged = false;
    if (rival && playerId) {
      const players = { ...stored.players || {} };
      if (players[playerId]?.name !== rival) {
        players[playerId] = { ...players[playerId], name: rival };
        updates.players = players;
      }
    }
    for (const row of result.rows) {
      const key = storageKey(row);
      const scores = { ...results[key] || {} };
      const { track, chart } = row;
      const rivalUpdate = saveHigherScore(scores, playerId, row.score);
      if (rivalUpdate) {
        events.push({
          kind: "rival",
          change: rivalUpdate.change,
          track,
          chart,
          player: playerId === ownPlayerId ? "You" : rival,
          score: row.score,
          prevScore: rivalUpdate.prevScore,
          delta: delta(scores[ownPlayerId] ?? null, row.score)
        });
      }
      const mineUpdate = saveHigherScore(scores, ownPlayerId, row.mine);
      if (mineUpdate) {
        const deltas = Object.entries(scores).filter(([id]) => id !== ownPlayerId).map(([id, score]) => ({
          player: playerDisplayName(stored.players || {}, id),
          score,
          delta: delta(row.mine, score)
        })).sort((a, b) => a.delta - b.delta);
        events.push({
          kind: "mine",
          change: mineUpdate.change,
          track,
          chart,
          score: row.mine,
          prevScore: mineUpdate.prevScore,
          deltas
        });
      }
      if (rivalUpdate || mineUpdate) {
        results[key] = scores;
        resultsChanged = true;
      }
    }
    if (resultsChanged) updates.results = results;
    if (Object.keys(updates).length) await chrome.storage.local.set(updates);
    if (events.length === 0) return;
    const player = playerId === ownPlayerId ? "You" : rival;
    console.log(`${TAG} rival: ${player}, ${events.length} change(s)`);
    console.table(events.flatMap((event) => event.kind === "rival" ? [{ type: event.change, track: event.track, chart: event.chart, player: event.player, score: event.score, prevScore: event.prevScore, delta: event.delta }] : [
      { type: `mine ${event.change}`, track: event.track, chart: event.chart, player: "You", score: event.score, prevScore: event.prevScore, delta: null },
      ...event.deltas.map((d) => ({ type: "delta", track: event.track, chart: event.chart, player: d.player, score: d.score, prevScore: null, delta: d.delta }))
    ]));
    showToast(ui.ensure(), player, events);
  }
  chrome.storage.onChanged.addListener((_, area) => {
    if (area === "local" && ui.isOpen()) ui.render().catch((error) => console.error(TAG, error));
  });
  ui.initialize();
  var pending = Promise.resolve();
  var schedule = () => {
    ui.ensure();
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = pending.then(run).catch((error) => console.error(TAG, error));
    }, 500);
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
