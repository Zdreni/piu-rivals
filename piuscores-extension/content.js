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

  // Creates (or re-attaches) the shadow host holding the toast stack and the export button.
  function getUi() {
    if (uiHost) {
      if (!uiHost.isConnected) document.body.appendChild(uiHost);
      return uiHost.shadowRoot;
    }
    uiHost = document.createElement('div');
    const shadow = uiHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .export { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647;
                  background: #14201A; color: #4FE33F; border: 1px solid #4FE33F; border-radius: 6px;
                  padding: 8px 12px; font: 600 13px/1 Roboto, Arial, sans-serif; cursor: pointer;
                  box-shadow: 0 4px 14px rgba(0,0,0,.5); }
        .export:hover { background: #1C2B22; }
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
      <button class="export" type="button" title="Download charts where rivals beat you or you have no score">Export targets</button>`;
    shadow.querySelector('.export').addEventListener('click', () => {
      exportTargets().catch((e) => console.error(TAG, e));
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
      // Sort weight: sum of sqrt(|difference|), so many small deficits can outrank one big one.
      // Charts where I have no score contribute 0.
      const weight = entries.reduce((acc, r) => acc + Math.sqrt(Math.abs(r.difference ?? 0)), 0);
      if (entries.length) charts.push({ track, chart, entries, weight });
    }

    // Heaviest first; ties (e.g. no-score-only charts at 0) by track name
    charts.sort((a, b) => b.weight - a.weight || a.track.localeCompare(b.track));

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
