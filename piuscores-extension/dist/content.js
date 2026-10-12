(() => {
  // src/storage.js
  var STORAGE_VERSION = 1;
  var MIN_SCRAPE_LEVEL = 10;
  var displayName = (name) => name.replace(/\s*#\d{4}$/, "");
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
  async function loadPlayers() {
    const { players, ownPlayerId } = await chrome.storage.local.get(["players", "ownPlayerId"]);
    return {
      players: players && typeof players === "object" ? players : {},
      ownPlayerId: typeof ownPlayerId === "string" ? ownPlayerId : null
    };
  }
  async function loadPreferences() {
    const { preferences } = await chrome.storage.local.get("preferences");
    const prefs = preferences && typeof preferences === "object" ? preferences : {};
    return { hiddenRivals: Array.isArray(prefs.hiddenRivals) ? prefs.hiddenRivals : [] };
  }
  async function savePreferences(changes) {
    const { preferences } = await chrome.storage.local.get("preferences");
    await chrome.storage.local.set({ preferences: { ...preferences || {}, ...changes } });
  }
  function withRivals(chart, keep) {
    const rivals = chart.rivals.filter(keep);
    if (rivals.length === chart.rivals.length) return chart;
    if (!rivals.length) return null;
    return { ...chart, rivals, weight: targetWeight(rivals.map((rival) => rival.delta)) };
  }

  // src/ui/rivals.js
  var fmt = (n) => n === null || n === void 0 ? "\u2014" : n.toLocaleString("en-US");
  var fmtScore = (n, tailClass = "tail") => {
    const text2 = fmt(n);
    const i = text2.lastIndexOf(",");
    return i === -1 ? text2 : `${text2.slice(0, i)}<span class="${tailClass}">${text2.slice(i)}</span>`;
  };
  var fmtDelta = (n) => {
    if (n === null || n === void 0) return "<span>\u2014</span>";
    const cls = n > 0 ? "pos" : n < 0 ? "neg" : "";
    const sign = n > 0 ? "+" : n < 0 ? "-" : "";
    const digits = Math.abs(n) < 1e3 ? `<span class="tail-dim">${Math.abs(n)}</span>` : fmtScore(Math.abs(n), "tail-dim");
    return `<span class="${cls}">${sign}${digits}</span>`;
  };
  var esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var stat = (cls, n) => `<span class="${cls}${n === 0 ? " zero" : ""}">${n}</span>`;
  var statLine = (counts) => `${stat("neg", counts.lose)} / ${stat("blue", counts.unplayed)} / ${stat("pos", counts.win)}`;
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
  var SCRAP_RESULTS_LABEL = "Scrap results";
  function isPlayerSessionsPage() {
    return /^\/Player\/[^/]+\/Sessions\/?$/i.test(location.pathname);
  }
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
  .btn:hover:not(:disabled) { background: #1C2B22; }
  .btn:disabled { opacity: .45; cursor: default; }
  .btn.clear-data { color: #FF5A5A; border-color: #FF5A5A; }
  .btn.clear-data:hover { background: #2B1C1C; }
  .overlay { position: fixed; inset: 0; z-index: 2147483646; background: rgba(0,0,0,.6);
             display: flex; align-items: center; justify-content: center;
             font: 20px/1.4 Roboto, Arial, sans-serif; color: #EAF5EC; }
  .overlay[hidden] { display: none; }
  .dialog { background: #14201A; border: 1px solid #2B4034; border-radius: 8px;
            width: min(1200px, calc(100vw - 32px)); height: 90vh;
            display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,.6); }
  .dlg-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px;
              border-bottom: 1px solid #2B4034; }
  .dlg-head h2 { margin: 0; font-size: 24px; font-weight: 600; flex: 1; }
  .dlg-head .btn { box-shadow: none; }
  .head-stats { font-weight: 400; color: #9AB3A3; }
  .head-stats .blue { color: #3FA9F5; }
  .head-stats > span, .chip-stats > span, .rival-stats > span, .tab-count { opacity: .7; }
  .head-stats .zero { opacity: .2; }
  .dlg-close { background: none; border: none; color: #9AB3A3; font-size: 30px; line-height: 1;
               cursor: pointer; padding: 0 4px; }
  .dlg-close:hover { color: #EAF5EC; }
  .dlg-main { display: flex; flex: 1; min-height: 0; }
  .score-content { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
  .rival-list, .filters, .dlg-body { scrollbar-width: thin; scrollbar-color: #2B4034 transparent; }
  .rival-list:hover, .filters:hover, .dlg-body:hover { scrollbar-color: #3D5A49 transparent; }
  .rival-list { width: 312px; flex-shrink: 0; overflow-y: auto; padding: 10px 24px 10px 8px;
                border-right: 1px solid #2B4034; }
  .rival { padding: 9px 6px; border-radius: 4px; }
  .rival:nth-child(even) { background: rgba(255,255,255,.05); }
  .rival:hover { background: rgba(79,227,63,.12); }
  .rival-toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .rival input { accent-color: #4FE33F; margin: 0; flex-shrink: 0; width: 16px; height: 16px; cursor: pointer; }
  .rival-spacer { width: 16px; flex-shrink: 0; }
  .rival.me .rival-toggle { cursor: default; }
  .rival.me .rival-name, .rival.me .rival-pum { color: #FFC433; font-weight: 600; }
  .rival-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rival-pum { color: #9AB3A3; font-variant-numeric: tabular-nums; }
  .rival-links { display: flex; align-items: center; gap: 6px; margin: 2px 0 0 24px; }
  .rival-stats { margin-left: auto; font-size: 13px; color: #8A9590; font-variant-numeric: tabular-nums; }
  .rival-stats .blue { color: #3FA9F5; }
  .rival-stats .zero { opacity: .2; }
  .rival-link { color: #9AB3A3; border: 1px solid #2B4034; border-radius: 4px; padding: 1px 8px;
                font-size: 13px; text-decoration: none; }
  .rival-link:hover { color: #4FE33F; border-color: #4FE33F; background: #14201A; }
  .rival.off .rival-name, .rival.off .rival-pum, .rival.off .rival-stats { opacity: .45; }
  .filters { display: flex; gap: 6px; padding: 10px 10px 10px 40px; border-right: 1px solid #2B4034;
             overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable; flex-shrink: 0; align-items: flex-start; }
  .filter-grid { display: grid; gap: 6px; }
  .filter-grid .chip { width: 100%; }
  .chip { background: #1C2B22; color: #9AB3A3; border: 1px solid #2B4034; border-radius: 999px;
          padding: 3px 10px; font: inherit; cursor: pointer; }
  .chip:hover { color: #EAF5EC; }
  .chip.on { background: #2B4034; color: #EAF5EC; border-color: #4FE33F; font-weight: 600;
             box-shadow: 0 0 0 1px #4FE33F inset; }
  .chip { display: inline-flex; flex-direction: column; align-items: center; line-height: 1.2; border-radius: 10px; }
  .chip.placeholder { visibility: hidden; }
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
  .dlg-body { overflow-y: auto; overflow-x: hidden; padding: 0 16px 12px; flex: 1; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th.col-chart { width: 56px; }
  th.col-player { width: 92px; } /* 80px of text + 12px padding */
  th.col-score { width: 70px; }
  th.col-diff { width: 70px; }
  .track { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mine { color: #FFC433; }
  td.sm { font-size: 16px; vertical-align: baseline; }
  td.score { color: #9AB3A3; }
  .tail { font-size: .75em; opacity: .6; }
  .tail-dim { opacity: .7; }
  td.score.mine { color: #C9A44A; }
  .won { opacity: .4; }
  .ahead { opacity: .8; }
  .player-link { color: inherit; text-decoration: none; }
  .player-link:hover { color: #4FE33F; }
  th { position: sticky; top: 0; background: #14201A; color: #9AB3A3; font-weight: 500;
       text-align: left; padding: 8px 6px; border-bottom: 1px solid #2B4034; }
  td { padding: 4px 6px; vertical-align: top; overflow: hidden; text-overflow: ellipsis; }
  tr.alt > td:not(.track):not([rowspan]) { background: rgba(255,255,255,.05); }
  tr.group td { border-top: 1px solid #2B4034; }
  tr.gap td { height: 8px; padding: 0; }
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
  function createScoresUI(exportTargets2, scrapeResults, canScrapeResults) {
    let uiHost = null;
    let isScraping = false;
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
    function updateScrapButton(shadow) {
      const scrapButton = shadow.querySelector(".scrap-results");
      scrapButton.hidden = !isPlayerSessionsPage();
      scrapButton.disabled = isScraping || !canScrapeResults();
    }
    function ensure() {
      if (uiHost) {
        if (!uiHost.isConnected) document.body.appendChild(uiHost);
        const shadow2 = uiHost.shadowRoot;
        updateScrapButton(shadow2);
        return shadow2;
      }
      uiHost = document.createElement("div");
      const shadow = uiHost.attachShadow({ mode: "open" });
      shadow.innerHTML = `
      <style>${styles}</style>
      <div class="stack"></div>
      <div class="buttons">
        <button class="btn scrap-results" type="button" title="Scrape Phoenix 2 sessions on this player page">Scrap results</button>
        <button class="btn show-scores" type="button" title="Show all saved rival scores">Rival scores</button>
      </div>
      <div class="overlay" ${isWindowOpen ? "" : "hidden"}>
        <div class="dialog" role="dialog" aria-label="Rival scores">
          <div class="dlg-head"><h2>Rivals</h2>
            <button class="btn export" type="button" title="Download charts where rivals beat you or you have no score">Export targets</button>
            <button class="btn clear-data" type="button" title="Clear all PIU Scores data saved by this extension">Clear data</button>
            <button class="dlg-close" type="button" aria-label="Close">\xD7</button></div>
          <div class="dlg-main">
            <div class="rival-list" aria-label="Rivals"></div>
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
      const scrapButton = shadow.querySelector(".scrap-results");
      updateScrapButton(shadow);
      scrapButton.addEventListener("click", async () => {
        isScraping = true;
        updateScrapButton(shadow);
        try {
          await scrapeResults((status) => {
            scrapButton.textContent = status;
          });
        } catch (error) {
          console.error("[piuscores] Unable to scrape player sessions", error);
          scrapButton.textContent = "Scraping failed";
        } finally {
          isScraping = false;
          updateScrapButton(shadow);
          setTimeout(() => {
            scrapButton.textContent = SCRAP_RESULTS_LABEL;
          }, 2500);
        }
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
      shadow.querySelector(".rival-list").addEventListener("change", async (event) => {
        const box = event.target.closest("input[data-player]");
        if (!box) return;
        try {
          const hidden = new Set((await loadPreferences()).hiddenRivals);
          if (box.checked) hidden.delete(box.dataset.player);
          else hidden.add(box.dataset.player);
          await savePreferences({ hiddenRivals: [...hidden] });
          await render();
        } catch (error) {
          console.error("[piuscores] Unable to save rival selection", error);
        }
      });
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
    function chartRows(chart, myName) {
      const list = [...chart.rivals];
      if (chart.mine !== null) list.push({ player: "You", score: chart.mine, me: true });
      list.sort((a, b) => b.score - a.score || (b.me ? 1 : 0) - (a.me ? 1 : 0));
      return list.map((rival, i) => {
        const head = i === 0 ? `<td class="track" rowspan="${list.length}" title="${esc(chart.track)}">${esc(chart.track)}</td>
           <td rowspan="${list.length}"><b>${esc(chart.chart)}</b></td>` : "";
        const tr = i === 0 ? '<tr class="group alt">' : i % 2 === 0 ? '<tr class="alt">' : "<tr>";
        if (rival.me) {
          return `${tr}${head}<td class="sm mine" title="${esc(myName)}">${esc(displayName(myName))}</td><td class="sm num score mine">${fmtScore(rival.score)}</td><td class="sm"></td></tr>`;
        }
        const won = rival.delta !== null && rival.delta > 0 ? " won" : " ahead";
        const playerId = rival.playerId;
        const name = playerId ? `<a class="player-link" href="https://piuscores.arroweclip.se/Player/${encodeURIComponent(playerId)}/Sessions">${esc(displayName(rival.player))}</a>` : esc(displayName(rival.player));
        return `${tr}${head}<td class="sm${won}" title="${esc(rival.player)}">${name}</td><td class="sm num score${won}">${fmtScore(rival.score)}</td><td class="sm num${won}">${fmtDelta(rival.delta)}</td></tr>`;
      });
    }
    function renderTitle(shadow, me, totals) {
      const title = me?.name ? `Rivals for ${displayName(me.name)}` : "Rivals";
      shadow.querySelector(".dlg-head h2").innerHTML = `${esc(title)}<span class="head-stats"> \u2014 ${stat("neg", totals.lose)} losses, ${stat("blue", totals.unplayed)} np, ${stat("pos", totals.win)} wins</span>`;
    }
    function renderRivalList(shadow, charts, players, ownPlayerId, hidden) {
      const rivalStats = {};
      for (const chart of charts) {
        for (const rival of chart.rivals) {
          const counts = rivalStats[rival.playerId] ||= { lose: 0, win: 0, unplayed: 0 };
          counts[rival.delta === null ? "unplayed" : rival.delta < 0 ? "lose" : "win"]++;
        }
      }
      const ids = new Set(Object.keys(players));
      for (const chart of charts) for (const rival of chart.rivals) ids.add(rival.playerId);
      if (ownPlayerId) ids.add(ownPlayerId);
      const rivals = [...ids].map((playerId) => ({
        playerId,
        name: displayName(players[playerId]?.name || playerId),
        pumbility: typeof players[playerId]?.pumbility === "number" ? players[playerId].pumbility : null
      }));
      rivals.sort((a, b) => (b.pumbility ?? -1) - (a.pumbility ?? -1) || a.name.localeCompare(b.name, void 0, { sensitivity: "base" }));
      const list = shadow.querySelector(".rival-list");
      list.innerHTML = rivals.length ? rivals.map(({ playerId, name, pumbility }) => {
        const me = playerId === ownPlayerId;
        const on = me || !hidden.has(playerId);
        const base = `https://piuscores.arroweclip.se/Player/${encodeURIComponent(playerId)}`;
        const toggle = me ? '<span class="rival-spacer"></span>' : `<input type="checkbox" data-player="${esc(playerId)}"${on ? " checked" : ""}>`;
        return `<div class="rival${on ? "" : " off"}${me ? " me" : ""}"><label class="rival-toggle" title="${esc(name)}">${toggle}<span class="rival-name">${esc(name)}</span><span class="rival-pum">${fmt(pumbility)}</span></label><div class="rival-links"><a class="rival-link" href="${base}">${me ? "My page" : "Rival"}</a><a class="rival-link" href="${base}/Sessions">Sessions</a>` + (me ? "" : `<span class="rival-stats" title="charts: losing / not played / best">${statLine(rivalStats[playerId] || { lose: 0, win: 0, unplayed: 0 })}</span>`) + "</div></div>";
      }).join("") : '<div class="muted">No rivals yet</div>';
    }
    async function render() {
      const shadow = ensure();
      const [allCharts, { players, ownPlayerId }, { hiddenRivals }] = await Promise.all([loadCharts(), loadPlayers(), loadPreferences()]);
      const hidden = new Set(hiddenRivals);
      renderRivalList(shadow, allCharts, players, ownPlayerId, hidden);
      const charts = allCharts.map((chart) => withRivals(chart, (rival) => !hidden.has(rival.playerId))).filter(Boolean);
      const levels = [...new Set(charts.map((chart) => chart.chart))].sort(compareLevels);
      if (!levels.includes(selectedLevel)) {
        selectedLevel = levels[0] ?? null;
        saveUiState();
      }
      const stats = {};
      const totals = { lose: 0, win: 0, unplayed: 0 };
      const statsFor = (key) => stats[key] ||= { lose: 0, win: 0, unplayed: 0 };
      for (const chart of charts) {
        const statKey = { "rivals-win": "lose", "not-played": "unplayed", "you-win": "win" }[chartTier(chart)];
        statsFor(chart.chart)[statKey]++;
        totals[statKey]++;
      }
      renderTitle(shadow, players[ownPlayerId], totals);
      const chip = (label) => {
        const on = label === selectedLevel;
        const counts = statsFor(label);
        return `<button class="chip${on ? " on" : ""}" type="button" role="radio" aria-checked="${on}" data-level="${esc(label)}"><span>${esc(label)}</span><span class="chip-stats" title="charts: losing / not played / best">${statLine(counts)}</span></button>`;
      };
      const types = [...new Set(levels.map(levelType))];
      const levelNums = levels.map(levelNum);
      const minNum = Math.min(...levelNums), maxNum = Math.max(...levelNums);
      const nums = levels.length ? Array.from({ length: maxNum - minNum + 1 }, (_, i) => minNum + i) : [];
      const cell = (type, num) => {
        const level = levels.find((l) => levelType(l) === type && levelNum(l) === num);
        return level ? chip(level) : '<span class="chip placeholder" aria-hidden="true"><span>&nbsp;</span><span class="chip-stats">&nbsp;</span></span>';
      };
      shadow.querySelector(".filters").innerHTML = `<div class="filter-grid" role="radiogroup" style="grid-template-columns: repeat(${types.length}, auto)">${nums.map((num) => types.map((type) => cell(type, num)).join("")).join("")}</div>`;
      const levelCharts = charts.filter((chart) => chart.chart === selectedLevel);
      const tabCounts = Object.fromEntries(TABS.map(({ id }) => [
        id,
        levelCharts.filter((chart) => chartTier(chart) === id).length
      ]));
      shadow.querySelector(".tabs").innerHTML = TABS.map(({ id, label }) => `<button class="tab" type="button" role="tab" aria-selected="${id === selectedTab}" data-tab="${id}">${label}<span class="tab-count ${id}">${tabCounts[id]}</span></button>`).join("");
      const visible = levelCharts.filter((chart) => chartTier(chart) === selectedTab);
      const byRivalCount = (a, b) => b.rivals.length - a.rivals.length || a.track.localeCompare(b.track);
      visible.sort({ "you-win": byLeadWeight, "not-played": byRivalCount }[selectedTab] || byTargetWeight);
      const body = shadow.querySelector(".dlg-body");
      if (visible.length === 0) {
        const message = allCharts.length === 0 ? "No saved rival scores yet \u2014 open a rival's page to collect them." : charts.length === 0 ? "No charts for the selected rivals \u2014 check some rivals on the left." : `No ${TABS.find(({ id }) => id === selectedTab).label.toLowerCase()} charts at this level.`;
        body.innerHTML = `<div class="empty">${message}</div>`;
        return;
      }
      const myName = players[ownPlayerId]?.name || "You";
      const rows = visible.flatMap((chart, i) => i === 0 ? chartRows(chart, myName) : ['<tr class="gap"><td colspan="5"></td></tr>', ...chartRows(chart, myName)]);
      body.innerHTML = `<table>
      <thead><tr><th class="track">Track</th><th class="col-chart">Chart</th><th class="col-player">Player</th><th class="num col-score">Score</th><th class="num col-diff">Diff</th></tr></thead>
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

  // src/export_targets.js
  var fmt2 = (n) => n === null || n === void 0 ? "\u2014" : n.toLocaleString("en-US");
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
      const scoreW = Math.max(...entries.map((r) => fmt2(r.score).length));
      const diffW = Math.max(0, ...entries.filter((r) => r.difference !== null).map((r) => fmt2(r.difference).length));
      for (const r of entries) {
        const note = (r.difference === null ? "\u2014" : fmt2(r.difference)).padStart(diffW);
        lines.push(`  ${(r.rival + ":").padEnd(nameW)}  ${fmt2(r.score).padStart(scoreW)}  ${note}`);
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

  // src/ui/toasts.js
  var MAX_LINES = 8;
  var TOAST_MS = 5e3;
  var fmt3 = (n) => n === null || n === void 0 ? "\u2014" : n.toLocaleString("en-US");
  var fmtDelta2 = (n) => {
    if (n === null || n === void 0) return "<span>\u2014</span>";
    const cls = n > 0 ? "pos" : n < 0 ? "neg" : "";
    return `<span class="${cls}">${n > 0 ? "+" : ""}${fmt3(n)}</span>`;
  };
  var fmtScore2 = (score, prev) => prev === null || prev === score ? fmt3(score) : `${fmt3(prev)} \u2192 ${fmt3(score)}`;
  var esc2 = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function eventLines(event) {
    const name = `${esc2(event.track)} <b>${esc2(event.chart)}</b>`;
    const badge = event.change === "new" ? '<span class="new">NEW</span>' : '<span class="upd">UPD</span>';
    if (event.kind === "rival") {
      return [`${badge} ${name} ${esc2(displayName(event.player))}: ${fmtScore2(event.score, event.prevScore)} (${fmtDelta2(event.delta)})`];
    }
    return [
      `${badge} ${name} You: ${fmtScore2(event.score, event.prevScore)}`,
      ...event.deltas.map((d) => `<span class="sub">${esc2(displayName(d.player))}: ${fmt3(d.score)} (${fmtDelta2(d.delta)})</span>`)
    ];
  }
  function pushToast(shadow, toast) {
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
  function showToast(shadow, rival, events) {
    const toast = document.createElement("div");
    toast.className = "toast";
    const all = events.flatMap(eventLines);
    const lines = all.slice(0, MAX_LINES).map((line) => `<div class="line">${line}</div>`).join("");
    const more = all.length > MAX_LINES ? `<div class="more">\u2026and ${all.length - MAX_LINES} more line(s) (see console)</div>` : "";
    toast.innerHTML = `<div class="title">${esc2(rival)}: ${events.length} change(s)</div>${lines}${more}`;
    pushToast(shadow, toast);
  }
  function showSessionToast(shadow, player, title, timestamp, scannedResults) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<div class="title">${esc2(displayName(player))}: parsed new session</div><div class="line">${esc2(title)}</div><div class="line">${esc2(timestamp)}</div><div class="line">Scanned ${fmt3(scannedResults)} results</div>`;
    pushToast(shadow, toast);
  }
  function showPumbilityToast(shadow, player, pumbility, prevPumbility) {
    const toast = document.createElement("div");
    toast.className = "toast";
    const change = prevPumbility === null ? '<span class="new">NEW</span>' : fmtDelta2(pumbility - prevPumbility);
    toast.innerHTML = `<div class="title">${esc2(displayName(player))}: PUMBILITY</div><div class="line">${fmtScore2(pumbility, prevPumbility)} (${change})</div>`;
    pushToast(shadow, toast);
  }

  // src/page_scrappers/common.js
  var TAG = "[piuscores]";
  var text = (el) => el ? el.textContent.trim() : "";
  var parseNumber = (value) => {
    const digits = value.replace(/[^\d]/g, "");
    return digits ? Number(digits) : null;
  };
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
  var GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var knownOwnPlayerId = null;
  function accountUsername() {
    return text(document.querySelector(".shell-menu-caption")).match(/^(.+?)\s*\(/)?.[1] ?? null;
  }
  function pagePlayerId() {
    const segment = location.pathname.match(/^\/Player\/([^/]+)(?:\/|$)/)?.[1];
    if (!segment) return null;
    const id = decodeURIComponent(segment);
    if (GUID_RE.test(id)) return id;
    const username = accountUsername();
    return username && id.toLowerCase() === username.toLowerCase() ? knownOwnPlayerId : null;
  }
  async function mergeOwnAlias(ownPlayerId) {
    const alias = accountUsername();
    if (!ownPlayerId || !alias) return;
    const { players, results, preferences } = await chrome.storage.local.get(["players", "results", "preferences"]);
    const updates = {};
    if (players?.[alias]) {
      const { [alias]: aliasInfo, ...rest } = players;
      updates.players = { ...rest, [ownPlayerId]: { ...aliasInfo, ...rest[ownPlayerId] } };
    }
    let resultsChanged = false;
    const merged = { ...results || {} };
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
  async function syncOwnPlayerId() {
    const scrapedId = findOwnPlayerId();
    const { ownPlayerId } = await chrome.storage.local.get("ownPlayerId");
    if (scrapedId && scrapedId !== ownPlayerId) {
      await chrome.storage.local.set({ ownPlayerId: scrapedId });
    }
    const id = scrapedId || (typeof ownPlayerId === "string" ? ownPlayerId : null);
    if (id && id !== knownOwnPlayerId) {
      knownOwnPlayerId = id;
      await mergeOwnAlias(id);
    }
    return id;
  }
  function saveHigherScore(scores, playerId, score) {
    if (!playerId || score === null || score <= (scores[playerId] ?? -1)) return null;
    const prevScore = scores[playerId] ?? null;
    scores[playerId] = score;
    return { prevScore, change: prevScore === null ? "new" : "upd" };
  }
  var lastPumbilityLog = null;
  function logPumbility(message) {
    if (message === lastPumbilityLog) return;
    lastPumbilityLog = message;
    console.log(`${TAG} PUMBILITY ${message}`);
  }
  async function savePlayerInfo(ui2, playerId, name, pumbility, ownPlayerId, source) {
    if (!name && pumbility === null) return;
    const { players } = await chrome.storage.local.get("players");
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
    await chrome.storage.local.set({ players: { ...players || {}, [playerId]: player } });
    if (raised) {
      const label = playerId === ownPlayerId ? "You" : player.name || playerId;
      showPumbilityToast(ui2.ensure(), label, pumbility, prevPumbility);
    }
  }
  function waitForChange(predicate, description, timeoutMs = 1e4) {
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

  // src/page_scrappers/profile.js
  function profilePlayerId() {
    return /^\/Player\/[^/]+\/?$/.test(location.pathname) ? pagePlayerId() : null;
  }
  function addSessionsButton(playerId) {
    const block = document.querySelector('[data-testid="player-hero"] .ph-pum');
    if (!block || block.querySelector(".piuscores-sessions-btn")) return;
    const link = document.createElement("a");
    link.className = "piuscores-sessions-btn";
    link.href = `/Player/${playerId}/Sessions`;
    link.textContent = "Sessions \u2192";
    link.title = "Open this player's Sessions page";
    link.style.cssText = "align-self:flex-start;margin-left:auto;padding:2px 8px;border:1px solid #4FE33F;border-radius:4px;color:#4FE33F;font:500 12px/1.4 Roboto,Arial,sans-serif;text-decoration:none;white-space:nowrap;";
    block.appendChild(link);
  }
  async function runProfilePage(ui2, ownPlayerId) {
    const playerId = profilePlayerId();
    if (!playerId) return;
    addSessionsButton(playerId);
    const hero = document.querySelector('[data-testid="player-hero"]');
    await savePlayerInfo(
      ui2,
      playerId,
      text(hero?.querySelector("h5")),
      parseNumber(text(hero?.querySelector(".ph-pum .cmp-hero-num"))),
      ownPlayerId,
      "profile page"
    );
  }

  // src/page_scrappers/rival_compare.js
  var lastSignature = null;
  function playerDisplayName(players, playerId) {
    return players[playerId]?.name || playerId;
  }
  function parseScore(cell) {
    const p = cell && cell.querySelector(".rvl-cmp-score p");
    if (!p) return null;
    const n = parseInt(p.textContent.replace(/[^\d]/g, ""), 10);
    return Number.isNaN(n) ? null : n;
  }
  function scrape() {
    const playerId = pagePlayerId();
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
  async function runRivalCompare(ui2, ownPlayerId) {
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
    showToast(ui2.ensure(), player, events);
  }

  // src/page_scrappers/sessions.js
  var lastSignature2 = null;
  var isScrapingSessions = false;
  async function syncSessionsPumbility(ui2, ownPlayerId) {
    const playerId = sessionPagePlayerId();
    if (!playerId) return;
    const pumbility = parseNumber(text(document.querySelector(
      '[data-testid="session-ceremony"] .sbd-pumb-big'
    )));
    if (pumbility === null) return;
    const newest = document.querySelector('[data-testid="session-card"]');
    if (!newest?.classList.contains("sbd-card-now") || findPageButton("newer")) {
      logPumbility(`found ${pumbility} for ${playerName() || playerId} (${playerId}) on Sessions page: not the newest session, ignoring`);
      return;
    }
    await savePlayerInfo(ui2, playerId, playerName(), pumbility, ownPlayerId, "Sessions page");
  }
  function playerName() {
    return text(document.querySelector("main h5")).replace(/\s+[—–-]\s+Sessions$/i, "").trim();
  }
  function parseSessionScore(element) {
    const p = element?.querySelector('[data-testid="peer-score"] p');
    if (!p) return null;
    const n = parseInt(p.textContent.replace(/[^\d]/g, ""), 10);
    return Number.isNaN(n) ? null : n;
  }
  function isPhoenix2Chart(element) {
    return /\/difficulty\/Phoenix2\//i.test(element?.getAttribute("src") || "");
  }
  function scrapeSessionScores() {
    const highlights = document.querySelector('[data-testid="session-highlight-cards"]');
    const allPlays = document.querySelector('[data-testid="session-all-plays"]');
    if (!highlights && !allPlays) return null;
    const mix = text(document.querySelector('[data-testid="session-hero"] .sbd-hero-when')).split("\xB7")[0].trim();
    if (mix !== "Phoenix 2") return null;
    const rowsByChart = /* @__PURE__ */ new Map();
    const addScore = (track, chart, score) => {
      if (!track || !isScrapLevel(chart) || score === null) return;
      const row = { track, chart, score };
      const key = storageKey(row);
      if (score > (rowsByChart.get(key)?.score ?? -1)) rowsByChart.set(key, row);
    };
    for (const card of highlights?.querySelectorAll('[data-testid="session-highlight-card"]') || []) {
      const difficulty = card.querySelector("img.difficulty-bubble");
      if (!isPhoenix2Chart(difficulty)) continue;
      addScore(
        text(card.querySelector(".hl-card-song")),
        difficulty.getAttribute("alt") || "",
        parseSessionScore(card)
      );
    }
    const playRows = [...allPlays?.querySelectorAll('[data-testid="session-score-row"]') || []];
    for (const row of playRows) {
      const difficulty = row.querySelector("img.difficulty-bubble");
      if (!isPhoenix2Chart(difficulty)) continue;
      addScore(
        text(row.querySelector('[data-testid="session-row-chart"]')),
        difficulty.getAttribute("alt") || "",
        parseSessionScore(row)
      );
    }
    return {
      playerId: pagePlayerId(),
      rows: [...rowsByChart.values()],
      scannedResults: playRows.length
    };
  }
  function sessionPagePlayerId() {
    return isSessionsPage() ? pagePlayerId() : null;
  }
  function getSessionCards() {
    return [...document.querySelectorAll('[data-testid="session-card"]')];
  }
  function getSessionCardMix(card) {
    const meta = text(card.querySelector(".sbd-card-meta")).replace(/\s+/g, " ");
    if (/^Phoenix 2(?:\s|$)/i.test(meta)) return "Phoenix 2";
    if (/^Phoenix(?:\s|$)/i.test(meta)) return "Phoenix";
    return null;
  }
  function getSessionCardInfo(card) {
    if (getSessionCardMix(card) !== "Phoenix 2") return null;
    const meta = text(card.querySelector(".sbd-card-meta")).replace(/\s+/g, " ");
    const title = meta.replace(/^Phoenix 2\s*(?:·|-)?\s*/i, "").trim();
    const timestamp = text(card.querySelector(".sbd-card-when")).replace(/\s+/g, " ");
    if (!title || !timestamp) return null;
    return { title, timestamp };
  }
  function currentPhoenix2Sessions() {
    const sessions = [];
    for (const card of getSessionCards()) {
      const mix = getSessionCardMix(card);
      if (mix === "Phoenix") return { sessions, reachedPhoenix: true };
      if (mix !== "Phoenix 2") continue;
      const info = getSessionCardInfo(card);
      if (info) sessions.push({ card, info });
    }
    return { sessions, reachedPhoenix: false };
  }
  function sessionCardSignature() {
    return JSON.stringify(getSessionCards().map((card) => getSessionCardInfo(card) || text(card)));
  }
  function sessionCheckpointMatches(checkpoint, info) {
    return checkpoint?.title === info.title && checkpoint?.timestamp === info.timestamp;
  }
  function findPageButton(direction) {
    const main = document.querySelector("main") || document;
    const controls = [...main.querySelectorAll(
      '.mud-pagination button, [aria-label*="page" i] button, button[aria-label*="page" i]'
    )];
    const candidates = controls.length ? controls : [...main.querySelectorAll('button, a[role="button"]')];
    const label = (button) => [
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      text(button)
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase();
    const patterns = {
      older: /\bolder\b|\bnext page\b|^next$/,
      newer: /\bnewer\b|\bprevious page\b|^previous$/
    };
    return candidates.find((button) => {
      const value = label(button);
      return patterns[direction].test(value) && !button.disabled && button.getAttribute("aria-disabled") !== "true";
    }) || null;
  }
  function sameSessionDate(cardTimestamp, heroTimestamp) {
    const cardDate = cardTimestamp.match(/\b(\d{1,2})\s+([A-Za-z]{3})\s*·\s*(\d{1,2}:\d{2}\s*[AP]M)\b/i);
    const heroDate = heroTimestamp.match(/\b(\d{1,2})\/(\d{1,2})\/\d{4}\s+(\d{1,2}:\d{2}\s*[AP]M)\b/i);
    if (!cardDate || !heroDate) return false;
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return Number(cardDate[1]) === Number(heroDate[2]) && months.indexOf(cardDate[2].toLowerCase()) + 1 === Number(heroDate[1]) && cardDate[3].replace(/\s+/g, "").toLowerCase() === heroDate[3].replace(/\s+/g, "").toLowerCase();
  }
  async function clickPageButton(button, direction) {
    if (!button) return false;
    const before = sessionCardSignature();
    button.click();
    await waitForChange(() => sessionCardSignature() !== before, `${direction} Sessions page`);
    return true;
  }
  async function saveSessionCheckpoint(playerId, info) {
    const stored = await chrome.storage.local.get(["players"]);
    const players = { ...stored.players || {} };
    players[playerId] = {
      ...players[playerId],
      lastScrapedSession: info
    };
    const name = playerName();
    if (name) players[playerId].name = name;
    await chrome.storage.local.set({ players });
  }
  async function parseSessionCard(ui2, card, info, playerId, report, progress) {
    card.click();
    await waitForChange(() => {
      const hero = document.querySelector('[data-testid="session-hero"]');
      const heroWhen = text(hero?.querySelector(".sbd-hero-when"));
      const heroTitle = text(hero?.querySelector(".sbd-hero-title"));
      const cardTitle = info.title.split("\xB7")[0].trim();
      return heroWhen.split("\xB7")[0].trim() === "Phoenix 2" && heroTitle === cardTitle && sameSessionDate(info.timestamp, heroWhen) && !!document.querySelector('[data-testid="session-all-plays"]');
    }, `session "${info.title}" to open`);
    const showAll = document.querySelector('[data-testid="session-show-all-plays"]');
    if (showAll) {
      showAll.click();
      await waitForChange(
        () => {
          if (!document.querySelector('[data-testid="session-show-all-plays"]')) return true;
          const tally = [...document.querySelectorAll('[data-testid="session-hero"] .sbd-tally > div')].find((item) => text(item.querySelector(".sbd-tally-k")) === "Plays");
          const total = parseInt(text(tally?.querySelector(".sbd-tally-v")).replace(/[^\d]/g, ""), 10);
          return Number.isFinite(total) && document.querySelectorAll('[data-testid="session-score-row"]').length >= total;
        },
        `all plays for "${info.title}" to load`
      );
    }
    const result = scrapeSessionScores();
    if (!result) throw new Error(`Unable to parse Phoenix 2 session "${info.title}"`);
    if (result.playerId !== playerId) throw new Error("Session player changed while scraping");
    await runSessionScores(ui2, result, await syncOwnPlayerId());
    await saveSessionCheckpoint(playerId, info);
    progress.count++;
    report(`Scraped ${progress.count}: ${info.title} (${info.timestamp})`);
    showSessionToast(
      ui2.ensure(),
      playerName() || playerId,
      info.title,
      info.timestamp,
      result.scannedResults
    );
  }
  function currentPhoenix2SessionCards() {
    return currentPhoenix2Sessions().sessions;
  }
  function findCurrentCard(info) {
    return currentPhoenix2SessionCards().find((item) => sessionCheckpointMatches(info, item.info))?.card || null;
  }
  async function scrapePlayerSessions(ui2, report = () => {
  }) {
    const playerId = sessionPagePlayerId();
    if (!playerId) throw new Error("Scrap results is only available on a player Sessions page");
    if (isScrapingSessions) return;
    isScrapingSessions = true;
    try {
      const stored = await chrome.storage.local.get(["players"]);
      const checkpoint = stored.players?.[playerId]?.lastScrapedSession || null;
      const pages = [];
      const seenPages = /* @__PURE__ */ new Set();
      let checkpointFound = !checkpoint;
      let reachedPhoenixBoundary = false;
      if (!checkpoint) {
        let signature = sessionCardSignature();
        while (!seenPages.has(signature)) {
          seenPages.add(signature);
          const page = currentPhoenix2Sessions();
          pages.push(page.sessions.map(({ info }) => info));
          if (page.reachedPhoenix) break;
          const next = findPageButton("older");
          if (!next) break;
          await clickPageButton(next, "older");
          signature = sessionCardSignature();
        }
      } else {
        let signature = sessionCardSignature();
        while (!seenPages.has(signature)) {
          seenPages.add(signature);
          const page = [];
          const currentPage = currentPhoenix2Sessions();
          for (const { info } of currentPage.sessions) {
            if (sessionCheckpointMatches(checkpoint, info)) {
              checkpointFound = true;
              break;
            }
            page.push(info);
          }
          pages.push(page);
          if (checkpointFound || currentPage.reachedPhoenix) {
            reachedPhoenixBoundary = currentPage.reachedPhoenix;
            break;
          }
          const next = findPageButton("older");
          if (!next) break;
          await clickPageButton(next, "older");
          signature = sessionCardSignature();
        }
      }
      if (checkpoint && !checkpointFound && !reachedPhoenixBoundary) {
        throw new Error("Saved session checkpoint was not found in the Sessions history");
      }
      const progress = { count: 0 };
      for (let pageIndex = pages.length - 1; pageIndex >= 0; pageIndex--) {
        for (const info of [...pages[pageIndex]].reverse()) {
          const card = findCurrentCard(info);
          if (!card) throw new Error(`Session "${info.title}" is no longer visible on its page`);
          report(`Opening ${info.title} (${info.timestamp})`);
          await parseSessionCard(ui2, card, info, playerId, report, progress);
        }
        if (pageIndex > 0) {
          const newer = findPageButton("newer");
          if (!newer) throw new Error("Unable to return to newer Sessions pages");
          await clickPageButton(newer, "newer");
        }
      }
      report(`Scraping complete: ${progress.count} Phoenix 2 session(s)`);
    } finally {
      isScrapingSessions = false;
    }
  }
  async function runSessionScores(ui2, result, ownPlayerId) {
    const signature = JSON.stringify({ sessions: result, ownPlayerId });
    if (signature === lastSignature2) return;
    lastSignature2 = signature;
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
    showToast(ui2.ensure(), player, events);
  }
  function isSessionsPage() {
    return /^\/Player\/[^/]+\/Sessions\/?$/.test(location.pathname);
  }
  function isSessionsContentLoaded() {
    return isSessionsPage() && getSessionCards().length > 0;
  }
  async function runSessionsPage(ui2, ownPlayerId) {
    await syncSessionsPumbility(ui2, ownPlayerId);
    const result = scrapeSessionScores();
    if (result) await runSessionScores(ui2, result, ownPlayerId);
  }

  // src/content.js
  var ui = createScoresUI(
    exportTargets,
    (report) => scrapePlayerSessions(ui, report),
    isSessionsContentLoaded
  );
  var timer = null;
  async function ensureStorageVersion() {
    const { storageVersion } = await chrome.storage.local.get("storageVersion");
    if (storageVersion === void 0) {
      await chrome.storage.local.set({ storageVersion: STORAGE_VERSION });
    } else if (storageVersion !== STORAGE_VERSION) {
      console.warn(`${TAG} Stored data version ${storageVersion} differs from supported version ${STORAGE_VERSION}`);
    }
  }
  async function run() {
    await ensureStorageVersion();
    const ownPlayerId = await syncOwnPlayerId();
    if (isSessionsPage()) {
      await runSessionsPage(ui, ownPlayerId);
      return;
    }
    await runProfilePage(ui, ownPlayerId);
    await runRivalCompare(ui, ownPlayerId);
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
