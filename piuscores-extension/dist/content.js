(() => {
  // src/storage.js
  var STORAGE_VERSION = 2;
  var MIN_SCRAPE_LEVEL = 10;
  var MIN_SCORE_CAP = 995e3;
  var MAX_SCORE_CAP = 1e6;
  var SCORE_CAP_STEP = 1e3;
  var TRY_COOLDOWN_OPTIONS = [0, 1, 2, 3, 5, 8, 13, 21, 34];
  var MIN_NP_RIVALS = 1;
  var MAX_NP_RIVALS = 5;
  var COUNT_BY_OPTIONS = ["results", "charts"];
  var displayName = (name) => name.replace(/\s*#\d{4}$/, "");
  var storageKey = (row) => `${row.track}|${row.chart}`;
  function isKnownPlayer(players, playerId, ownPlayerId) {
    return playerId === ownPlayerId || !!players?.[playerId];
  }
  var isScrapLevel = (chart) => {
    const level = chart.match(/\d+/);
    return level !== null && Number(level[0]) >= MIN_SCRAPE_LEVEL;
  };
  var delta = (mine, theirs, cap = MAX_SCORE_CAP) => mine === null || mine === void 0 || theirs === null ? null : Math.min(mine, cap) - Math.min(theirs, cap);
  var targetWeight = (diffs) => diffs.reduce((acc, d) => acc + (d !== null && d < 0 ? Math.sqrt(-d) : 0), 0);
  var byTargetWeight = (a, b) => b.weight - a.weight || Number(b.unplayed) - Number(a.unplayed) || a.track.localeCompare(b.track);
  var leadWeight = (chart) => chart.rivals.reduce((acc, rival) => acc + (rival.delta !== null && rival.delta > 0 ? Math.sqrt(rival.delta) : 0), 0);
  var byLeadWeight = (a, b) => leadWeight(b) - leadWeight(a) || a.track.localeCompare(b.track);
  async function migrateStorage() {
    const { storageVersion, results } = await chrome.storage.local.get(["storageVersion", "results"]);
    const version = storageVersion ?? (results ? 1 : STORAGE_VERSION);
    if (version === STORAGE_VERSION) {
      if (storageVersion === void 0)
        await chrome.storage.local.set({ storageVersion: STORAGE_VERSION });
      return;
    }
    if (version > STORAGE_VERSION) {
      console.warn(`[piuscores] Stored data version ${version} is newer than supported version ${STORAGE_VERSION}`);
      return;
    }
    const updates = { storageVersion: STORAGE_VERSION };
    if (version < 2 && results) {
      updates.results = Object.fromEntries(Object.entries(results).map(([key, scores]) => [
        key,
        Object.fromEntries(Object.entries(scores || {}).map(([playerId, score]) => [playerId, typeof score === "number" ? { bestScore: score } : score]))
      ]));
    }
    await chrome.storage.local.set(updates);
    console.log(`[piuscores] Migrated stored data from version ${version} to ${STORAGE_VERSION}`);
  }
  async function loadCharts() {
    const all = await chrome.storage.local.get(null);
    const players = all.players && typeof all.players === "object" ? all.players : {};
    const playerName = (playerId) => {
      const player = players[playerId];
      if (player && typeof player === "object" && typeof player.name === "string")
        return player.name;
      return playerId;
    };
    const ownPlayerId = typeof all.ownPlayerId === "string" ? all.ownPlayerId : null;
    const results = all.results && typeof all.results === "object" ? all.results : {};
    const { scoreCap } = parsePreferences(all.preferences);
    const charts = [];
    for (const [key, rawScores] of Object.entries(results)) {
      if (!rawScores || typeof rawScores !== "object")
        continue;
      const [track, chart] = key.split(/\|(?=[^|]*$)/);
      const scores = rawScores;
      const myRecord = ownPlayerId ? scores[ownPlayerId] : null;
      const mine = myRecord?.bestScore ?? null;
      const rivals = [
        ...Object.entries(scores).filter(([playerId]) => playerId !== ownPlayerId).map(([playerId, { bestScore: score, bestScoreDate, lastTryDate }]) => ({
          player: playerName(playerId),
          playerId,
          score,
          bestScoreDate,
          lastTryDate,
          delta: delta(mine, score, scoreCap),
          // Uncapped difference, for display only.
          realDelta: delta(mine, score)
        }))
      ].sort((a, b) => b.score - a.score);
      if (rivals.length) {
        charts.push({
          track,
          chart,
          mine,
          myDates: { bestScoreDate: myRecord?.bestScoreDate, lastTryDate: myRecord?.lastTryDate },
          rivals,
          unplayed: mine === null,
          weight: targetWeight(rivals.map((r) => r.delta))
        });
      }
    }
    return charts;
  }
  async function loadPlayers() {
    const { players, ownPlayerId, results } = await chrome.storage.local.get(["players", "ownPlayerId", "results"]);
    const bestCounts = {};
    for (const scores of Object.values(results && typeof results === "object" ? results : {})) {
      for (const playerId of Object.keys(scores || {}))
        bestCounts[playerId] = (bestCounts[playerId] || 0) + 1;
    }
    return {
      players: players && typeof players === "object" ? players : {},
      ownPlayerId: typeof ownPlayerId === "string" ? ownPlayerId : null,
      bestCounts
    };
  }
  var clampTryCooldown = (days) => TRY_COOLDOWN_OPTIONS.findLast((option) => option <= days) ?? 0;
  function stepTryCooldown(days, step) {
    const index = TRY_COOLDOWN_OPTIONS.indexOf(clampTryCooldown(days)) + step;
    return TRY_COOLDOWN_OPTIONS[Math.min(TRY_COOLDOWN_OPTIONS.length - 1, Math.max(0, index))];
  }
  function daysSince(date) {
    if (!date)
      return null;
    const now = /* @__PURE__ */ new Date();
    return Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.parse(`${date}T00:00:00Z`)) / 864e5);
  }
  var clampNpMinimalRivals = (count) => Math.min(MAX_NP_RIVALS, Math.max(MIN_NP_RIVALS, Math.round(count)));
  var clampScoreCap = (cap) => Math.min(MAX_SCORE_CAP, Math.max(MIN_SCORE_CAP, Math.round(cap / SCORE_CAP_STEP) * SCORE_CAP_STEP));
  function parsePreferences(preferences) {
    const prefs = preferences && typeof preferences === "object" ? preferences : {};
    return {
      hiddenRivals: Array.isArray(prefs.hiddenRivals) ? prefs.hiddenRivals : [],
      scoreCap: typeof prefs.scoreCap === "number" ? clampScoreCap(prefs.scoreCap) : MAX_SCORE_CAP,
      // Preferences saved before the rename keep their days under `retryCooldown`.
      tryCooldown: clampTryCooldown(prefs.tryCooldown ?? prefs.retryCooldown ?? 0),
      npMinimalRivals: typeof prefs.npMinimalRivals === "number" ? clampNpMinimalRivals(prefs.npMinimalRivals) : MIN_NP_RIVALS,
      countBy: COUNT_BY_OPTIONS.includes(prefs.countBy) ? prefs.countBy : COUNT_BY_OPTIONS[0]
    };
  }
  async function loadPreferences() {
    const { preferences } = await chrome.storage.local.get("preferences");
    return parsePreferences(preferences);
  }
  async function savePreferences(changes) {
    const { preferences } = await chrome.storage.local.get("preferences");
    await chrome.storage.local.set({ preferences: { ...preferences || {}, ...changes } });
  }
  function withRivalsOrNull(chart, keep) {
    const rivals = chart.rivals.filter(keep);
    if (rivals.length === chart.rivals.length)
      return chart;
    if (!rivals.length)
      return null;
    return { ...chart, rivals, weight: targetWeight(rivals.map((r) => r.delta)) };
  }
  async function deletePlayer(playerId) {
    const { players, results, preferences, ownPlayerId } = await chrome.storage.local.get(["players", "results", "preferences", "ownPlayerId"]);
    const { [playerId]: removed, ...restPlayers } = players || {};
    if (playerId === ownPlayerId && removed) {
      const { lastScrapedSession, scrapStats, ...record } = removed;
      restPlayers[playerId] = record;
    }
    const restResults = {};
    for (const [key, scores] of Object.entries(results || {})) {
      const { [playerId]: __, ...rest } = scores || {};
      if (Object.keys(rest).length)
        restResults[key] = rest;
    }
    const updates = { players: restPlayers, results: restResults };
    if (preferences?.hiddenRivals?.includes(playerId)) {
      updates.preferences = { ...preferences, hiddenRivals: preferences.hiddenRivals.filter((id) => id !== playerId) };
    }
    await chrome.storage.local.set(updates);
  }

  // src/ui/rivals/common.js
  var fmt = (n) => n === null || n === void 0 ? "\u2014" : n.toLocaleString("en-US");
  var fmtScore = (n, tailClass = "tail") => {
    const text2 = fmt(n);
    const i = text2.lastIndexOf(",");
    return i === -1 ? text2 : `${text2.slice(0, i)}<span class="${tailClass}">${text2.slice(i)}</span>`;
  };
  var fmtDelta = (n, outcome = n, cap = null) => {
    if (n === null || n === void 0)
      return "<span>\u2014</span>";
    const tone = outcome || n;
    const capped = !outcome && n;
    const cls = (tone > 0 ? "pos" : tone < 0 ? "neg" : "") + (capped ? " muted" : "");
    const capText = cap === null ? "score cap" : `${cap / 1e3}k score cap`;
    const title = capped ? ` title="Both scores \u2265 ${capText}, so this counts as a tie"` : "";
    const sign = n > 0 ? "+" : n < 0 ? "-" : "";
    const digits = Math.abs(n) < 1e3 ? `<span class="tail-dim">${Math.abs(n)}</span>` : fmtScore(Math.abs(n), "tail-dim");
    return `<span class="${cls}"${title}>${sign}${digits}</span>`;
  };
  var esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var stat = (cls, n) => `<span class="${cls}${n === 0 ? " zero" : ""}">${n}</span>`;
  var STAT_WORDS = {
    results: { lose: "lost", unplayed: "non-matched", win: "won", hidden: "hidden" },
    charts: { lose: "inferior", unplayed: "not played", win: "superior", hidden: "hidden" }
  };
  var statWords = (counts, separator = ", ", words = STAT_WORDS.results) => `${stat("neg", counts.lose)} ${words.lose}${separator}${stat("blue", counts.unplayed)} ${words.unplayed}${separator}${stat("pos", counts.win)} ${words.win}`;
  var chartTier = (chart) => chart.weight > 0 ? "rivals-win" : chart.unplayed ? "not-played" : "you-win";
  var TABS = [
    { id: "rivals-win" },
    { id: "not-played" },
    { id: "you-win" },
    // Losses hidden by the try cooldown or the score cap; never a chartTier.
    { id: "hidden" }
  ];
  var TIER_STAT = { "rivals-win": "lose", "not-played": "unplayed", "you-win": "win", hidden: "hidden" };
  function tierCounts(charts) {
    const counts = { lose: 0, win: 0, unplayed: 0 };
    for (const chart of charts)
      counts[TIER_STAT[chartTier(chart)]]++;
    return counts;
  }
  function levelStats(charts, hiddenCharts) {
    const shownCounts = resultCounts(charts);
    const hiddenCounts = resultCounts(hiddenCharts, (rival) => rival.realDelta);
    return {
      charts: { ...tierCounts(charts), hidden: hiddenCharts.length },
      results: { lose: shownCounts.lose, unplayed: shownCounts.unplayed, win: shownCounts.win + hiddenCounts.win, hidden: hiddenCounts.lose }
    };
  }
  function resultCounts(charts, diff = (rival) => rival.delta) {
    const counts = { lose: 0, win: 0, unplayed: 0 };
    for (const chart of charts) {
      for (const rival of chart.rivals) {
        const d = diff(rival);
        if (d !== 0)
          counts[d === null ? "unplayed" : d < 0 ? "lose" : "win"]++;
      }
    }
    return counts;
  }

  // src/ui/rivals/chart_results_item.js
  var chartResultsItemStyles = `
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
  td.others { text-align: right; padding: 4px 6px 6px; }
  .show-others { background: none; color: #9AB3A3; opacity: .6; border: none; padding: 3px 12px;
                 font: 500 13px/1.4 Roboto, Arial, sans-serif; cursor: pointer; }
  .show-others:hover { color: #4FE33F; opacity: 1; }
`;
  var chartKey = (chart) => `${chart.track}|${chart.chart}`;
  var datesTitle = ({ bestScoreDate, lastTryDate }) => bestScoreDate && bestScoreDate === lastTryDate ? `Last try: ${lastTryDate}` : `Best score: ${bestScoreDate || "unknown"}
Last try: ${lastTryDate || "unknown"}`;
  var rowStart = (i) => i === 0 ? '<tr class="group alt">' : i % 2 === 0 ? '<tr class="alt">' : "<tr>";
  function chartResultsItem(chart, myName, { collapseWon, colorByRealDiff, scoreCap }) {
    const allRivals = [...chart.rivals];
    if (chart.mine !== null)
      allRivals.push({ player: "You", score: chart.mine, me: true, ...chart.myDates });
    allRivals.sort((a, b) => b.score - a.score || (b.me ? 1 : 0) - (a.me ? 1 : 0));
    const isWon = (rival) => !rival.me && rival.delta !== null && rival.delta > 0;
    const folded = collapseWon ? allRivals.filter(isWon).length : 0;
    const shownRivals = folded ? allRivals.filter((r) => !isWon(r)) : allRivals;
    const rowCount = shownRivals.length + (folded ? 1 : 0);
    const rows = shownRivals.map((rival, i) => {
      const head = i === 0 ? `<td class="track" rowspan="${rowCount}" title="${esc(chart.track)}">${esc(chart.track)}</td>
         <td rowspan="${rowCount}"><b>${esc(chart.chart)}</b></td>` : "";
      const tr = rowStart(i);
      if (rival.me) {
        return `${tr}${head}<td class="sm mine" title="${esc(myName)}">${esc(displayName(myName))}</td><td class="sm num score mine" title="${esc(datesTitle(rival))}">${fmtScore(rival.score)}</td><td class="sm"></td></tr>`;
      }
      const won = rival.delta !== null && rival.delta > 0 ? " won" : " ahead";
      const playerId = rival.playerId;
      const name = playerId ? `<a class="player-link" href="https://piuscores.arroweclip.se/Player/${encodeURIComponent(playerId)}/Sessions">${esc(displayName(rival.player))}</a>` : esc(displayName(rival.player));
      return `${tr}${head}<td class="sm${won}" title="${esc(rival.player)}">${name}</td><td class="sm num score${won}" title="${esc(datesTitle(rival))}">${fmtScore(rival.score)}</td><td class="sm num${won}">${fmtDelta(rival.realDelta, colorByRealDiff ? rival.realDelta : rival.delta, scoreCap)}</td></tr>`;
    });
    if (folded) {
      rows.push(`${rowStart(shownRivals.length)}<td class="sm others" colspan="3"><button class="show-others" type="button" data-expand="${esc(chartKey(chart))}">...show ${folded} other${folded === 1 ? "" : "s"}...</button></td></tr>`);
    }
    return rows;
  }

  // src/ui/rivals/chart_results.js
  var chartResultsStyles = `
  .score-content { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
  .tabs { display: flex; gap: 6px; padding: 10px 16px; border-bottom: 1px solid #2B4034; }
  .tab { background: #1C2B22; color: #9AB3A3; border: 1px solid #2B4034; border-radius: 6px;
         padding: 6px 12px; font: 500 14px/1.2 Roboto, Arial, sans-serif; cursor: pointer; }
  .tab:hover { color: #EAF5EC; }
  .tab[aria-selected="true"] { background: #2B4034; color: #EAF5EC; border-color: #4FE33F; }
  /* Room for three digits, so tabs keep their size as the counts change. */
  .tab-count { display: inline-block; min-width: 3ch; margin-left: 6px; opacity: .7; text-align: right;
               font-variant-numeric: tabular-nums; }
  .tab-count.rivals-win { color: #FF2A00; }
  .tab-count.not-played { color: #3FA9F5; }
  .tab-count.you-win { color: #4FE33F; }
  .dlg-body { overflow-y: auto; overflow-x: hidden; padding: 0 16px 12px; flex: 1;
              scrollbar-width: thin; scrollbar-color: #2B4034 transparent; }
  .dlg-body:hover { scrollbar-color: #3D5A49 transparent; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th.col-chart { width: 56px; }
  th.col-player { width: 92px; } /* 80px of text + 12px padding */
  th.col-score { width: 70px; }
  th.col-diff { width: 70px; }
  .track { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  th { position: sticky; top: 0; z-index: 1; background: #14201A; color: #9AB3A3; font-weight: 500;
       text-align: left; padding: 8px 6px; border-bottom: 1px solid #2B4034; }
  td { padding: 4px 6px; vertical-align: top; overflow: hidden; text-overflow: ellipsis; }
  tr.alt > td:not(.track):not([rowspan]):not(.others) { background: rgba(255,255,255,.05); }
  tr.group td { border-top: 1px solid #2B4034; }
  tr.gap td { height: 8px; padding: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .empty { padding: 24px; text-align: center; color: #9AB3A3; }
  .tab[data-tab="hidden"] { margin-left: auto; }
  .tab-count.hidden { color: #8C2E1C; }
  td.group-title { padding: 14px 6px 6px; color: #A85044; font: 500 14px/1.2 Roboto, Arial, sans-serif;
                   border-bottom: 1px solid #3A1813; }
` + chartResultsItemStyles;
  function createChartResults(container, onSelectTab) {
    container.innerHTML = `
    <div class="tabs" role="tablist" aria-label="Score results"></div>
    <div class="dlg-body" role="tabpanel"></div>`;
    const tabs = container.querySelector(".tabs");
    const body = container.querySelector(".dlg-body");
    const expandedCharts = /* @__PURE__ */ new Set();
    let lastRender = null;
    tabs.addEventListener("click", (event) => {
      const tab = event.target.closest(".tab");
      if (tab)
        onSelectTab(tab.dataset.tab);
    });
    body.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-expand]");
      if (!button)
        return;
      expandedCharts.add(button.dataset.expand);
      if (lastRender)
        render(...lastRender);
    });
    const tableRows = (charts, myName, scoreCap, collapseWon, colorByRealDiff = false) => charts.flatMap((chart, i) => {
      const chartTrs = chartResultsItem(chart, myName, {
        collapseWon: collapseWon && !expandedCharts.has(chartKey(chart)),
        colorByRealDiff,
        scoreCap
      });
      return i === 0 ? chartTrs : ['<tr class="gap"><td colspan="5"></td></tr>', ...chartTrs];
    });
    function render(levelCharts, hiddenGroups, selectedTab, myName, emptyMessage, results, scoreCap) {
      lastRender = [levelCharts, hiddenGroups, selectedTab, myName, emptyMessage, results, scoreCap];
      const groups = hiddenGroups.filter(({ charts }) => charts.length);
      const tabCounts = Object.fromEntries(TABS.map(({ id }) => [
        id,
        id === "hidden" ? groups.reduce((acc, { charts }) => acc + charts.length, 0) : levelCharts.filter((c) => chartTier(c) === id).length
      ]));
      const tabNumber = (id) => results ? results[TIER_STAT[id]] : tabCounts[id];
      const tabWord = (id) => STAT_WORDS[results ? "results" : "charts"][TIER_STAT[id]];
      if (selectedTab === "hidden" && tabCounts.hidden === 0) {
        onSelectTab("rivals-win");
        return;
      }
      const capitalized = (word) => word[0].toUpperCase() + word.slice(1);
      tabs.innerHTML = TABS.filter(({ id }) => id !== "hidden" || tabCounts.hidden).map(({ id }) => `<button class="tab" type="button" role="tab" aria-selected="${id === selectedTab}" data-tab="${id}">${capitalized(tabWord(id))}<span class="tab-count ${id}">${tabNumber(id)}</span></button>`).join("");
      if (tabCounts[selectedTab] === 0) {
        const message = emptyMessage ?? `No ${STAT_WORDS.charts[TIER_STAT[selectedTab]]} charts at this level.`;
        body.innerHTML = `<div class="empty">${message}</div>`;
        return;
      }
      let rows;
      if (selectedTab === "hidden") {
        rows = groups.map(({ label, charts }) => `<tr><td class="group-title" colspan="5">${esc(label)} \xB7 ${charts.length}</td></tr>` + tableRows(charts, myName, scoreCap, true, true).join("")).join("");
      } else {
        const visibleCharts = levelCharts.filter((c) => chartTier(c) === selectedTab);
        const byRivalCount = (a, b) => b.rivals.length - a.rivals.length || a.track.localeCompare(b.track);
        visibleCharts.sort({ "you-win": byLeadWeight, "not-played": byRivalCount }[selectedTab] || byTargetWeight);
        rows = tableRows(visibleCharts, myName, scoreCap, selectedTab === "rivals-win").join("");
      }
      body.innerHTML = `<table>
      <thead><tr><th class="track">Track</th><th class="col-chart">Chart</th><th class="col-player">Player</th><th class="num col-score">Score</th><th class="num col-diff">Diff</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    }
    return { render };
  }

  // src/ui/rivals/charts_groups.js
  var chartsGroupsStyles = `
  .filters { display: flex; gap: 6px; padding: 10px 10px 10px 16px; border-right: 1px solid #2B4034;
             overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable; flex-shrink: 0;
             scrollbar-width: thin; scrollbar-color: #2B4034 transparent; }
  .filters:hover { scrollbar-color: #3D5A49 transparent; }
  /* Rows share the column height evenly, but never get thinner than 10px (the panel scrolls then). */
  .level-chart { display: grid; grid-template-columns: 128px 38px 128px; grid-template-rows: auto;
                 grid-auto-rows: minmax(10px, 1fr); row-gap: 6px; font-size: 14px; }
  .level-head { color: #9AB3A3; font-size: 17px; padding-bottom: 4px; }
  .level-head.single { text-align: right; }
  .level-num { display: flex; align-items: center; justify-content: center; font-size: 18px; color: #9AB3A3; font-variant-numeric: tabular-nums; }
  .level-num.on, .level-head.on { color: #EAF5EC; font-weight: 600; }
  .level-bar { display: flex; height: 100%; padding: 0; border: 1px solid rgba(255,255,255,.04); box-sizing: border-box; border-radius: 3px; overflow: hidden;
               background: #1C2B22; cursor: pointer; opacity: .75; }
  .level-bar.single { flex-direction: row-reverse; }
  .level-bar:hover { opacity: 1; }
  .level-bar.on { opacity: 1; box-shadow: 0 0 0 2px #EAF5EC; }
  .level-bar.placeholder { visibility: hidden; }
  /* Each segment shows its count and is always wide enough for it, even if that bends the proportions. */
  .level-bar > span { flex: 0 0 0; min-width: max-content; padding: 0 3px; overflow: hidden; display: flex; align-items: center;
                      justify-content: center; font: 600 11px/1 Roboto, Arial, sans-serif; color: rgba(0,0,0,.55); }
  /* Wins and np darken from the level number outward. Losses burn from red in the middle to orange at
     the end; how orange is set by --heat (0..1), and only the most losses of any level reach full orange. */
  .level-bar .win { background: linear-gradient(to right, #72C457, #3F7D24); }
  .level-bar.single .win { background: linear-gradient(to left, #72C457, #3F7D24); }
  .level-bar .unplayed { background: linear-gradient(to right, #0F2B3C, #061219); color: #7F9DB0; }
  .level-bar.single .unplayed { background: linear-gradient(to left, #0F2B3C, #061219); }
  .level-bar .lose { --hot: color-mix(in srgb, #FF8A00 calc(var(--heat) * 100%), #D01E00);
                     background: linear-gradient(to left, var(--hot), #B01C00); }
  .level-bar.single .lose { background: linear-gradient(to right, var(--hot), #B01C00); }
  .level-bar .hidden-loss { background: #34140E; }
  /* Segments round their outer corners and lie over the next segment, which slides under them. */
  .level-bar > span { position: relative; }
  .level-bar .win { z-index: 3; }
  .level-bar .unplayed { z-index: 2; }
  .level-bar .hidden-loss { z-index: 1; }
  .level-bar > span:not(.lose) { border-radius: 0 2px 2px 0; }
  .level-bar > span + span { margin-left: -2px; padding-left: 5px; }
  .level-bar.single > span:not(.lose) { border-radius: 2px 0 0 2px; }
  .level-bar.single > span + span { margin: 0 -2px 0 0; padding: 0 5px 0 3px; }
  .level-other { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; margin-top: 6px; }
  .level-other .level-num { grid-column: 1; justify-content: flex-end; padding-right: 6px; }
  .level-other .level-bar { grid-column: 2 / -1; }
`;
  var levelType = (level) => (level.match(/^[A-Za-z]+/) || [level])[0];
  var levelNum = (level) => parseInt((level.match(/\d+/) || ["0"])[0], 10);
  var TYPE_ORDER = { S: 0, D: 1 };
  var plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  function compareLevels(a, b) {
    const ta = levelType(a), tb = levelType(b);
    return (TYPE_ORDER[ta] ?? 9) - (TYPE_ORDER[tb] ?? 9) || ta.localeCompare(tb) || levelNum(a) - levelNum(b);
  }
  var sortedLevels = (charts) => [...new Set(charts.map((c) => c.chart))].sort(compareLevels);
  function createChartsGroups(container, onSelect) {
    container.addEventListener("click", (event) => {
      const bar = event.target.closest(".level-bar[data-level]");
      if (bar)
        onSelect(bar.dataset.level);
    });
    function render(charts, hiddenCharts, selectedLevel, countBy) {
      const levels = sortedLevels([...charts, ...hiddenCharts]);
      const stats = {};
      for (const level of levels) {
        const atLevel = (chart) => chart.chart === level;
        stats[level] = levelStats(charts.filter(atLevel), hiddenCharts.filter(atLevel));
      }
      const maxLose = Math.max(1, ...levels.map((level) => stats[level][countBy].lose));
      const heat = (n) => ((n / maxLose) ** 2).toFixed(3);
      const bar = (level, side) => {
        if (!level)
          return `<span class="level-bar ${side} placeholder" aria-hidden="true"></span>`;
        const on = level === selectedLevel;
        const { charts: byCharts, results: byResults } = stats[level];
        const counts = stats[level][countBy];
        const part = (cls, n, label = n, style = "") => n ? `<span class="${cls}" style="flex-grow: ${n}${style}">${label}</span>` : "";
        const tipLine = (stat2) => `
${plural(byCharts[stat2], `${STAT_WORDS.charts[stat2]} chart`)} / ${plural(byResults[stat2], `${STAT_WORDS.results[stat2]} result`)}`;
        const tip = `${level}:${tipLine("lose")}${tipLine("hidden")}${tipLine("unplayed")}${tipLine("win")}`;
        return `<button class="level-bar ${side}${on ? " on" : ""}" type="button" role="radio" aria-checked="${on}" data-level="${esc(level)}" title="${esc(tip)}">${part("win", counts.win)}${part("unplayed", counts.unplayed)}${part("hidden-loss", counts.hidden, "")}${part("lose", counts.lose, counts.lose, `; --heat: ${heat(counts.lose)}`)}</button>`;
      };
      const sideLevels = levels.filter((level) => levelType(level) in TYPE_ORDER);
      const otherLevels = levels.filter((level) => !(levelType(level) in TYPE_ORDER));
      const levelNums = sideLevels.map(levelNum);
      const minNum = Math.min(...levelNums), maxNum = Math.max(...levelNums);
      const nums = sideLevels.length ? Array.from({ length: maxNum - minNum + 1 }, (_, i) => maxNum - i) : [];
      const find = (type, num) => sideLevels.find((l) => levelType(l) === type && levelNum(l) === num);
      const row = (num) => {
        const single = find("S", num), double = find("D", num);
        const on = selectedLevel !== null && (selectedLevel === single || selectedLevel === double);
        return `${bar(single, "single")}<span class="level-num${on ? " on" : ""}">${num}</span>${bar(double, "double")}`;
      };
      const other = (level) => `<div class="level-other"><span class="level-num${level === selectedLevel ? " on" : ""}">${esc(level)}</span>${bar(level, "double")}</div>`;
      const headOn = (type) => selectedLevel !== null && levelType(selectedLevel) === type ? " on" : "";
      container.innerHTML = `<div class="level-chart" role="radiogroup" aria-label="Levels"><span class="level-head single${headOn("S")}">Singles</span><span></span><span class="level-head${headOn("D")}">Doubles</span>${nums.map(row).join("")}${otherLevels.map(other).join("")}</div>`;
    }
    return { render };
  }

  // src/ui/rivals/rivals_list_item.js
  var rivalListItemStyles = `
  .rival { padding: 9px 6px; border-radius: 4px; position: relative; }
  .rival.faded::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
                        background: rgba(20,32,26,.8); }
  .rival:nth-child(even) { background: rgba(255,255,255,.05); }
  .rival:hover { background: rgba(79,227,63,.12); }
  .rival { cursor: pointer; }
  .rival.focused { background: rgba(79,227,63,.08); box-shadow: 0 0 0 1px #2B4034 inset; cursor: default; }
  .rival:not(.focused) .rival-links, .rival:not(.focused) .rival-scrap { display: none; }
  .rival-toggle { display: flex; align-items: center; gap: 8px; font-size: 17px; }
  .rival.focused .rival-toggle { cursor: pointer; }
  .rival input { appearance: none; margin: 0; flex-shrink: 0; width: 16px; height: 16px; cursor: pointer;
                 background: #3A4540; border: 1px solid #56635C; border-radius: 3px; display: grid; place-content: center; }
  .rival input:hover { border-color: #7A8A81; }
  .rival input:checked { background: #A9AFAC; border-color: #A9AFAC; }
  .rival input:checked::after { content: ''; width: 4px; height: 8px; margin-top: -2px;
                                border: solid #0F1A14; border-width: 0 2px 2px 0; transform: rotate(45deg); }
  .rival input[data-player] { position: relative; display: block; width: 28px; height: 16px; border-radius: 8px;
                              transition: background .15s, border-color .15s; }
  .rival input[data-player]::after { content: ''; position: absolute; top: 1px; left: 1px; width: 12px; height: 12px;
                                     margin: 0; border: 0; border-radius: 50%; background: #9AA59F; transform: none;
                                     transition: left .15s, background .15s; }
  .rival input[data-player]:checked::after { left: 13px; background: #0F1A14; }
  .rival-spacer { width: 28px; flex-shrink: 0; }
  .rival.me .rival-name, .rival.me .rival-pum { color: #FFC433; }
  .rival-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rival-pum { color: #9AB3A3; font-variant-numeric: tabular-nums; }
  .rival-visit { display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; color: #8A9590;
                 font-size: 13px; font-variant-numeric: tabular-nums; text-decoration: none; }
  .rival-visit:hover { color: #4FE33F; }
  .rival-visit svg { width: 13px; height: 13px; }
  .rival-links { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; }
  .rival-stats { white-space: nowrap; color: #9AB3A3; }
  .rival-stats .blue { color: #3FA9F5; }
  .rival-link { background: rgba(0,0,0,.12); color: #9AB3A3; border: 1px solid #2B4034; border-radius: 4px; padding: 1px 8px;
                font-size: 13px; text-decoration: none; }
  .rival-link:hover { color: #4FE33F; border-color: #4FE33F; background: #14201A; }
  .rival-solo { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
  .rival-solo:hover { color: #3FA9F5; border-color: #3FA9F5; background: #14201A; }
  .rival .rival-solo input { width: 12px; height: 12px; }
  .rival .rival-solo input:checked { background: #3FA9F5; border-color: #3FA9F5; }
  .rival .rival-solo input:checked::after { width: 3px; height: 6px; margin-top: -1px; }
  .rival-delete { margin-left: auto; font: inherit; font-size: 13px; cursor: pointer; }
  .rival-delete:hover { color: #FF5A5A; border-color: #FF5A5A; background: #2B1C1C; }
  .rival-scrap { margin: 2px 0 0; font-size: 13px; color: #8A9590; font-variant-numeric: tabular-nums; }
  .rival-counts, .rival-stats { margin-top: 3px; }
  .rival-counts { white-space: nowrap; }
  .rival-counts > span { color: #9AB3A3; }
  .rival-counts .zero { opacity: .4; }
  .rival.off .rival-name, .rival.off .rival-pum, .rival.off .rival-visit, .rival.off .rival-scrap { opacity: .45; }
`;
  var scrapCount = (n, label) => `<span${n === 0 ? ' class="zero"' : ""}>${fmt(n)}</span> ${label}`;
  var scrapLine = (scrapStats, best) => `${scrapCount(scrapStats?.scores || 0, "scores")} \xB7 ${scrapCount(best || 0, "best")} \xB7 ${scrapCount(scrapStats?.sessions || 0, "sessions")}`;
  var statsTip = "Results against this rival: lost / non-matched / won, judged on the real scores, without the score cap and try cooldown filters";
  var statsSoloTip = "Solo: the same counts as in the header, with the score cap, try cooldown and NP min rivals applied";
  var clockIcon = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/></svg>';
  function visitBadge(visitedAt, href) {
    if (typeof visitedAt !== "number") {
      return `<a class="rival-visit" href="${href}" title="Sessions page never visited">${clockIcon}?</a>`;
    }
    const visited = new Date(visitedAt);
    const now = /* @__PURE__ */ new Date();
    const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(visited.getFullYear(), visited.getMonth(), visited.getDate())) / 864e5);
    if (days < 3)
      return "";
    return `<a class="rival-visit" href="${href}" title="Sessions page last visited ${esc(visited.toLocaleString())}">${clockIcon}${days}d</a>`;
  }
  function rivalListItem({ playerId, name, pumbility }, player, { me, on, solo, faded, focused, stats, statsWords, best }) {
    const base = `https://piuscores.arroweclip.se/Player/${encodeURIComponent(playerId)}`;
    const toggle = me ? '<span class="rival-spacer"></span>' : `<input type="checkbox" data-player="${esc(playerId)}"${on ? " checked" : ""}>`;
    return `<div class="rival${on || solo ? "" : " off"}${faded ? " faded" : ""}${me ? " me" : ""}${focused ? " focused" : ""}" data-rival="${esc(playerId)}"><div class="rival-toggle" title="${esc(name)}">${toggle}<span class="rival-name">${esc(name)}</span>${visitBadge(player?.sessionsVisitedAt, `${base}/Sessions`)}<span class="rival-pum">${fmt(pumbility)}</span></div><div class="rival-scrap"><div class="rival-counts" title="scraped scores \xB7 best scores \xB7 scraped sessions">${scrapLine(player?.scrapStats, best)}</div>` + (me ? "" : `<div class="rival-stats" title="${solo ? statsSoloTip : statsTip}">${statWords(stats, " \xB7 ", statsWords)}</div>`) + '</div><div class="rival-links">' + (me ? `<a class="rival-link" href="${base}">My page</a>` : `<label class="rival-link rival-solo" title="Compare only you and this rival"><input type="checkbox" data-solo="${esc(playerId)}"${solo ? " checked" : ""}>Solo</label>`) + `<a class="rival-link" href="${base}/Sessions">Sessions</a><button class="rival-link rival-delete" type="button" data-delete="${esc(playerId)}" data-name="${esc(name)}"${me ? ' data-own="1"' : ""} title="${me ? "Delete all your saved scores" : "Delete this player and all their saved scores"}">Delete</button></div></div>`;
  }

  // src/ui/rivals/rivals_list.js
  var rivalListStyles = `
  .rival-list { width: 285px; flex-shrink: 0; font-weight: 400; overflow-y: auto; padding: 10px 16px 10px 8px;
                border-right: 1px solid #2B4034; scrollbar-width: thin; scrollbar-color: #2B4034 transparent; }
  .rival-list:hover { scrollbar-color: #3D5A49 transparent; }
  .rival-list .muted { color: #9AB3A3; }
` + rivalListItemStyles;
  function createRivalList(container, onChange) {
    let focusedRival = null;
    let soloRival = null;
    let pendingScroll = false;
    container.addEventListener("change", async (event) => {
      const solo = event.target.closest("input[data-solo]");
      if (solo) {
        soloRival = solo.checked ? solo.dataset.solo : null;
        await onChange();
        return;
      }
      const box = event.target.closest("input[data-player]");
      if (!box)
        return;
      try {
        const hiddenIds = new Set((await loadPreferences()).hiddenRivals);
        if (box.checked)
          hiddenIds.delete(box.dataset.player);
        else
          hiddenIds.add(box.dataset.player);
        await savePreferences({ hiddenRivals: [...hiddenIds] });
        await onChange();
      } catch (error) {
        console.error("[piuscores] Unable to save rival selection", error);
      }
    });
    container.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-delete]");
      if (!button) {
        const rival = event.target.closest(".rival");
        if (!rival || event.target.closest("input, a, label"))
          return;
        const unfocus = rival.classList.contains("focused");
        if (unfocus && !event.target.closest(".rival-toggle"))
          return;
        focusedRival = unfocus ? null : rival.dataset.rival;
        for (const other of container.querySelectorAll(".rival")) {
          other.classList.toggle("focused", other.dataset.rival === focusedRival);
        }
        if (dropSolo())
          await onChange();
        return;
      }
      const { delete: playerId, name, own } = button.dataset;
      const question = own ? "Delete all your saved scores? Your player record is kept. This cannot be undone." : `Delete ${name} and all their saved scores? This cannot be undone.`;
      if (!window.confirm(question))
        return;
      try {
        await deletePlayer(playerId);
        if (soloRival === playerId)
          soloRival = null;
        await onChange();
      } catch (error) {
        console.error("[piuscores] Unable to delete player data", error);
      }
    });
    function render(charts, players, ownPlayerId, hiddenIds, bestCounts, soloStats, countBy) {
      const rivalStats = {};
      for (const chart of charts) {
        for (const rival of chart.rivals) {
          const counts = rivalStats[rival.playerId] ||= { lose: 0, win: 0, unplayed: 0 };
          counts[rival.realDelta === null ? "unplayed" : rival.realDelta < 0 ? "lose" : "win"]++;
        }
      }
      const ids = new Set(Object.keys(players));
      for (const chart of charts)
        for (const rival of chart.rivals)
          ids.add(rival.playerId);
      if (ownPlayerId)
        ids.add(ownPlayerId);
      const rivals = [...ids].map((playerId) => ({
        playerId,
        name: displayName(players[playerId]?.name || playerId),
        pumbility: typeof players[playerId]?.pumbility === "number" ? players[playerId].pumbility : null
      }));
      rivals.sort((a, b) => (b.pumbility ?? -1) - (a.pumbility ?? -1) || a.name.localeCompare(b.name, void 0, { sensitivity: "base" }));
      container.innerHTML = rivals.length ? rivals.map((rival) => {
        const me = rival.playerId === ownPlayerId;
        const on = me || !hiddenIds.has(rival.playerId);
        const solo = rival.playerId === soloRival;
        return rivalListItem(rival, players[rival.playerId], {
          me,
          on,
          solo,
          faded: !!soloRival && !me && !solo,
          focused: rival.playerId === focusedRival,
          stats: solo && soloStats || rivalStats[rival.playerId] || { lose: 0, win: 0, unplayed: 0 },
          statsWords: STAT_WORDS[solo && soloStats ? countBy : "results"],
          best: bestCounts[rival.playerId]
        });
      }).join("") : '<div class="muted">No rivals yet</div>';
      if (pendingScroll) {
        pendingScroll = false;
        const focused = container.querySelector(".rival.focused");
        if (focused)
          focused.scrollIntoView({ block: "nearest" });
      }
    }
    function focus(playerId) {
      focusedRival = playerId;
      pendingScroll = true;
      dropSolo();
    }
    function dropSolo() {
      if (!soloRival || soloRival === focusedRival)
        return false;
      soloRival = null;
      return true;
    }
    return { render, focus, soloRival: () => soloRival };
  }

  // src/ui/rivals/ui_state.js
  var UI_STATE_KEY = "piuscores.rivalScores.uiState";
  var DEFAULT_STATE = { isOpen: false, selectedLevel: null, selectedTab: "rivals-win" };
  function readUiState() {
    try {
      const raw = sessionStorage.getItem(UI_STATE_KEY);
      if (!raw)
        return { ...DEFAULT_STATE };
      const saved = JSON.parse(raw);
      return {
        isOpen: saved.isOpen === true,
        selectedLevel: typeof saved.selectedLevel === "string" ? saved.selectedLevel : null,
        selectedTab: TABS.some(({ id }) => id === saved.selectedTab) ? saved.selectedTab : DEFAULT_STATE.selectedTab
      };
    } catch (error) {
      console.error("[piuscores] Unable to restore rival scores window state", error);
      return { ...DEFAULT_STATE };
    }
  }
  function saveUiState({ isOpen, selectedLevel, selectedTab }) {
    try {
      sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({ isOpen, selectedLevel, selectedTab }));
    } catch (error) {
      console.error("[piuscores] Unable to save rival scores window state", error);
    }
  }

  // src/ui/rivals/window_header.js
  var windowHeaderStyles = `
  .dlg-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px;
              border-bottom: 1px solid #2B4034; }
  .dlg-head h2 { margin: 0; font-size: 24px; font-weight: 600; }
  .head-settings { display: flex; align-items: center; gap: 20px; margin: 0 auto; }
  /* The label sits above the \u2212 value + row. */
  .stepper { display: grid; grid-template-columns: auto auto auto; align-items: center; gap: 2px 4px; color: #9AB3A3;
             font-size: 15px; font-variant-numeric: tabular-nums; }
  .stepper-label { grid-column: 1 / -1; text-align: center; font-size: 12px; line-height: 1.2; white-space: nowrap; }
  .stepper-value { min-width: 44px; text-align: center; color: #EAF5EC; }
  .stepper.off .stepper-value { color: #9AB3A3; }
  .stepper button { background: #1C2B22; color: #9AB3A3; border: 1px solid #2B4034; border-radius: 4px;
                    width: 24px; height: 24px; padding: 0; font: 600 16px/1 Roboto, Arial, sans-serif; cursor: pointer; }
  .stepper button:hover:not(:disabled) { color: #4FE33F; border-color: #4FE33F; }
  .stepper button:disabled { opacity: .35; cursor: default; }
  /* A two-way switch with the same label above it as the steppers. */
  .switch { display: grid; grid-template-columns: auto auto; gap: 2px 0; color: #9AB3A3; }
  .switch button { background: #1C2B22; color: #9AB3A3; border: 1px solid #2B4034; height: 24px; padding: 0 8px;
                   font: 400 13px/1 Roboto, Arial, sans-serif; cursor: pointer; }
  .switch button:first-of-type { border-radius: 4px 0 0 4px; }
  .switch button:last-of-type { border-radius: 0 4px 4px 0; margin-left: -1px; }
  .switch button:hover:not(.on) { color: #4FE33F; border-color: #4FE33F; position: relative; }
  .switch button.on { background: #2B4034; color: #EAF5EC; cursor: default; }
  .btn.clear-data { color: #FF5A5A; border-color: #FF5A5A; }
  .btn.clear-data:hover { background: #2B1C1C; }
  /* Header buttons look like the rival links: grey until hovered. */
  .dlg-head .btn { box-shadow: none; background: rgba(0,0,0,.12); color: #9AB3A3; border-color: #2B4034; border-radius: 4px;
                   padding: 3px 10px; font: 400 13px/1.4 Roboto, Arial, sans-serif; }
  .dlg-head .btn:hover { color: #4FE33F; border-color: #4FE33F; background: #14201A; }
  .dlg-head .btn.clear-data:hover { color: #FF5A5A; border-color: #FF5A5A; background: #2B1C1C; }
  .head-stats { font-weight: 400; color: #9AB3A3; }
  .head-stats .blue { color: #3FA9F5; }
  .head-stats > span { opacity: .7; }
  .head-stats .zero { opacity: .2; }
  .dlg-close { background: none; border: none; color: #9AB3A3; font-size: 30px; line-height: 1;
               cursor: pointer; padding: 0 4px; }
  .dlg-close:hover { color: #EAF5EC; }
`;
  function createWindowHeader(container, { exportTargets: exportTargets2, onChange, onCleared, onClose }) {
    container.innerHTML = `<h2>Rivals</h2>
    <div class="head-settings">
      <div class="stepper score-cap">
        <span class="stepper-label">Score cap</span>
        <button type="button" data-step="-1" aria-label="Lower score cap">\u2212</button>
        <span class="stepper-value"></span>
        <button type="button" data-step="1" aria-label="Raise score cap">+</button></div>
      <div class="stepper try-cooldown">
        <span class="stepper-label">Retry after</span>
        <button type="button" data-step="-1" aria-label="Retry sooner">\u2212</button>
        <span class="stepper-value"></span>
        <button type="button" data-step="1" aria-label="Retry later">+</button></div>
      <div class="stepper np-minimal-rivals">
        <span class="stepper-label">NP min rivals</span>
        <button type="button" data-step="-1" aria-label="Lower minimal rivals for np">\u2212</button>
        <span class="stepper-value"></span>
        <button type="button" data-step="1" aria-label="Raise minimal rivals for np">+</button></div>
      <div class="switch count-by" role="radiogroup" aria-label="Count by"
           title="Count lost / non-matched / won rival results, or inferior / not played / superior charts">
        <span class="stepper-label">Count by</span>
        <button type="button" role="radio" data-count-by="results"
                title="Count each rival's result separately">Results</button>
        <button type="button" role="radio" data-count-by="charts"
                title="Count each chart once: inferior if any rival beats you, otherwise not played or superior">Charts</button></div>
    </div>
    <button class="btn export" type="button" title="Download charts where rivals beat you or you have no score">Export</button>
    <button class="btn clear-data" type="button" title="Clear all PIU Scores data saved by this extension">Clear data</button>
    <button class="dlg-close" type="button" aria-label="Close">\xD7</button>`;
    const title = container.querySelector("h2");
    const scoreCapControl = container.querySelector(".score-cap");
    const tryCooldownControl = container.querySelector(".try-cooldown");
    const npMinimalRivalsControl = container.querySelector(".np-minimal-rivals");
    const countByControl = container.querySelector(".count-by");
    container.querySelector(".export").addEventListener("click", () => {
      exportTargets2().catch((error) => console.error("[piuscores]", error));
    });
    container.querySelector(".clear-data").addEventListener("click", async () => {
      if (!window.confirm("Clear all PIU Scores data saved by this extension? This cannot be undone."))
        return;
      try {
        await chrome.storage.local.clear();
        await onCleared();
      } catch (error) {
        console.error("[piuscores] Unable to clear saved data", error);
      }
    });
    container.querySelector(".dlg-close").addEventListener("click", () => onClose());
    async function saveSetting(changes) {
      try {
        await savePreferences(changes);
        await onChange();
      } catch (error) {
        console.error("[piuscores] Unable to save setting", error);
      }
    }
    function bindStepper(control, update) {
      control.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-step]");
        if (button)
          await saveSetting(update(await loadPreferences(), Number(button.dataset.step)));
      });
    }
    countByControl.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-count-by]:not(.on)");
      if (button)
        await saveSetting({ countBy: button.dataset.countBy });
    });
    bindStepper(scoreCapControl, ({ scoreCap }, step) => ({ scoreCap: clampScoreCap(scoreCap + step * SCORE_CAP_STEP) }));
    bindStepper(tryCooldownControl, ({ tryCooldown }, step) => ({ tryCooldown: stepTryCooldown(tryCooldown, step) }));
    bindStepper(npMinimalRivalsControl, ({ npMinimalRivals }, step) => ({ npMinimalRivals: clampNpMinimalRivals(npMinimalRivals + step) }));
    function renderStepper(control, text2, value, min, max, isOff) {
      control.classList.toggle("off", isOff);
      control.querySelector(".stepper-value").textContent = text2;
      control.querySelector('[data-step="-1"]').disabled = value <= min;
      control.querySelector('[data-step="1"]').disabled = value >= max;
    }
    function render(me, totals, { scoreCap, tryCooldown, npMinimalRivals, countBy }) {
      const text2 = me?.name ? `Rivals for ${displayName(me.name)}` : "Rivals";
      title.innerHTML = `${esc(text2)}<span class="head-stats"> \u2014 ${statWords(totals, ", ", STAT_WORDS[countBy])}</span>`;
      renderStepper(scoreCapControl, `${scoreCap / 1e3}k`, scoreCap, MIN_SCORE_CAP, MAX_SCORE_CAP, scoreCap >= MAX_SCORE_CAP);
      scoreCapControl.title = scoreCap >= MAX_SCORE_CAP ? "No score cap is applied" : `Hide losses or wins on mutual scores \u2265 ${scoreCap / 1e3}k`;
      renderStepper(
        tryCooldownControl,
        tryCooldown ? `${tryCooldown}d` : "off",
        tryCooldown,
        0,
        TRY_COOLDOWN_OPTIONS.at(-1),
        tryCooldown === 0
      );
      tryCooldownControl.title = tryCooldown ? `Hide lost charts for ${tryCooldown} ${tryCooldown === 1 ? "day" : "days"} after your last try` : "Show lost charts no matter when you last tried them";
      renderStepper(
        npMinimalRivalsControl,
        `${npMinimalRivals}`,
        npMinimalRivals,
        MIN_NP_RIVALS,
        MAX_NP_RIVALS,
        npMinimalRivals === MIN_NP_RIVALS
      );
      npMinimalRivalsControl.title = `Show unplayed charts with \u2265 ${npMinimalRivals} rival ${npMinimalRivals === 1 ? "result" : "results"}`;
      for (const button of countByControl.querySelectorAll("button")) {
        const on = button.dataset.countBy === countBy;
        button.classList.toggle("on", on);
        button.setAttribute("aria-checked", on);
      }
    }
    return { render };
  }

  // src/ui/ui_host.js
  var baseStyles = `
  .buttons { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647;
             display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
  .btn { background: #14201A; color: #4FE33F; border: 1px solid #4FE33F; border-radius: 6px;
         padding: 8px 12px; font: 600 13px/1 Roboto, Arial, sans-serif; cursor: pointer;
         box-shadow: 0 4px 14px rgba(0,0,0,.5); }
  .btn:hover:not(:disabled) { background: #1C2B22; }
  .pos { color: #4FE33F; }
  .neg { color: #FF2A00; }
  .pos.muted { color: #7BA874; }
  .neg.muted { color: #B86A5C; }
`;
  var host = null;
  var styled = /* @__PURE__ */ new Set();
  function uiRoot() {
    if (!host) {
      host = document.createElement("div");
      host.attachShadow({ mode: "open" }).innerHTML = `<style>${baseStyles}</style><div class="buttons"></div>`;
    }
    if (!host.isConnected)
      document.body.appendChild(host);
    return host.shadowRoot;
  }
  function useStyles(name, css) {
    const root = uiRoot();
    if (!styled.has(name)) {
      styled.add(name);
      const style = document.createElement("style");
      style.textContent = css;
      root.appendChild(style);
    }
    return root;
  }
  var buttonStack = () => uiRoot().querySelector(".buttons");

  // src/ui/rivals_window.js
  var windowStyles = `
  .overlay { position: fixed; inset: 0; z-index: 2147483646; background: rgba(0,0,0,.6);
             display: flex; align-items: center; justify-content: center;
             font: 20px/1.4 Roboto, Arial, sans-serif; color: #EAF5EC; }
  .overlay[hidden] { display: none; }
  .dialog { background: #14201A; border: 1px solid #2B4034; border-radius: 8px;
            width: min(1400px, calc(100vw - 32px)); height: 90vh;
            display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,.6); }
  .dlg-main { display: flex; flex: 1; min-height: 0; }
`;
  var styles = windowStyles + windowHeaderStyles + rivalListStyles + chartsGroupsStyles + chartResultsStyles;
  function createRivalsWindow(exportTargets2, pagePlayerId2) {
    const state = readUiState();
    let showButton = null;
    let overlay = null;
    let header = null;
    let rivalList = null;
    let chartsGroups = null;
    let chartResults = null;
    const rerender = () => render().catch((error) => console.error("[piuscores]", error));
    function ensure() {
      if (overlay) {
        uiRoot();
        return;
      }
      const root = useStyles("rivals", styles);
      showButton = document.createElement("button");
      showButton.className = "btn show-scores";
      showButton.type = "button";
      showButton.title = "Show all saved rival scores";
      showButton.textContent = "RIVALS";
      showButton.hidden = state.isOpen;
      showButton.addEventListener("click", () => open());
      buttonStack().appendChild(showButton);
      overlay = document.createElement("div");
      overlay.className = "overlay";
      overlay.hidden = !state.isOpen;
      overlay.innerHTML = `
      <div class="dialog" role="dialog" aria-label="Rival scores">
        <div class="dlg-head"></div>
        <div class="dlg-main">
          <div class="rival-list" aria-label="Rivals"></div>
          <div class="filters"></div>
          <div class="score-content"></div>
        </div>
      </div>`;
      root.appendChild(overlay);
      header = createWindowHeader(overlay.querySelector(".dlg-head"), {
        exportTargets: exportTargets2,
        onChange: render,
        onCleared: () => {
          state.selectedLevel = null;
          state.selectedTab = "rivals-win";
          return render();
        },
        onClose: () => close()
      });
      rivalList = createRivalList(overlay.querySelector(".rival-list"), render);
      chartsGroups = createChartsGroups(overlay.querySelector(".filters"), (level) => {
        state.selectedLevel = level;
        saveUiState(state);
        rerender();
      });
      chartResults = createChartResults(overlay.querySelector(".score-content"), (tab) => {
        state.selectedTab = tab;
        saveUiState(state);
        rerender();
      });
    }
    async function render() {
      ensure();
      const [allCharts, { players, ownPlayerId, bestCounts }, preferences] = await Promise.all([loadCharts(), loadPlayers(), loadPreferences()]);
      const { hiddenRivals, tryCooldown, npMinimalRivals } = preferences;
      const hiddenIds = new Set(hiddenRivals);
      const solo = rivalList.soloRival();
      const isIncluded = (playerId) => solo ? playerId === solo : !hiddenIds.has(playerId);
      const isCoolingDown = (chart) => {
        const days = daysSince(chart.myDates.lastTryDate);
        return chartTier(chart) === "rivals-win" && days !== null && days < tryCooldown;
      };
      const shownCharts = allCharts.map((c) => withRivalsOrNull(c, (r) => isIncluded(r.playerId))).filter(Boolean).filter((c) => !c.unplayed || c.rivals.length >= npMinimalRivals);
      const charts = shownCharts.filter((c) => !isCoolingDown(c));
      const coolingCharts = shownCharts.filter(isCoolingDown);
      const isCapLoss = (chart) => chartTier(chart) !== "rivals-win" && chart.rivals.some((r) => r.realDelta !== null && r.realDelta < 0);
      const capLosses = charts.filter(isCapLoss).map((c) => ({ ...c, weight: targetWeight(c.rivals.map((r) => r.realDelta)) }));
      const levels = sortedLevels(shownCharts);
      if (!levels.includes(state.selectedLevel)) {
        state.selectedLevel = levels[0] ?? null;
        saveUiState(state);
      }
      const { countBy } = preferences;
      const totals = countBy === "charts" ? tierCounts(charts) : resultCounts(charts);
      header.render(players[ownPlayerId], totals, preferences);
      rivalList.render(allCharts, players, ownPlayerId, hiddenIds, bestCounts, solo ? totals : null, countBy);
      const barCharts = charts.filter((c) => !isCapLoss(c));
      const hiddenCharts = [...coolingCharts, ...capLosses];
      chartsGroups.render(barCharts, hiddenCharts, state.selectedLevel, countBy);
      const emptyMessage = allCharts.length === 0 ? "No saved rival scores yet \u2014 grab them on a player's Sessions page." : shownCharts.length === 0 ? "No charts for the selected rivals \u2014 check some rivals on the left." : null;
      const atLevel = (chart) => chart.chart === state.selectedLevel;
      const tabResults = countBy === "results" ? levelStats(barCharts.filter(atLevel), hiddenCharts.filter(atLevel)).results : null;
      chartResults.render(
        charts.filter(atLevel),
        [
          { label: "Try cooldown", charts: coolingCharts.filter(atLevel).sort(byTargetWeight) },
          { label: "Score cap", charts: capLosses.filter(atLevel).sort(byTargetWeight) }
        ],
        state.selectedTab,
        players[ownPlayerId]?.name || "You",
        emptyMessage,
        tabResults,
        preferences.scoreCap
      );
    }
    function setOpen(isOpen) {
      state.isOpen = isOpen;
      saveUiState(state);
      ensure();
      overlay.hidden = !isOpen;
      showButton.hidden = isOpen;
    }
    function focusPagePlayer() {
      const playerId = pagePlayerId2();
      if (playerId)
        rivalList.focus(playerId);
    }
    function open() {
      setOpen(true);
      focusPagePlayer();
      rerender();
    }
    function close() {
      setOpen(false);
    }
    function initialize() {
      ensure();
      if (!state.isOpen)
        return;
      focusPagePlayer();
      rerender();
    }
    return { initialize, render, isOpen: () => state.isOpen };
  }

  // src/ui/scrap_overlay.js
  var fmt2 = (n) => n === null || n === void 0 ? "\u2014" : n.toLocaleString("en-US");
  var scrapOverlayStyles = `
  .scrap-results { order: 1; }
  .scrap-results:disabled { color: #2F782B; border-color: #2F782B; cursor: default; }
`;
  function isPlayerSessionsPage() {
    return /^\/Player\/[^/]+\/Sessions\/?$/i.test(location.pathname);
  }
  function isPlayerProfilePage() {
    return /^\/Player\/[^/]+\/?$/i.test(location.pathname);
  }
  function scrapLabel(info) {
    if (!info)
      return "Loading sessions...";
    const { count, more, known, name, pumbility } = info;
    if (count === 0)
      return "No new sessions to grab";
    if (!known)
      return `Add player '${name}'${pumbility === null ? "" : ` PB ${fmt2(pumbility)}`} and scrap his results`;
    const sessions = `${count}${more ? "+" : ""} session${count === 1 && !more ? "" : "s"}`;
    return `Grab scores from ${sessions}`;
  }
  function createScrapOverlay({ scrapeResults, readSessionsPage: readSessionsPage2, countNewSessions: countNewSessions2, onNothingToGrab }) {
    let stored = null;
    let isScraping = false;
    let scrapStatus = null;
    let finishedPath = null;
    let readyPath = null;
    useStyles("scrap", scrapOverlayStyles);
    const button = document.createElement("button");
    button.className = "btn scrap-results";
    button.type = "button";
    buttonStack().appendChild(button);
    async function reload() {
      const { players, ownPlayerId } = await chrome.storage.local.get(["players", "ownPlayerId"]);
      stored = { players: players || {}, ownPlayerId: typeof ownPlayerId === "string" ? ownPlayerId : null };
      update();
    }
    function getScrapInfo() {
      const page = readSessionsPage2();
      if (!page || !stored)
        return null;
      const { players, ownPlayerId } = stored;
      return {
        known: isKnownPlayer(players, page.playerId, ownPlayerId),
        name: displayName(page.name),
        pumbility: page.pumbility,
        ...countNewSessions2(players[page.playerId]?.lastScrapedSession || null)
      };
    }
    function update() {
      uiRoot();
      button.hidden = !isPlayerSessionsPage() && !isPlayerProfilePage();
      if (isPlayerProfilePage()) {
        button.disabled = false;
        button.textContent = "Open sessions to grab scores";
        return;
      }
      if (finishedPath !== null && finishedPath !== location.pathname) {
        finishedPath = null;
        scrapStatus = null;
      }
      const info = getScrapInfo();
      if (info && readyPath !== location.pathname) {
        readyPath = location.pathname;
        if (info.count === 0)
          onNothingToGrab();
      }
      button.disabled = isScraping || finishedPath !== null || !info || info.count === 0;
      const label = scrapStatus ?? scrapLabel(info);
      if (button.textContent !== label)
        button.textContent = label;
    }
    button.addEventListener("click", async () => {
      if (isPlayerProfilePage()) {
        location.assign(`${location.pathname.replace(/\/$/, "")}/Sessions`);
        return;
      }
      isScraping = true;
      update();
      try {
        const finished = await scrapeResults((status) => {
          scrapStatus = status;
          update();
        });
        if (finished)
          finishedPath = location.pathname;
      } catch (error) {
        console.error("[piuscores] Unable to scrape player sessions", error);
        scrapStatus = "Scraping failed";
      } finally {
        isScraping = false;
        update();
        if (finishedPath === null) {
          setTimeout(() => {
            scrapStatus = null;
            update();
          }, 2500);
        }
      }
    });
    update();
    return { update, reload };
  }

  // src/export_targets.js
  var fmt3 = (n) => n === null || n === void 0 ? "\u2014" : n.toLocaleString("en-US");
  async function exportTargets() {
    const charts = (await loadCharts()).flatMap(({ track, chart, rivals, unplayed }) => {
      const entries = rivals.filter(({ delta: delta2 }) => delta2 === null || delta2 < 0).map(({ player, score, delta: delta2, realDelta }) => ({ rival: player, score, difference: delta2, realDifference: realDelta })).sort((a2, b) => b.score - a2.score);
      return entries.length ? [{ track, chart, entries, unplayed, weight: targetWeight(entries.map((r) => r.difference)) }] : [];
    });
    charts.sort(byTargetWeight);
    const lines = [`PIU Scores targets \u2014 ${(/* @__PURE__ */ new Date()).toLocaleString()}`, `${charts.length} chart(s)`, ""];
    for (const { track, chart, entries } of charts) {
      lines.push(`${track}  ${chart}`);
      const nameW = Math.max(...entries.map((r) => r.rival.length)) + 1;
      const scoreW = Math.max(...entries.map((r) => fmt3(r.score).length));
      const diffW = Math.max(0, ...entries.filter((r) => r.realDifference !== null).map((r) => fmt3(r.realDifference).length));
      for (const r of entries) {
        const note = (r.realDifference === null ? "\u2014" : fmt3(r.realDifference)).padStart(diffW);
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

  // src/ui/toasts.js
  var MAX_LINES = 8;
  var TOAST_MS = 5e3;
  var toastStyles = `
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
  .more { color: #9AB3A3; margin-top: 2px; }
  @keyframes in { from { opacity: 0; transform: translateY(8px); } }
`;
  var fmt4 = (n) => n === null || n === void 0 ? "\u2014" : n.toLocaleString("en-US");
  var fmtDelta2 = (n) => {
    if (n === null || n === void 0)
      return "<span>\u2014</span>";
    const cls = n > 0 ? "pos" : n < 0 ? "neg" : "";
    return `<span class="${cls}">${n > 0 ? "+" : ""}${fmt4(n)}</span>`;
  };
  var fmtScore2 = (score, prev) => prev === null || prev === score ? fmt4(score) : `${fmt4(prev)} \u2192 ${fmt4(score)}`;
  var esc2 = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function eventLines(event) {
    const name = `${esc2(event.track)} <b>${esc2(event.chart)}</b>`;
    const badge = event.change === "new" ? '<span class="new">NEW</span>' : '<span class="upd">UPD</span>';
    if (event.kind === "rival") {
      return [`${badge} ${name} ${esc2(displayName(event.player))}: ${fmtScore2(event.score, event.prevScore)} (${fmtDelta2(event.delta)})`];
    }
    return [
      `${badge} ${name} You: ${fmtScore2(event.score, event.prevScore)}`,
      ...event.deltas.map((d) => `<span class="sub">${esc2(displayName(d.player))}: ${fmt4(d.score)} (${fmtDelta2(d.delta)})</span>`)
    ];
  }
  function toastStack() {
    const root = useStyles("toasts", toastStyles);
    let stack = root.querySelector(".stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "stack";
      root.appendChild(stack);
    }
    return stack;
  }
  function pushToast(toast) {
    const close = () => {
      if (toast.classList.contains("out"))
        return;
      toast.classList.add("out");
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 600);
    };
    toast.addEventListener("click", close);
    setTimeout(close, TOAST_MS);
    toastStack().appendChild(toast);
  }
  function showToast(rival, events) {
    const toast = document.createElement("div");
    toast.className = "toast";
    const all = events.flatMap(eventLines);
    const lines = all.slice(0, MAX_LINES).map((line) => `<div class="line">${line}</div>`).join("");
    const more = all.length > MAX_LINES ? `<div class="more">\u2026and ${all.length - MAX_LINES} more line(s) (see console)</div>` : "";
    toast.innerHTML = `<div class="title">${esc2(rival)}: ${events.length} change(s)</div>${lines}${more}`;
    pushToast(toast);
  }
  function showSessionToast(player, title, timestamp, scannedResults) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<div class="title">${esc2(displayName(player))}: parsed new session</div><div class="line">${esc2(title)}</div><div class="line">${esc2(timestamp)}</div><div class="line">Scanned ${fmt4(scannedResults)} results</div>`;
    pushToast(toast);
  }
  function showPlayerAddedToast(player, playerId, pumbility) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<div class="title">${esc2(displayName(player))}: <span class="new">player added</span></div><div class="line">ID ${esc2(playerId)}</div><div class="line">PUMBILITY ${fmt4(pumbility)}</div>`;
    pushToast(toast);
  }
  function showOwnPlayerToast(player, playerId) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<div class="title">${esc2(displayName(player))}: <span class="new">you are recognized</span></div><div class="line">ID ${esc2(playerId)}</div>`;
    pushToast(toast);
  }
  function showPumbilityToast(player, pumbility, prevPumbility) {
    const toast = document.createElement("div");
    toast.className = "toast";
    const change = prevPumbility === null ? '<span class="new">NEW</span>' : fmtDelta2(pumbility - prevPumbility);
    toast.innerHTML = `<div class="title">${esc2(displayName(player))}: PUMBILITY</div><div class="line">${fmtScore2(pumbility, prevPumbility)} (${change})</div>`;
    pushToast(toast);
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
      if (text(link).replace(/\s+/g, " ") !== "My Sessions")
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
  var GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var knownOwnPlayerId = null;
  function accountUsername() {
    return text(document.querySelector(".shell-menu-caption")).match(/^(.+?)\s*\(/)?.[1] ?? null;
  }
  function pagePlayerId() {
    const segment = location.pathname.match(/^\/Player\/([^/]+)(?:\/|$)/)?.[1];
    if (!segment)
      return null;
    const id = decodeURIComponent(segment);
    if (GUID_RE.test(id))
      return id;
    const username = accountUsername();
    return username && id.toLowerCase() === username.toLowerCase() ? knownOwnPlayerId : null;
  }
  var playerNameFor = (playerId, ownPlayerId, pageName) => (playerId === ownPlayerId ? accountUsername() : null) || pageName;
  async function saveOwnName(ownPlayerId) {
    const name = accountUsername();
    if (!ownPlayerId || !name)
      return;
    const { players } = await chrome.storage.local.get("players");
    if (players?.[ownPlayerId]?.name === name)
      return;
    await chrome.storage.local.set({ players: { ...players || {}, [ownPlayerId]: { ...players?.[ownPlayerId], name } } });
    console.log(`${TAG} Saved own name "${name}" for player ID ${ownPlayerId}`);
    if (!players?.[ownPlayerId])
      showOwnPlayerToast(name, ownPlayerId);
  }
  async function mergeOwnAlias(ownPlayerId) {
    const alias = accountUsername();
    if (!ownPlayerId || !alias)
      return;
    const { players, results, preferences } = await chrome.storage.local.get(["players", "results", "preferences"]);
    const updates = {};
    if (players?.[alias]) {
      const { [alias]: aliasInfo, ...rest } = players;
      updates.players = { ...rest, [ownPlayerId]: { ...aliasInfo, ...rest[ownPlayerId] } };
    }
    let resultsChanged = false;
    const merged = { ...results || {} };
    for (const [key, scores] of Object.entries(merged)) {
      if (!scores || !(alias in scores))
        continue;
      const { [alias]: aliasScore, ...rest } = scores;
      rest[ownPlayerId] = mergeScoreRecords(aliasScore, rest[ownPlayerId]);
      merged[key] = rest;
      resultsChanged = true;
    }
    if (resultsChanged)
      updates.results = merged;
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
    await saveOwnName(id);
    return id;
  }
  var laterDate = (a, b) => (!a || b && b > a ? b : a) ?? null;
  function saveScoreTry(scores, playerId, score, date) {
    if (!playerId || score === null)
      return null;
    const prev = scores[playerId] || null;
    const record = { ...prev };
    const lastTryDate = laterDate(prev?.lastTryDate, date);
    if (lastTryDate)
      record.lastTryDate = lastTryDate;
    const improved = score > (prev?.bestScore ?? -1);
    if (improved) {
      record.bestScore = score;
      if (date)
        record.bestScoreDate = date;
      else
        delete record.bestScoreDate;
    }
    if (improved || record.lastTryDate !== prev?.lastTryDate)
      scores[playerId] = record;
    if (!improved)
      return null;
    const prevScore = prev?.bestScore ?? null;
    return { prevScore, change: prevScore === null ? "new" : "upd" };
  }
  function mergeScoreRecords(a, b) {
    if (!a || !b)
      return a || b;
    const best = b.bestScore > a.bestScore ? b : a;
    const record = { bestScore: best.bestScore };
    if (best.bestScoreDate)
      record.bestScoreDate = best.bestScoreDate;
    const lastTryDate = laterDate(a.lastTryDate, b.lastTryDate);
    if (lastTryDate)
      record.lastTryDate = lastTryDate;
    return record;
  }
  var lastPumbilityLog = null;
  function logPumbility(message) {
    if (message === lastPumbilityLog)
      return;
    lastPumbilityLog = message;
    console.log(`${TAG} PUMBILITY ${message}`);
  }
  async function savePlayerInfo(playerId, pageName, pumbility, ownPlayerId, source, allowNewPlayer = false) {
    if (!pageName && pumbility === null)
      return;
    const { players } = await chrome.storage.local.get("players");
    const isNew = !isKnownPlayer(players, playerId, ownPlayerId);
    if (!allowNewPlayer && isNew) {
      logPumbility(`found for ${pageName || playerId} (${playerId}) on ${source}: not a known player, skipping`);
      return;
    }
    const prev = players?.[playerId] || {};
    const player = { ...prev };
    const name = playerNameFor(playerId, ownPlayerId, pageName);
    if (name)
      player.name = name;
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
    if (raised)
      player.pumbility = pumbility;
    if (player.name === prev.name && player.pumbility === prev.pumbility)
      return;
    await chrome.storage.local.set({ players: { ...players || {}, [playerId]: player } });
    if (isNew) {
      showPlayerAddedToast(player.name || playerId, playerId, player.pumbility ?? null);
    } else if (raised) {
      const label = playerId === ownPlayerId ? "You" : player.name || playerId;
      showPumbilityToast(label, pumbility, prevPumbility);
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
  async function runProfilePage(ownPlayerId) {
    const playerId = profilePlayerId();
    if (!playerId)
      return;
    const profileHeader = document.querySelector('[data-testid="player-hero"]');
    await savePlayerInfo(
      playerId,
      text(profileHeader?.querySelector("h5")),
      parseNumber(text(profileHeader?.querySelector(".ph-pum .cmp-hero-num"))),
      ownPlayerId,
      "profile page"
    );
  }

  // src/page_scrappers/rivals.js
  var SESSIONS_LINK_ATTR = "data-piuscores-sessions";
  var STORED_ROSTER_ATTR = "data-piuscores-stored-roster";
  function isRivalsPage() {
    return /^\/Rivals\/?$/i.test(location.pathname);
  }
  var nameKey = (name) => displayName(name).toLowerCase();
  function rivalIdsByName(players) {
    const exact = /* @__PURE__ */ new Map();
    const loose = /* @__PURE__ */ new Map();
    const add = (name, playerId) => {
      if (!name || !playerId)
        return;
      if (!exact.has(name))
        exact.set(name, playerId);
      const key = nameKey(name);
      if (loose.has(key) && loose.get(key) !== playerId)
        loose.set(key, null);
      else
        loose.set(key, playerId);
    };
    for (const [playerId, player] of Object.entries(players || {}))
      add(player?.name, playerId);
    return (name) => exact.get(name) ?? loose.get(nameKey(name)) ?? null;
  }
  function createSessionsLink(compareButton, playerId) {
    const link = document.createElement("a");
    link.setAttribute(SESSIONS_LINK_ATTR, playerId);
    link.href = `/Player/${encodeURIComponent(playerId)}/Sessions`;
    link.className = compareButton?.className || "mud-button-root mud-button mud-button-outlined mud-button-outlined-primary mud-button-outlined-size-small";
    link.classList.remove("mud-ripple");
    link.style.textDecoration = "none";
    link.innerHTML = '<span class="mud-button-label">Sessions</span>';
    return link;
  }
  function storedOnlyRow(playerId, player) {
    const name = typeof player?.name === "string" && player.name ? player.name : playerId;
    const row = document.createElement("div");
    row.className = "rvl-row";
    row.style.opacity = "0.75";
    const avatar = document.createElement("div");
    avatar.className = "mud-avatar mud-avatar-medium mud-avatar-filled mud-avatar-filled-default mud-elevation-0";
    avatar.textContent = displayName(name).charAt(0).toUpperCase();
    const main = document.createElement("div");
    main.className = "rvl-row-main";
    const nameEl = document.createElement("div");
    nameEl.className = "rvl-row-name";
    nameEl.textContent = name;
    const meta = document.createElement("div");
    meta.className = "rvl-row-meta";
    meta.textContent = typeof player?.pumbility === "number" ? `Stored only \xB7 PUMBILITY ${player.pumbility.toLocaleString("en-US")}` : "Stored only";
    main.append(nameEl, meta);
    row.append(avatar, main, createSessionsLink(null, playerId));
    return row;
  }
  function renderStoredOnly(roster, players, ownPlayerId, rosterIds) {
    const existing = document.querySelector(`[${STORED_ROSTER_ATTR}]`);
    const activeTab = text(document.querySelector(".mud-tab.mud-tab-active"));
    const storedOnly = roster && (!activeTab || activeTab === "Your rivals") ? Object.entries(players || {}).filter(([playerId]) => playerId !== ownPlayerId && !rosterIds.has(playerId)).sort(([, a], [, b]) => (b?.pumbility ?? -1) - (a?.pumbility ?? -1) || String(a?.name ?? "").localeCompare(String(b?.name ?? ""))) : [];
    if (!storedOnly.length) {
      existing?.remove();
      return;
    }
    const signature = JSON.stringify(storedOnly.map(([playerId, p]) => [playerId, p?.name, p?.pumbility]));
    if (existing?.getAttribute(STORED_ROSTER_ATTR) === signature && existing.previousElementSibling === roster)
      return;
    existing?.remove();
    const block = document.createElement("div");
    block.setAttribute(STORED_ROSTER_ATTR, signature);
    block.style.marginTop = "16px";
    const caption = document.createElement("div");
    caption.className = "rvl-row-meta";
    caption.style.margin = "0 0 8px 4px";
    caption.textContent = "Stored in piuscores, but not your rivals on the site";
    const list = document.createElement("div");
    list.className = "rvl-roster";
    list.append(...storedOnly.map(([playerId, player]) => storedOnlyRow(playerId, player)));
    block.append(caption, list);
    roster.after(block);
  }
  async function runRivalsPage() {
    if (!isRivalsPage())
      return;
    const roster = document.querySelector('[data-testid="rival-roster"]');
    const rows = roster ? roster.querySelectorAll(".rvl-row") : [];
    const { players, ownPlayerId } = await chrome.storage.local.get(["players", "ownPlayerId"]);
    const rivalId = rivalIdsByName(players);
    const rosterIds = /* @__PURE__ */ new Set();
    for (const row of rows) {
      const playerId = rivalId(text(row.querySelector(".rvl-row-name")));
      if (playerId)
        rosterIds.add(playerId);
      const existing = row.querySelector(`[${SESSIONS_LINK_ATTR}]`);
      if (existing?.getAttribute(SESSIONS_LINK_ATTR) === playerId)
        continue;
      existing?.remove();
      if (!playerId)
        continue;
      const compare = [...row.querySelectorAll("button")].find((button) => text(button) === "Compare");
      const link = createSessionsLink(compare, playerId);
      if (compare)
        compare.after(link);
      else
        row.append(link);
    }
    renderStoredOnly(roster, players, ownPlayerId, rosterIds);
  }

  // src/page_scrappers/sessions_list.js
  var isNewestSessionOpen = () => !!document.querySelector('[data-testid="session-card"]')?.classList.contains("sbd-card-now") && !findPageButton("newer");
  function getSessionCards() {
    return [...document.querySelectorAll('[data-testid="session-card"]')];
  }
  function getSessionCardMix(card) {
    const meta = text(card.querySelector(".sbd-card-meta")).replace(/\s+/g, " ");
    if (/^Phoenix 2(?:\s|$)/i.test(meta))
      return "Phoenix 2";
    if (/^Phoenix(?:\s|$)/i.test(meta))
      return "Phoenix";
    return null;
  }
  function getPhoenix2CardInfoOrNull(card) {
    if (getSessionCardMix(card) !== "Phoenix 2")
      return null;
    const meta = text(card.querySelector(".sbd-card-meta")).replace(/\s+/g, " ");
    const title = meta.replace(/^Phoenix 2\s*(?:·|-)?\s*/i, "").trim();
    const timestamp = text(card.querySelector(".sbd-card-when")).replace(/\s+/g, " ");
    if (!title || !timestamp)
      return null;
    return { title, timestamp };
  }
  function currentPhoenix2Sessions() {
    const sessions = [];
    for (const card of getSessionCards()) {
      const mix = getSessionCardMix(card);
      if (mix === "Phoenix")
        return { sessions, reachedOlderMix: true };
      if (mix !== "Phoenix 2")
        continue;
      const info = getPhoenix2CardInfoOrNull(card);
      if (info)
        sessions.push({ card, info });
    }
    return { sessions, reachedOlderMix: false };
  }
  function sessionCardSignature() {
    return JSON.stringify(getSessionCards().map((card) => getPhoenix2CardInfoOrNull(card) || text(card)));
  }
  function sessionCheckpointMatches(checkpoint, info) {
    return checkpoint?.title === info.title && checkpoint?.timestamp === info.timestamp;
  }
  function parseCardTimestamp(timestamp) {
    const match = timestamp.match(/\b(\d{1,2})\s+([A-Za-z]{3})\s*·\s*(\d{1,2}):(\d{2})\s*([AP])M\b/i);
    if (!match)
      return null;
    const [, day, month, hours, minutes, half] = match;
    return {
      date: `${Number(day)} ${month.toLowerCase()}`,
      minutes: (Number(hours) % 12 + (half.toUpperCase() === "P" ? 12 : 0)) * 60 + Number(minutes)
    };
  }
  function findGrownSession(checkpoint, sessions) {
    const first = sessions[0]?.info;
    if (!checkpoint || !first || findPageButton("newer"))
      return null;
    if (sessions.some(({ info }) => sessionCheckpointMatches(checkpoint, info)))
      return null;
    const was = parseCardTimestamp(checkpoint.timestamp);
    const now = parseCardTimestamp(first.timestamp);
    return first.title === checkpoint.title && was && now && was.date === now.date && now.minutes > was.minutes ? first : null;
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
  async function clickPageButton(button, direction) {
    if (!button)
      return false;
    const before = sessionCardSignature();
    button.click();
    await waitForChange(() => sessionCardSignature() !== before, `${direction} Sessions page`);
    return true;
  }
  function findCurrentCard(info) {
    return currentPhoenix2Sessions().sessions.find((item) => sessionCheckpointMatches(info, item.info))?.card || null;
  }

  // src/page_scrappers/sessions_content.js
  function isSessionsPage() {
    return /^\/Player\/[^/]+\/Sessions\/?$/.test(location.pathname);
  }
  function sessionPagePlayerId() {
    return isSessionsPage() ? pagePlayerId() : null;
  }
  function pagePlayerName() {
    return text(document.querySelector("main h5")).replace(/\s+[—–-]\s+Sessions$/i, "").trim();
  }
  var readOpenSessionPumbility = () => parseNumber(text(document.querySelector(
    '[data-testid="session-ceremony"] .sbd-pumb-big'
  )));
  function readSessionsPage() {
    const playerId = sessionPagePlayerId();
    if (!playerId || getSessionCards().length === 0)
      return null;
    return { playerId, name: pagePlayerName(), pumbility: isNewestSessionOpen() ? readOpenSessionPumbility() : null };
  }
  function parsePlayScore(element) {
    const p = element?.querySelector('[data-testid="peer-score"] p');
    if (!p)
      return null;
    const n = parseInt(p.textContent.replace(/[^\d]/g, ""), 10);
    return Number.isNaN(n) ? null : n;
  }
  function isPhoenix2Chart(element) {
    return /\/difficulty\/Phoenix2\//i.test(element?.getAttribute("src") || "");
  }
  function parseSummaryDate(summary) {
    const match = (summary.split("\xB7")[1] || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/);
    if (!match)
      return null;
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  function scrapeSessionScores() {
    const highlights = document.querySelector('[data-testid="session-highlight-cards"]');
    const allPlays = document.querySelector('[data-testid="session-all-plays"]');
    if (!highlights && !allPlays)
      return null;
    const summary = text(document.querySelector('[data-testid="session-hero"] .sbd-hero-when'));
    const mix = summary.split("\xB7")[0].trim();
    if (mix !== "Phoenix 2")
      return null;
    const date = parseSummaryDate(summary);
    if (!date)
      console.warn(`${TAG} Unable to parse the session date from "${summary}"`);
    const rowsByChart = /* @__PURE__ */ new Map();
    const addScore = (track, chart, score) => {
      if (!track || !isScrapLevel(chart) || score === null)
        return false;
      const row = { track, chart, score };
      const key = storageKey(row);
      if (score > (rowsByChart.get(key)?.score ?? -1))
        rowsByChart.set(key, row);
      return true;
    };
    for (const card of highlights?.querySelectorAll('[data-testid="session-highlight-card"]') || []) {
      const difficulty = card.querySelector("img.difficulty-bubble");
      if (!isPhoenix2Chart(difficulty))
        continue;
      addScore(
        text(card.querySelector(".hl-card-song")),
        difficulty.getAttribute("alt") || "",
        parsePlayScore(card)
      );
    }
    const playRows = [...allPlays?.querySelectorAll('[data-testid="session-score-row"]') || []];
    let scrapedScores = 0;
    for (const row of playRows) {
      const difficulty = row.querySelector("img.difficulty-bubble");
      if (!isPhoenix2Chart(difficulty))
        continue;
      if (addScore(
        text(row.querySelector('[data-testid="session-row-chart"]')),
        difficulty.getAttribute("alt") || "",
        parsePlayScore(row)
      ))
        scrapedScores++;
    }
    return {
      playerId: pagePlayerId(),
      date,
      rows: [...rowsByChart.values()],
      scannedResults: playRows.length,
      scrapedScores
    };
  }
  function sameSessionTime(cardTimestamp, summary) {
    const cardDate = cardTimestamp.match(/\b(\d{1,2})\s+([A-Za-z]{3})\s*·\s*(\d{1,2}:\d{2}\s*[AP]M)\b/i);
    const summaryDate = summary.match(/\b(\d{1,2})\/(\d{1,2})\/\d{4}\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
    if (!cardDate || !summaryDate)
      return false;
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return Number(cardDate[1]) === Number(summaryDate[2]) && months.indexOf(cardDate[2].toLowerCase()) + 1 === Number(summaryDate[1]) && cardDate[3].replace(/\s+/g, "").toLowerCase() === summaryDate[3].replace(/\s+/g, "").toLowerCase();
  }
  function openSessionMismatches(info) {
    const header = document.querySelector('[data-testid="session-hero"]');
    if (!header)
      return ["session header is missing"];
    const summary = text(header.querySelector(".sbd-hero-when"));
    const sessionTitle = text(header.querySelector(".sbd-hero-title"));
    const mix = summary.split("\xB7")[0].trim();
    const cardTitle = info.title.split("\xB7")[0].trim();
    const mismatches = [];
    if (mix !== "Phoenix 2")
      mismatches.push(`mix: opened "${mix}", expected "Phoenix 2"`);
    if (sessionTitle !== cardTitle)
      mismatches.push(`title: opened "${sessionTitle}", card "${cardTitle}"`);
    if (!sameSessionTime(info.timestamp, summary)) {
      mismatches.push(`date: opened "${summary}", card "${info.timestamp}"`);
    }
    if (!document.querySelector('[data-testid="session-all-plays"]'))
      mismatches.push("all plays list is missing");
    return mismatches;
  }
  async function loadSessionContent(info) {
    try {
      await waitForChange(() => openSessionMismatches(info).length === 0, `session "${info.title}" to open`);
    } catch (error) {
      console.error(`${TAG} Session "${info.title}" (${info.timestamp}) didn't open:
  ` + openSessionMismatches(info).join("\n  "));
      throw error;
    }
    const showAll = document.querySelector('[data-testid="session-show-all-plays"]');
    if (showAll) {
      showAll.click();
      await waitForChange(
        () => {
          if (!document.querySelector('[data-testid="session-show-all-plays"]'))
            return true;
          const tally = [...document.querySelectorAll('[data-testid="session-hero"] .sbd-tally > div')].find((item) => text(item.querySelector(".sbd-tally-k")) === "Plays");
          const total = parseInt(text(tally?.querySelector(".sbd-tally-v")).replace(/[^\d]/g, ""), 10);
          return Number.isFinite(total) && document.querySelectorAll('[data-testid="session-score-row"]').length >= total;
        },
        `all plays for "${info.title}" to load`
      );
    }
  }

  // src/page_scrappers/session_scores.js
  var lastSignature = null;
  async function saveSessionScores(result, playerName, ownPlayerId, allowNewPlayer = false) {
    const playerId = result.playerId;
    if (!playerId) {
      console.warn(`${TAG} Unable to identify the player ID for session scores`);
      return;
    }
    const stored = await chrome.storage.local.get(["results", "players"]);
    if (!allowNewPlayer && !isKnownPlayer(stored.players, playerId, ownPlayerId))
      return;
    const signature = JSON.stringify({ sessions: result, ownPlayerId });
    if (signature === lastSignature)
      return;
    lastSignature = signature;
    const updates = {};
    const events = [];
    const results = { ...stored.results || {} };
    let resultsChanged = false;
    if (playerName) {
      const players = { ...stored.players || {} };
      if (players[playerId]?.name !== playerName) {
        players[playerId] = { ...players[playerId], name: playerName };
        updates.players = players;
      }
    }
    for (const row of result.rows) {
      const key = storageKey(row);
      const scores = { ...results[key] || {} };
      const scoreUpdate = saveScoreTry(scores, playerId, row.score, result.date);
      if (scores[playerId] === results[key]?.[playerId])
        continue;
      results[key] = scores;
      resultsChanged = true;
      if (scoreUpdate)
        events.push({
          kind: "rival",
          change: scoreUpdate.change,
          track: row.track,
          chart: row.chart,
          player: playerId === ownPlayerId ? "You" : playerName || playerId,
          score: row.score,
          prevScore: scoreUpdate.prevScore,
          delta: null
        });
    }
    if (resultsChanged)
      updates.results = results;
    if (Object.keys(updates).length)
      await chrome.storage.local.set(updates);
    if (events.length === 0)
      return;
    const player = playerId === ownPlayerId ? "You" : playerName || playerId;
    console.log(`${TAG} sessions: ${player}, ${events.length} best-score update(s)`);
    console.table(events.map((event) => ({
      type: event.change,
      track: event.track,
      chart: event.chart,
      player,
      score: event.score,
      prevScore: event.prevScore
    })));
    showToast(player, events);
  }
  async function saveScrapProgress(playerId, playerName, info, scrapedScores, isNewSession) {
    const stored = await chrome.storage.local.get(["players"]);
    const players = { ...stored.players || {} };
    const scrapStats = players[playerId]?.scrapStats || {};
    players[playerId] = {
      ...players[playerId],
      lastScrapedSession: info,
      scrapStats: {
        scores: (scrapStats.scores || 0) + scrapedScores,
        sessions: (scrapStats.sessions || 0) + (isNewSession ? 1 : 0)
      }
    };
    if (playerName)
      players[playerId].name = playerName;
    await chrome.storage.local.set({ players });
  }
  async function scrapeSession(card, info, playerId, pageName, isNewSession) {
    card.click();
    await loadSessionContent(info);
    const result = scrapeSessionScores();
    if (!result)
      throw new Error(`Unable to parse Phoenix 2 session "${info.title}"`);
    if (result.playerId !== playerId)
      throw new Error("Session player changed while scraping");
    const ownPlayerId = await syncOwnPlayerId();
    const playerName = playerNameFor(playerId, ownPlayerId, pageName);
    await saveSessionScores(result, playerName, ownPlayerId, true);
    await saveScrapProgress(playerId, playerName, info, result.scrapedScores, isNewSession);
    showSessionToast(
      playerName || playerId,
      info.title,
      info.timestamp,
      result.scannedResults
    );
    return result.scrapedScores;
  }

  // src/page_scrappers/sessions.js
  var isScrapingSessions = false;
  async function saveNewestSessionPumbility(ownPlayerId) {
    const playerId = sessionPagePlayerId();
    if (!playerId)
      return;
    const pumbility = readOpenSessionPumbility();
    if (pumbility === null)
      return;
    if (!isNewestSessionOpen()) {
      logPumbility(`found ${pumbility} for ${pagePlayerName() || playerId} (${playerId}) on Sessions page: not the newest session, ignoring`);
      return;
    }
    await savePlayerInfo(playerId, pagePlayerName(), pumbility, ownPlayerId, "Sessions page");
  }
  async function addNewPlayer(playerId, report) {
    report("Adding player");
    if (isNewestSessionOpen()) {
      await waitForChange(() => readOpenSessionPumbility() !== null, "PUMBILITY", 3e3).catch((error) => console.warn(TAG, error.message));
    }
    const pumbility = isNewestSessionOpen() ? readOpenSessionPumbility() : null;
    await savePlayerInfo(playerId, pagePlayerName(), pumbility, await syncOwnPlayerId(), "Sessions page", true);
  }
  async function scrapePlayerSessions(report = () => {
  }) {
    const playerId = sessionPagePlayerId();
    if (!playerId)
      throw new Error("Grabbing scores is only available on a player Sessions page");
    if (isScrapingSessions)
      return;
    isScrapingSessions = true;
    try {
      const stored = await chrome.storage.local.get(["players", "ownPlayerId"]);
      if (!isKnownPlayer(stored.players, playerId, stored.ownPlayerId))
        await addNewPlayer(playerId, report);
      const checkpoint = stored.players?.[playerId]?.lastScrapedSession || null;
      const pages = [];
      const seenPages = /* @__PURE__ */ new Set();
      let checkpointFound = !checkpoint;
      let reachedOlderMixBoundary = false;
      let grown = null;
      const countFound = () => pages.reduce((sum, page) => sum + page.length, 0);
      const reportFound = () => report(`Searching sessions, ${countFound()} found...`);
      if (!checkpoint) {
        let signature = sessionCardSignature();
        while (!seenPages.has(signature)) {
          seenPages.add(signature);
          const page = currentPhoenix2Sessions();
          pages.push(page.sessions.map(({ info }) => info));
          reportFound();
          if (page.reachedOlderMix)
            break;
          const next = findPageButton("older");
          if (!next)
            break;
          await clickPageButton(next, "older");
          signature = sessionCardSignature();
        }
      } else {
        grown = findGrownSession(checkpoint, currentPhoenix2Sessions().sessions);
        if (grown) {
          pages.push([grown]);
          checkpointFound = true;
          reportFound();
        }
        let signature = sessionCardSignature();
        while (!grown && !seenPages.has(signature)) {
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
          reportFound();
          if (checkpointFound || currentPage.reachedOlderMix) {
            reachedOlderMixBoundary = currentPage.reachedOlderMix;
            break;
          }
          const next = findPageButton("older");
          if (!next)
            break;
          await clickPageButton(next, "older");
          signature = sessionCardSignature();
        }
      }
      if (checkpoint && !checkpointFound && !reachedOlderMixBoundary) {
        throw new Error("Saved session checkpoint was not found in the Sessions history");
      }
      const total = countFound();
      const playerName = pagePlayerName();
      let scrapedSessions = 0;
      let scrapedResults = 0;
      for (let pageIndex = pages.length - 1; pageIndex >= 0; pageIndex--) {
        for (const info of [...pages[pageIndex]].reverse()) {
          const card = findCurrentCard(info);
          if (!card)
            throw new Error(`Session "${info.title}" is no longer visible on its page`);
          report(`Scrapping session ${scrapedSessions + 1} of ${total}...`);
          scrapedResults += await scrapeSession(card, info, playerId, playerName, info !== grown);
          scrapedSessions++;
        }
        if (pageIndex > 0) {
          const newer = findPageButton("newer");
          if (!newer)
            throw new Error("Unable to return to newer Sessions pages");
          await clickPageButton(newer, "newer");
        }
      }
      if (scrapedSessions)
        await saveNewestSessionPumbility(await syncOwnPlayerId());
      const plural2 = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
      report(`Finished scrapping ${plural2(scrapedSessions, "session")} with ${plural2(scrapedResults, "result")}`);
      await recordSessionsVisit();
      return true;
    } finally {
      isScrapingSessions = false;
    }
  }
  function countNewSessions(checkpoint) {
    const { sessions, reachedOlderMix } = currentPhoenix2Sessions();
    const index = checkpoint ? sessions.findIndex(({ info }) => sessionCheckpointMatches(checkpoint, info)) : -1;
    if (index >= 0)
      return { count: index, more: false };
    if (findGrownSession(checkpoint, sessions))
      return { count: 1, more: false };
    return { count: sessions.length, more: !reachedOlderMix && !!findPageButton("older") };
  }
  async function recordSessionsVisit() {
    const playerId = sessionPagePlayerId();
    if (!playerId)
      return;
    const { players, ownPlayerId } = await chrome.storage.local.get(["players", "ownPlayerId"]);
    if (!isKnownPlayer(players, playerId, ownPlayerId))
      return;
    await chrome.storage.local.set({
      players: { ...players, [playerId]: { ...players[playerId], sessionsVisitedAt: Date.now() } }
    });
  }
  async function runSessionsPage(ownPlayerId) {
    await saveNewestSessionPumbility(ownPlayerId);
  }

  // src/content.js
  var rivalsWindow = createRivalsWindow(exportTargets, pagePlayerId);
  var scrapOverlay = createScrapOverlay({
    scrapeResults: scrapePlayerSessions,
    readSessionsPage,
    countNewSessions,
    onNothingToGrab: () => recordSessionsVisit().catch((error) => console.error(TAG, error))
  });
  var timer = null;
  async function run() {
    const ownPlayerId = await syncOwnPlayerId();
    if (isRivalsPage()) {
      await runRivalsPage();
      return;
    }
    if (isSessionsPage()) {
      await runSessionsPage(ownPlayerId);
      return;
    }
    await runProfilePage(ownPlayerId);
  }
  chrome.storage.onChanged.addListener((_, area) => {
    if (area !== "local")
      return;
    if (rivalsWindow.isOpen())
      rivalsWindow.render().catch((error) => console.error(TAG, error));
    scrapOverlay.reload().catch((error) => console.error(TAG, error));
  });
  var pending = migrateStorage().then(() => {
    rivalsWindow.initialize();
    return scrapOverlay.reload();
  }).catch((error) => console.error(TAG, error));
  var schedule = () => {
    scrapOverlay.update();
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = pending.then(run).catch((error) => console.error(TAG, error));
    }, 500);
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
