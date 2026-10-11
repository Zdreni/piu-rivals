// Scrapes the rival comparison table on a player page (/Player/<id>), stores my score and each
// rival's score per chart, and notifies only about what changed since the last stored state.
// The site is Blazor Server: content is rendered after load and re-rendered on folder change,
// so we watch the DOM and re-scrape (debounced).

(() => {
  const TAG = '[piuscores]';
  let lastSignature = null;
  let timer = null;

  const text = (el) => (el ? el.textContent.trim() : '');

  function parseScore(cell) {
    const p = cell && cell.querySelector('.rvl-cmp-score p');
    if (!p) return null; // "—" means no score
    const n = parseInt(p.textContent.replace(/[^\d]/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }

  function scrape() {
    const table = document.querySelector('[data-testid="rival-compare-table"]');
    if (!table) return null;

    // Header columns: Chart | You | <rival name> | Difference
    const headers = table.querySelectorAll('thead th');
    const rival = text(headers[2]) || text(document.querySelector('[data-testid="player-hero"] h5'));

    const rows = [];
    for (const tr of table.querySelectorAll('tbody tr')) {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 3) continue;

      const songEl = cells[0].querySelector('.rvl-cmp-song');
      const track = songEl ? (songEl.getAttribute('title') || text(songEl)) : '';
      const chart = cells[0].querySelector('img.difficulty-bubble')?.getAttribute('alt') || '';

      rows.push({ track, chart, mine: parseScore(cells[1]), score: parseScore(cells[2]) });
    }
    return { rival, rows };
  }

  // Stored in chrome.storage.local, one entry per chart:
  //   "chart:<track>|<chart>" -> { mine: <score|null>, rivals: { <name>: <score> } }
  // `mine` is null when I have no score, and absent when it was never seen.
  const storageKey = (row) => `chart:${row.track}|${row.chart}`;

  // Copy of a stored entry (or an empty one), safe to mutate
  const normalize = (entry) => (entry && entry.rivals ? { ...entry, rivals: { ...entry.rivals } } : { rivals: {} });

  // Positive = I'm ahead, same sign convention as the site
  const delta = (mine, theirs) => (mine === null || mine === undefined || theirs === null ? null : mine - theirs);

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

      // Rival's score: new or changed -> delta against my current score
      if (row.score !== null && entry.rivals[rival] !== row.score) {
        const prevScore = entry.rivals[rival] ?? null;
        entry.rivals[rival] = row.score;
        events.push({
          kind: 'rival', change: prevScore === null ? 'new' : 'upd', track, chart, player: rival,
          score: row.score, prevScore, delta: delta(row.mine, row.score),
        });
      }

      // My score: new or changed -> deltas against every stored rival on this chart
      if (entry.mine !== row.mine) {
        const prevScore = entry.mine ?? null;
        entry.mine = row.mine;
        if (row.mine !== null) {
          const deltas = Object.entries(entry.rivals)
            .map(([player, score]) => ({ player, score, delta: delta(row.mine, score) }))
            .sort((a, b) => a.delta - b.delta);
          events.push({
            kind: 'mine', change: prevScore === null ? 'new' : 'upd', track, chart,
            score: row.mine, prevScore, deltas,
          });
        }
      }

      if (JSON.stringify(entry) !== before) updates[key] = entry;
    }

    if (Object.keys(updates).length) await chrome.storage.local.set(updates);
    if (events.length === 0) return;

    console.log(`${TAG} rival: ${rival}, ${events.length} change(s)`);
    console.table(events.flatMap((e) => (e.kind === 'rival'
      ? [{ type: e.change, track: e.track, chart: e.chart, player: e.player, score: e.score, prevScore: e.prevScore, delta: e.delta }]
      : [
          { type: `mine ${e.change}`, track: e.track, chart: e.chart, player: 'You', score: e.score, prevScore: e.prevScore, delta: null },
          ...e.deltas.map((d) => ({ type: 'delta', track: e.track, chart: e.chart, player: d.player, score: d.score, prevScore: null, delta: d.delta })),
        ])));
    showToast(rival, events);
  }

  // ---- In-page notifications (shadow DOM so site styles don't leak in) ----

  const MAX_LINES = 8;
  const TOAST_MS = 5000;
  let uiHost = null;

  // Creates (or re-attaches) the shadow host holding the toast stack, the buttons and the scores window.
  function getUi() {
    if (uiHost) {
      if (!uiHost.isConnected) document.body.appendChild(uiHost);
      return uiHost.shadowRoot;
    }
    uiHost = document.createElement('div');
    const shadow = uiHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
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
        /* Level buttons in a left sidebar: one column per chart type (singles, doubles, ...) */
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
      </style>
      <div class="stack"></div>
      <div class="buttons">
        <button class="btn export" type="button" title="Download charts where rivals beat you or you have no score">Export targets</button>
        <button class="btn show-scores" type="button" title="Show all saved rival scores">Rival scores</button>
      </div>
      <div class="overlay" hidden>
        <div class="dialog" role="dialog" aria-label="Rival scores">
          <div class="dlg-head"><h2>Rival scores</h2><span class="dlg-count"></span>
            <button class="dlg-close" type="button" aria-label="Close">×</button></div>
          <div class="dlg-main">
            <div class="filters"></div>
            <div class="dlg-body"></div>
          </div>
        </div>
      </div>`;
    shadow.querySelector('.export').addEventListener('click', () => {
      exportTargets().catch((e) => console.error(TAG, e));
    });
    shadow.querySelector('.show-scores').addEventListener('click', () => openScores(shadow));
    shadow.querySelector('.dlg-close').addEventListener('click', () => closeScores(shadow));
    shadow.querySelector('.filters').addEventListener('click', (ev) => {
      const chip = ev.target.closest('.chip');
      if (!chip) return;
      selectedLevel = chip.dataset.level;
      renderScores(shadow).catch((e) => console.error(TAG, e));
    });
    document.body.appendChild(uiHost);
    return shadow;
  }

  const fmt = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));
  const fmtDelta = (n) => {
    if (n === null || n === undefined) return '<span>—</span>';
    const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
    return `<span class="${cls}">${n > 0 ? '+' : ''}${fmt(n)}</span>`;
  };
  const fmtScore = (score, prev) => (prev === null || prev === score ? fmt(score) : `${fmt(prev)} → ${fmt(score)}`);
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // One event can render to several lines (my score + a delta per rival)
  function eventLines(e) {
    const name = `${esc(e.track)} <b>${esc(e.chart)}</b>`;
    const badge = e.change === 'new' ? '<span class="new">NEW</span>' : '<span class="upd">UPD</span>';
    if (e.kind === 'rival') {
      return [`${badge} ${name} ${esc(e.player)}: ${fmtScore(e.score, e.prevScore)} (${fmtDelta(e.delta)})`];
    }
    // My score on its own line, then the new difference with each rival underneath
    return [
      `${badge} ${name} You: ${fmtScore(e.score, e.prevScore)}`,
      ...e.deltas.map((d) => `<span class="sub">${esc(d.player)}: ${fmt(d.score)} (${fmtDelta(d.delta)})</span>`),
    ];
  }

  function showToast(rival, events) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    const all = events.flatMap(eventLines);
    const lines = all.slice(0, MAX_LINES).map((l) => `<div class="line">${l}</div>`).join('');
    const more = all.length > MAX_LINES
      ? `<div class="more">…and ${all.length - MAX_LINES} more line(s) (see console)</div>` : '';
    toast.innerHTML = `<div class="title">${esc(rival)}: ${events.length} change(s)</div>${lines}${more}`;

    const close = () => {
      if (toast.classList.contains('out')) return;
      toast.classList.add('out');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 600); // fallback if transitionend doesn't fire
    };
    toast.addEventListener('click', close);
    setTimeout(close, TOAST_MS);
    getUi().querySelector('.stack').appendChild(toast);
  }

  // ---- Export: every stored chart where a rival is ahead of you, or you have no score ----

  // Sort weight: sum of sqrt(|difference|) over rivals ahead of me, so many small deficits can
  // outrank one big one. Rivals I beat, and charts where I have no score, contribute 0.
  const targetWeight = (diffs) => diffs.reduce((acc, d) => acc + (d !== null && d < 0 ? Math.sqrt(-d) : 0), 0);
  // Heaviest first. At weight 0, charts I haven't played (but rivals have) go before charts
  // where I'm best among rivals. Then by track name.
  const byTargetWeight = (a, b) =>
    b.weight - a.weight || Number(b.unplayed) - Number(a.unplayed) || a.track.localeCompare(b.track);

  async function exportTargets() {
    const all = await chrome.storage.local.get(null);
    const charts = [];

    for (const [key, raw] of Object.entries(all)) {
      if (!key.startsWith('chart:')) continue;
      const [track, chart] = key.slice('chart:'.length).split(/\|(?=[^|]*$)/);
      const { mine, rivals } = normalize(raw);

      const entries = Object.entries(rivals)
        .map(([rival, score]) => ({ rival, score, difference: delta(mine, score) }))
        .filter((r) => r.difference === null || r.difference < 0)
        .sort((a, b) => b.score - a.score);
      if (entries.length) {
        charts.push({
          track, chart, entries, unplayed: mine === null || mine === undefined,
          weight: targetWeight(entries.map((r) => r.difference)),
        });
      }
    }

    charts.sort(byTargetWeight);

    const lines = [`PIU Scores targets — ${new Date().toLocaleString()}`, `${charts.length} chart(s)`, ''];
    for (const { track, chart, entries } of charts) {
      lines.push(`${track}  ${chart}`);
      // Per-chart table: "name:" padded to the longest name, scores and differences right-aligned
      const nameW = Math.max(...entries.map((r) => r.rival.length)) + 1;
      const scoreW = Math.max(...entries.map((r) => fmt(r.score).length));
      const diffW = Math.max(0, ...entries.filter((r) => r.difference !== null).map((r) => fmt(r.difference).length));
      for (const r of entries) {
        const note = (r.difference === null ? '—' : fmt(r.difference)).padStart(diffW);
        lines.push(`  ${(r.rival + ':').padEnd(nameW)}  ${fmt(r.score).padStart(scoreW)}  ${note}`);
      }
      lines.push('');
    }

    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `piuscores-targets-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---- Rival scores window, filterable by chart level ----

  let selectedLevel = null; // set to the first level on first render

  // "S16" -> type "S", number 16. Anything unparsable is its own type.
  const levelType = (l) => (l.match(/^[A-Za-z]+/) || [l])[0];
  const levelNum = (l) => parseInt((l.match(/\d+/) || ['0'])[0], 10);

  // "S16" < "S17" < "D16" < ...: singles, doubles, then anything else; numeric within a type
  const TYPE_ORDER = { S: 0, D: 1 };
  function compareLevels(a, b) {
    const ta = levelType(a), tb = levelType(b);
    return (TYPE_ORDER[ta] ?? 9) - (TYPE_ORDER[tb] ?? 9) || ta.localeCompare(tb) || levelNum(a) - levelNum(b);
  }

  // Sort order makes three blocks: 0 = some rival ahead of me, 1 = not played by me, 2 = I'm best
  const chartTier = (c) => (c.weight > 0 ? 0 : c.unplayed ? 1 : 2);

  async function loadCharts() {
    const all = await chrome.storage.local.get(null);
    const charts = [];
    for (const [key, raw] of Object.entries(all)) {
      if (!key.startsWith('chart:')) continue;
      const [track, chart] = key.slice('chart:'.length).split(/\|(?=[^|]*$)/);
      const { mine, rivals } = normalize(raw);
      const list = Object.entries(rivals)
        .map(([player, score]) => ({ player, score, delta: delta(mine, score) }))
        .sort((a, b) => b.score - a.score);
      if (list.length) {
        charts.push({
          track, chart, mine: mine ?? null, rivals: list, unplayed: mine === null || mine === undefined,
          weight: targetWeight(list.map((r) => r.delta)),
        });
      }
    }
    return charts;
  }

  async function renderScores(shadow) {
    const charts = await loadCharts();
    const levels = [...new Set(charts.map((c) => c.chart))].sort(compareLevels);
    // Radio-style: exactly one level is always active; defaults to the first one
    if (!levels.includes(selectedLevel)) selectedLevel = levels[0] ?? null;

    // One column per chart type (singles, doubles, ...)
    // Per level, count charts in each block: some rival ahead of me (red), not played by me (blue),
    // I'm best (green) — the same split as the gaps in the table
    const stats = {};
    const statsFor = (key) => (stats[key] ||= { lose: 0, win: 0, unplayed: 0 });
    for (const c of charts) statsFor(c.chart)[['lose', 'unplayed', 'win'][chartTier(c)]]++;

    const stat = (cls, n) => `<span class="${cls}${n === 0 ? ' zero' : ''}">${n}</span>`;
    const chip = (label, level) => {
      const on = level === selectedLevel;
      const s = statsFor(level);
      return `<button class="chip${on ? ' on' : ''}" type="button" role="radio" aria-checked="${on}" data-level="${esc(level)}"><span>${esc(label)}</span>`
        + `<span class="chip-stats" title="charts: losing / not played / best">${stat('neg', s.lose)} / ${stat('blue', s.unplayed)} / ${stat('pos', s.win)}</span></button>`;
    };
    const types = [...new Set(levels.map(levelType))];
    shadow.querySelector('.filters').innerHTML = types.map((t) =>
      `<div class="filter-row" role="radiogroup">${
        levels.filter((l) => levelType(l) === t).map((l) => chip(l, l)).join('')}</div>`).join('');

    const visible = charts
      .filter((c) => c.chart === selectedLevel)
      .sort(byTargetWeight);
    shadow.querySelector('.dlg-count').textContent = `${visible.length} chart(s)`;

    const body = shadow.querySelector('.dlg-body');
    if (visible.length === 0) {
      body.innerHTML = '<div class="empty">No saved rival scores yet — open a rival\'s page to collect them.</div>';
      return;
    }

    // A gap row separates the blocks (see chartTier)
    const rows = visible.flatMap((c, ci) => {
      const gap = ci > 0 && chartTier(c) !== chartTier(visible[ci - 1]) ? ['<tr class="tier-gap"><td colspan="5"></td></tr>'] : [];
      return [...gap, ...chartRows(c)];
    });

    function chartRows(c) {
      // My score sits among the rivals' in score order (ahead of rivals on a tie), in yellow
      const list = [...c.rivals];
      if (c.mine !== null) list.push({ player: 'You', score: c.mine, me: true });
      list.sort((a, b) => b.score - a.score || (b.me ? 1 : 0) - (a.me ? 1 : 0));

      return list.map((r, i) => {
        const head = i === 0
          ? `<td class="track" rowspan="${list.length}" title="${esc(c.track)}">${esc(c.track)}</td>
             <td rowspan="${list.length}"><b>${esc(c.chart)}</b></td>`
          : '';
        // Zebra stripes per player within a chart. Odd rows only, so the track/chart cells
        // (which span from the plain first row) stay unstriped.
        const tr = i === 0 ? '<tr class="group">' : i % 2 ? '<tr class="alt">' : '<tr>';
        if (r.me) {
          return `${tr}${head}<td class="mine">You</td><td class="num mine">${fmt(r.score)}</td><td></td></tr>`;
        }
        const won = r.delta !== null && r.delta > 0 ? ' won' : ''; // rivals I beat are dimmed
        return `${tr}${head}<td class="${won}">${esc(r.player)}</td><td class="num${won}">${fmt(r.score)}</td><td class="num${won}">${fmtDelta(r.delta)}</td></tr>`;
      });
    }
    body.innerHTML = `<table>
      <thead><tr><th class="track">Track</th><th>Chart</th><th>Player</th><th class="num">Score</th><th class="num">Diff</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table>`;
  }

  const isScoresOpen = () => uiHost && !uiHost.shadowRoot.querySelector('.overlay').hidden;

  function openScores(shadow) {
    shadow.querySelector('.overlay').hidden = false;
    renderScores(shadow).catch((e) => console.error(TAG, e));
  }

  function closeScores(shadow) {
    shadow.querySelector('.overlay').hidden = true;
  }

  // Keep the window current while it's open (e.g. a scan just saved new scores)
  chrome.storage.onChanged.addListener((_, area) => {
    if (area === 'local' && isScoresOpen()) renderScores(uiHost.shadowRoot).catch((e) => console.error(TAG, e));
  });

  // Chain runs so two scrapes never read/write storage at the same time.
  let pending = Promise.resolve();
  const schedule = () => {
    getUi(); // keep the export button attached if the page re-renders
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = pending.then(run).catch((e) => console.error(TAG, e));
    }, 500);
  };

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
