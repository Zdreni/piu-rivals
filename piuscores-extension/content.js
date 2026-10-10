// Scrapes the rival comparison table on a player page (/Player/<id>) and logs rows to the console.
// The site is Blazor Server: content is rendered after load and re-rendered on folder change,
// so we watch the DOM and re-scrape (debounced), logging only when the data actually changes.

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

      const score = parseScore(cells[2]);
      if (score === null) continue; // rival hasn't played this chart

      rows.push({ track, chart, rival, score });
    }
    return { rival, rows };
  }

  function run() {
    const result = scrape();
    if (!result || result.rows.length === 0) return;

    const signature = JSON.stringify(result);
    if (signature === lastSignature) return;
    lastSignature = signature;

    console.log(`${TAG} rival: ${result.rival}, ${result.rows.length} rows`);
    console.table(result.rows);
  }

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 500);
  };

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
