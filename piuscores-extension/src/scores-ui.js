import { byTargetWeight, loadCharts } from './storage.js';

const fmt = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));
const fmtDelta = (n) => {
  if (n === null || n === undefined) return '<span>—</span>';
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  return `<span class="${cls}">${n > 0 ? '+' : ''}${fmt(n)}</span>`;
};
const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const levelType = (level) => (level.match(/^[A-Za-z]+/) || [level])[0];
const levelNum = (level) => parseInt((level.match(/\d+/) || ['0'])[0], 10);
const TYPE_ORDER = { S: 0, D: 1 };

function compareLevels(a, b) {
  const ta = levelType(a), tb = levelType(b);
  return (TYPE_ORDER[ta] ?? 9) - (TYPE_ORDER[tb] ?? 9)
    || ta.localeCompare(tb)
    || levelNum(a) - levelNum(b);
}

const chartTier = (chart) => (chart.weight > 0 ? 0 : chart.unplayed ? 1 : 2);

const styles = `
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

export function createScoresUI(exportTargets) {
  let uiHost = null;
  let selectedLevel = null;

  function ensure() {
    if (uiHost) {
      if (!uiHost.isConnected) document.body.appendChild(uiHost);
      return uiHost.shadowRoot;
    }

    uiHost = document.createElement('div');
    const shadow = uiHost.attachShadow({ mode: 'open' });
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
            <button class="dlg-close" type="button" aria-label="Close">×</button></div>
          <div class="dlg-main"><div class="filters"></div><div class="dlg-body"></div></div>
        </div>
      </div>`;
    shadow.querySelector('.export').addEventListener('click', () => {
      exportTargets().catch((error) => console.error('[piuscores]', error));
    });
    shadow.querySelector('.show-scores').addEventListener('click', () => open());
    shadow.querySelector('.dlg-close').addEventListener('click', () => close());
    shadow.querySelector('.filters').addEventListener('click', (event) => {
      const chip = event.target.closest('.chip');
      if (!chip) return;
      selectedLevel = chip.dataset.level;
      render().catch((error) => console.error('[piuscores]', error));
    });
    document.body.appendChild(uiHost);
    return shadow;
  }

  function chartRows(chart) {
    const list = [...chart.rivals];
    if (chart.mine !== null) list.push({ player: 'You', score: chart.mine, me: true });
    list.sort((a, b) => b.score - a.score || (b.me ? 1 : 0) - (a.me ? 1 : 0));

    return list.map((rival, i) => {
      const head = i === 0
        ? `<td class="track" rowspan="${list.length}" title="${esc(chart.track)}">${esc(chart.track)}</td>
           <td rowspan="${list.length}"><b>${esc(chart.chart)}</b></td>`
        : '';
      const tr = i === 0 ? '<tr class="group">' : i % 2 ? '<tr class="alt">' : '<tr>';
      if (rival.me) {
        return `${tr}${head}<td class="mine">You</td><td class="num mine">${fmt(rival.score)}</td><td></td></tr>`;
      }
      const won = rival.delta !== null && rival.delta > 0 ? ' won' : '';
      return `${tr}${head}<td class="${won}">${esc(rival.player)}</td><td class="num${won}">${fmt(rival.score)}</td><td class="num${won}">${fmtDelta(rival.delta)}</td></tr>`;
    });
  }

  async function render() {
    const shadow = ensure();
    const charts = await loadCharts();
    const levels = [...new Set(charts.map((chart) => chart.chart))].sort(compareLevels);
    if (!levels.includes(selectedLevel)) selectedLevel = levels[0] ?? null;

    const stats = {};
    const statsFor = (key) => (stats[key] ||= { lose: 0, win: 0, unplayed: 0 });
    for (const chart of charts) statsFor(chart.chart)[['lose', 'unplayed', 'win'][chartTier(chart)]]++;

    const stat = (cls, n) => `<span class="${cls}${n === 0 ? ' zero' : ''}">${n}</span>`;
    const chip = (label) => {
      const on = label === selectedLevel;
      const counts = statsFor(label);
      return `<button class="chip${on ? ' on' : ''}" type="button" role="radio" aria-checked="${on}" data-level="${esc(label)}"><span>${esc(label)}</span>`
        + `<span class="chip-stats" title="charts: losing / not played / best">${stat('neg', counts.lose)} / ${stat('blue', counts.unplayed)} / ${stat('pos', counts.win)}</span></button>`;
    };
    const types = [...new Set(levels.map(levelType))];
    shadow.querySelector('.filters').innerHTML = types.map((type) =>
      `<div class="filter-row" role="radiogroup">${
        levels.filter((level) => levelType(level) === type).map(chip).join('')}</div>`).join('');

    const visible = charts.filter((chart) => chart.chart === selectedLevel).sort(byTargetWeight);
    shadow.querySelector('.dlg-count').textContent = `${visible.length} chart(s)`;
    const body = shadow.querySelector('.dlg-body');
    if (visible.length === 0) {
      body.innerHTML = '<div class="empty">No saved rival scores yet — open a rival\'s page to collect them.</div>';
      return;
    }

    const rows = visible.flatMap((chart, index) => {
      const gap = index > 0 && chartTier(chart) !== chartTier(visible[index - 1])
        ? ['<tr class="tier-gap"><td colspan="5"></td></tr>'] : [];
      return [...gap, ...chartRows(chart)];
    });
    body.innerHTML = `<table>
      <thead><tr><th class="track">Track</th><th>Chart</th><th>Player</th><th class="num">Score</th><th class="num">Diff</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table>`;
  }

  function isOpen() {
    return Boolean(uiHost && !uiHost.shadowRoot.querySelector('.overlay').hidden);
  }

  function open() {
    ensure().querySelector('.overlay').hidden = false;
    render().catch((error) => console.error('[piuscores]', error));
  }

  function close() {
    ensure().querySelector('.overlay').hidden = true;
  }

  return { ensure, render, isOpen };
}
