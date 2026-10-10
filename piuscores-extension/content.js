// Scrapes the rival comparison table on a player page (/Player/<id>), stores each rival's score and
// difference per chart, and logs only what changed since the last stored state.
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

  // "+2,113" / "−8" (Unicode minus) / empty when you have no score on the chart
  function parseDelta(cell) {
    const s = text(cell && cell.querySelector('.rvl-cmp-delta')).replace(/−/g, '-').replace(/[^\d+-]/g, '');
    const n = parseInt(s, 10);
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

      const score = parseScore(cells[2]);
      if (score === null) continue; // rival hasn't played this chart

      rows.push({ track, chart, rival, score, difference: parseDelta(cells[3]) });
    }
    return { rival, rows };
  }

  // Stored in chrome.storage.local, one entry per chart:
  //   "chart:<track>|<chart>" -> { <rival>: { score, difference } }
  const storageKey = (row) => `chart:${row.track}|${row.chart}`;

  async function run() {
    const result = scrape();
    if (!result || result.rows.length === 0) return;

    const signature = JSON.stringify(result);
    if (signature === lastSignature) return;
    lastSignature = signature;

    const keys = [...new Set(result.rows.map(storageKey))];
    const stored = await chrome.storage.local.get(keys);

    const changes = [];
    const updates = {};
    for (const row of result.rows) {
      const key = storageKey(row);
      const entry = updates[key] || stored[key] || {};
      const prev = entry[row.rival];

      if (prev && prev.score === row.score && prev.difference === row.difference) continue;

      changes.push({
        track: row.track,
        chart: row.chart,
        rival: row.rival,
        change: prev ? 'updated' : 'new',
        score: row.score,
        prevScore: prev ? prev.score : null,
        difference: row.difference,
        prevDifference: prev ? prev.difference : null,
      });
      updates[key] = { ...entry, [row.rival]: { score: row.score, difference: row.difference } };
    }

    if (changes.length === 0) return;
    await chrome.storage.local.set(updates);

    console.log(`${TAG} rival: ${result.rival}, ${changes.length} change(s)`);
    console.table(changes);
    showToast(result.rival, changes);
  }

  // ---- In-page notifications (shadow DOM so site styles don't leak in) ----

  const MAX_LINES = 8;
  const TOAST_MS = 10000;
  let toastRoot = null;

  function getToastRoot() {
    if (toastRoot && toastRoot.isConnected) return toastRoot.shadowRoot.querySelector('.stack');
    toastRoot = document.createElement('div');
    const shadow = toastRoot.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .stack { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
                 display: flex; flex-direction: column; gap: 8px; max-width: min(420px, calc(100vw - 32px));
                 font: 13px/1.4 Roboto, Arial, sans-serif; }
        .toast { background: #14201A; color: #EAF5EC; border-left: 4px solid #4FE33F; border-radius: 6px;
                 padding: 10px 12px; box-shadow: 0 6px 20px rgba(0,0,0,.5); cursor: pointer;
                 animation: in .2s ease-out; transition: opacity .5s ease; }
        .toast.out { opacity: 0; }
        .title { font-weight: 600; margin-bottom: 4px; }
        .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .new { color: #2BC1D8; }
        .upd { color: #FFC433; }
        .pos { color: #4FE33F; }
        .neg { color: #FF5A5A; }
        .more { color: #9AB3A3; margin-top: 2px; }
        @keyframes in { from { opacity: 0; transform: translateY(8px); } }
      </style>
      <div class="stack"></div>`;
    document.body.appendChild(toastRoot);
    return shadow.querySelector('.stack');
  }

  const fmt = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));
  const fmtDiff = (n) => {
    if (n === null || n === undefined) return '<span>—</span>';
    const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
    return `<span class="${cls}">${n > 0 ? '+' : ''}${fmt(n)}</span>`;
  };
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function changeLine(c) {
    const name = `${esc(c.track)} <b>${esc(c.chart)}</b>`;
    if (c.change === 'new') {
      return `<span class="new">NEW</span> ${name}: ${fmt(c.score)} (${fmtDiff(c.difference)})`;
    }
    const score = c.prevScore === c.score ? fmt(c.score) : `${fmt(c.prevScore)} → ${fmt(c.score)}`;
    const diff = c.prevDifference === c.difference
      ? fmtDiff(c.difference)
      : `${fmtDiff(c.prevDifference)} → ${fmtDiff(c.difference)}`;
    return `<span class="upd">UPD</span> ${name}: ${score} (${diff})`;
  }

  function showToast(rival, changes) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    const lines = changes.slice(0, MAX_LINES).map((c) => `<div class="line">${changeLine(c)}</div>`).join('');
    const more = changes.length > MAX_LINES
      ? `<div class="more">…and ${changes.length - MAX_LINES} more (see console)</div>` : '';
    toast.innerHTML = `<div class="title">${esc(rival)}: ${changes.length} change(s)</div>${lines}${more}`;

    const close = () => {
      if (toast.classList.contains('out')) return;
      toast.classList.add('out');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 600); // fallback if transitionend doesn't fire
    };
    toast.addEventListener('click', close);
    setTimeout(close, TOAST_MS);
    getToastRoot().appendChild(toast);
  }

  // Chain runs so two scrapes never read/write storage at the same time.
  let pending = Promise.resolve();
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = pending.then(run).catch((e) => console.error(TAG, e));
    }, 500);
  };

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
