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
  var storageKey = (row) => `chart:${row.track}|${row.chart}`;
  var normalize = (entry) => entry && entry.rivals ? { ...entry, rivals: { ...entry.rivals } } : { rivals: {} };
  var delta = (mine, theirs) => mine === null || mine === void 0 || theirs === null ? null : mine - theirs;
  var targetWeight = (diffs) => diffs.reduce((acc, d) => acc + (d !== null && d < 0 ? Math.sqrt(-d) : 0), 0);
  var byTargetWeight = (a, b) => b.weight - a.weight || Number(b.unplayed) - Number(a.unplayed) || a.track.localeCompare(b.track);
  async function loadCharts() {
    const all = await chrome.storage.local.get(null);
    const charts = [];
    for (const [key, raw] of Object.entries(all)) {
      if (!key.startsWith("chart:")) continue;
      const [track, chart] = key.slice("chart:".length).split(/\|(?=[^|]*$)/);
      const { mine, rivals } = normalize(raw);
      const list = Object.entries(rivals).map(([player, score]) => ({ player, score, delta: delta(mine, score) })).sort((a, b) => b.score - a.score);
      if (list.length) {
        charts.push({
          track,
          chart,
          mine: mine ?? null,
          rivals: list,
          unplayed: mine === null || mine === void 0,
          weight: targetWeight(list.map((r) => r.delta))
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
  var chartTier = (chart) => chart.weight > 0 ? 0 : chart.unplayed ? 1 : 2;
  var styles = `
  .buttons { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647; display: flex; gap: 8px; }
  .btn { background: #14201A; color: #4FE33F; border: 1px solid #4FE33F; border-radius: 6px;
         padding: 8px 12px; font: 600 13px/1 Roboto, Arial, sans-serif; cursor: pointer;
         box-shadow: 0 4px 14px rgba(0,0,0,.5); }
  .btn:hover { background: #1C2B22; }
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
  .dlg-body { overflow: auto; padding: 0 16px 12px; flex: 1; }
  table { border-collapse: collapse; }
  .track { width: 420px; min-width: 420px; max-width: 420px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mine { color: #FFC433; font-weight: 600; }
  .won { opacity: .4; }
  th { position: sticky; top: 0; background: #14201A; color: #9AB3A3; font-weight: 500;
       text-align: left; padding: 8px 6px; border-bottom: 1px solid #2B4034; }
  td { padding: 4px 6px; vertical-align: top; }
  tr.alt { background: rgba(255,255,255,.05); }
  tr.tier-gap td { height: 40px; padding: 0; }
  tbody tr.tier-gap + tr.group td { border-top: 3px solid #4FE33F33; }
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
    let selectedLevel = null;
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
      </div>
      <div class="overlay" hidden>
        <div class="dialog" role="dialog" aria-label="Rival scores">
          <div class="dlg-head"><h2>Rival scores</h2><span class="dlg-count"></span>
            <button class="dlg-close" type="button" aria-label="Close">\xD7</button></div>
          <div class="dlg-main"><div class="filters"></div><div class="dlg-body"></div></div>
        </div>
      </div>`;
      shadow.querySelector(".export").addEventListener("click", () => {
        exportTargets2().catch((error) => console.error("[piuscores]", error));
      });
      shadow.querySelector(".show-scores").addEventListener("click", () => open());
      shadow.querySelector(".dlg-close").addEventListener("click", () => close());
      shadow.querySelector(".filters").addEventListener("click", (event) => {
        const chip = event.target.closest(".chip");
        if (!chip) return;
        selectedLevel = chip.dataset.level;
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
        const tr = i === 0 ? '<tr class="group">' : i % 2 ? '<tr class="alt">' : "<tr>";
        if (rival.me) {
          return `${tr}${head}<td class="mine">You</td><td class="num mine">${fmt2(rival.score)}</td><td></td></tr>`;
        }
        const won = rival.delta !== null && rival.delta > 0 ? " won" : "";
        return `${tr}${head}<td class="${won}">${esc2(rival.player)}</td><td class="num${won}">${fmt2(rival.score)}</td><td class="num${won}">${fmtDelta2(rival.delta)}</td></tr>`;
      });
    }
    async function render() {
      const shadow = ensure();
      const charts = await loadCharts();
      const levels = [...new Set(charts.map((chart) => chart.chart))].sort(compareLevels);
      if (!levels.includes(selectedLevel)) selectedLevel = levels[0] ?? null;
      const stats = {};
      const statsFor = (key) => stats[key] ||= { lose: 0, win: 0, unplayed: 0 };
      for (const chart of charts) statsFor(chart.chart)[["lose", "unplayed", "win"][chartTier(chart)]]++;
      const stat = (cls, n) => `<span class="${cls}${n === 0 ? " zero" : ""}">${n}</span>`;
      const chip = (label) => {
        const on = label === selectedLevel;
        const counts = statsFor(label);
        return `<button class="chip${on ? " on" : ""}" type="button" role="radio" aria-checked="${on}" data-level="${esc2(label)}"><span>${esc2(label)}</span><span class="chip-stats" title="charts: losing / not played / best">${stat("neg", counts.lose)} / ${stat("blue", counts.unplayed)} / ${stat("pos", counts.win)}</span></button>`;
      };
      const types = [...new Set(levels.map(levelType))];
      shadow.querySelector(".filters").innerHTML = types.map((type) => `<div class="filter-row" role="radiogroup">${levels.filter((level) => levelType(level) === type).map(chip).join("")}</div>`).join("");
      const visible = charts.filter((chart) => chart.chart === selectedLevel).sort(byTargetWeight);
      shadow.querySelector(".dlg-count").textContent = `${visible.length} chart(s)`;
      const body = shadow.querySelector(".dlg-body");
      if (visible.length === 0) {
        body.innerHTML = `<div class="empty">No saved rival scores yet \u2014 open a rival's page to collect them.</div>`;
        return;
      }
      const rows = visible.flatMap((chart, index) => {
        const gap = index > 0 && chartTier(chart) !== chartTier(visible[index - 1]) ? ['<tr class="tier-gap"><td colspan="5"></td></tr>'] : [];
        return [...gap, ...chartRows(chart)];
      });
      body.innerHTML = `<table>
      <thead><tr><th class="track">Track</th><th>Chart</th><th>Player</th><th class="num">Score</th><th class="num">Diff</th></tr></thead>
      <tbody>${rows.join("")}</tbody></table>`;
    }
    function isOpen() {
      return Boolean(uiHost && !uiHost.shadowRoot.querySelector(".overlay").hidden);
    }
    function open() {
      ensure().querySelector(".overlay").hidden = false;
      render().catch((error) => console.error("[piuscores]", error));
    }
    function close() {
      ensure().querySelector(".overlay").hidden = true;
    }
    return { ensure, render, isOpen };
  }

  // src/export-targets.js
  var fmt3 = (n) => n === null || n === void 0 ? "\u2014" : n.toLocaleString("en-US");
  async function exportTargets() {
    const all = await chrome.storage.local.get(null);
    const charts = [];
    for (const [key, raw] of Object.entries(all)) {
      if (!key.startsWith("chart:")) continue;
      const [track, chart] = key.slice("chart:".length).split(/\|(?=[^|]*$)/);
      const { mine, rivals } = normalize(raw);
      const entries = Object.entries(rivals).map(([rival, score]) => ({ rival, score, difference: delta(mine, score) })).filter((r) => r.difference === null || r.difference < 0).sort((a2, b) => b.score - a2.score);
      if (entries.length) {
        charts.push({
          track,
          chart,
          entries,
          unplayed: mine === null || mine === void 0,
          weight: targetWeight(entries.map((r) => r.difference))
        });
      }
    }
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
  function parseScore(cell) {
    const p = cell && cell.querySelector(".rvl-cmp-score p");
    if (!p) return null;
    const n = parseInt(p.textContent.replace(/[^\d]/g, ""), 10);
    return Number.isNaN(n) ? null : n;
  }
  function scrape() {
    const table = document.querySelector('[data-testid="rival-compare-table"]');
    if (!table) return null;
    const headers = table.querySelectorAll("thead th");
    const rival = text(headers[2]) || text(document.querySelector('[data-testid="player-hero"] h5'));
    const rows = [];
    for (const tr of table.querySelectorAll("tbody tr")) {
      const cells = tr.querySelectorAll("td");
      if (cells.length < 3) continue;
      const songEl = cells[0].querySelector(".rvl-cmp-song");
      const track = songEl ? songEl.getAttribute("title") || text(songEl) : "";
      const chart = cells[0].querySelector("img.difficulty-bubble")?.getAttribute("alt") || "";
      rows.push({ track, chart, mine: parseScore(cells[1]), score: parseScore(cells[2]) });
    }
    return { rival, rows };
  }
  async function run() {
    const result = scrape();
    if (!result || result.rows.length === 0) return;
    const signature = JSON.stringify(result);
    if (signature === lastSignature) return;
    lastSignature = signature;
    const { rival } = result;
    const keys = [...new Set(result.rows.map(storageKey))];
    const stored = await chrome.storage.local.get(keys);
    const events = [];
    const updates = {};
    for (const row of result.rows) {
      const key = storageKey(row);
      const entry = updates[key] || normalize(stored[key]);
      const before = JSON.stringify(entry);
      const { track, chart } = row;
      if (row.score !== null && entry.rivals[rival] !== row.score) {
        const prevScore = entry.rivals[rival] ?? null;
        entry.rivals[rival] = row.score;
        events.push({
          kind: "rival",
          change: prevScore === null ? "new" : "upd",
          track,
          chart,
          player: rival,
          score: row.score,
          prevScore,
          delta: delta(row.mine, row.score)
        });
      }
      if (entry.mine !== row.mine) {
        const prevScore = entry.mine ?? null;
        entry.mine = row.mine;
        if (row.mine !== null) {
          const deltas = Object.entries(entry.rivals).map(([player, score]) => ({ player, score, delta: delta(row.mine, score) })).sort((a, b) => a.delta - b.delta);
          events.push({
            kind: "mine",
            change: prevScore === null ? "new" : "upd",
            track,
            chart,
            score: row.mine,
            prevScore,
            deltas
          });
        }
      }
      if (JSON.stringify(entry) !== before) updates[key] = entry;
    }
    if (Object.keys(updates).length) await chrome.storage.local.set(updates);
    if (events.length === 0) return;
    console.log(`${TAG} rival: ${rival}, ${events.length} change(s)`);
    console.table(events.flatMap((event) => event.kind === "rival" ? [{ type: event.change, track: event.track, chart: event.chart, player: event.player, score: event.score, prevScore: event.prevScore, delta: event.delta }] : [
      { type: `mine ${event.change}`, track: event.track, chart: event.chart, player: "You", score: event.score, prevScore: event.prevScore, delta: null },
      ...event.deltas.map((d) => ({ type: "delta", track: event.track, chart: event.chart, player: d.player, score: d.score, prevScore: null, delta: d.delta }))
    ]));
    showToast(ui.ensure(), rival, events);
  }
  chrome.storage.onChanged.addListener((_, area) => {
    if (area === "local" && ui.isOpen()) ui.render().catch((error) => console.error(TAG, error));
  });
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
