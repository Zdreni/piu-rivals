import {
  byLeadWeight, byTargetWeight, deletePlayer, displayName, loadCharts, loadPlayers, loadPreferences, savePreferences, withRivals,
} from '../storage.js';

const fmt = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));
// The last three digits are drawn smaller and dimmer, e.g. 997 + smaller ',458'.
const fmtScore = (n, tailClass = 'tail') => {
  const text = fmt(n);
  const i = text.lastIndexOf(',');
  return i === -1 ? text : `${text.slice(0, i)}<span class="${tailClass}">${text.slice(i)}</span>`;
};
const fmtDelta = (n) => {
  if (n === null || n === undefined) return '<span>—</span>';
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  // Below a thousand every digit is dimmed, like the last three digits of bigger diffs.
  const digits = Math.abs(n) < 1000
    ? `<span class="tail-dim">${Math.abs(n)}</span>`
    : fmtScore(Math.abs(n), 'tail-dim');
  return `<span class="${cls}">${sign}${digits}</span>`;
};
const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const stat = (cls, n) => `<span class="${cls}${n === 0 ? ' zero' : ''}">${n}</span>`;
const statLine = (counts) =>
  `${stat('neg', counts.lose)} / ${stat('blue', counts.unplayed)} / ${stat('pos', counts.win)}`;
const scrapCount = (n, label) => `<span${n === 0 ? ' class="zero"' : ''}>${fmt(n)}</span> ${label}`;
const scrapLine = (scrapStats, best) =>
  `${scrapCount(scrapStats?.scores || 0, 'scores')} · ${scrapCount(best || 0, 'best')} · `
  + `${scrapCount(scrapStats?.sessions || 0, 'sessions')}`;

const levelType = (level) => (level.match(/^[A-Za-z]+/) || [level])[0];
const levelNum = (level) => parseInt((level.match(/\d+/) || ['0'])[0], 10);
const TYPE_ORDER = { S: 0, D: 1 };


function compareLevels(a, b) {
  const ta = levelType(a), tb = levelType(b);
  return (TYPE_ORDER[ta] ?? 9) - (TYPE_ORDER[tb] ?? 9)
    || ta.localeCompare(tb)
    || levelNum(a) - levelNum(b);
}


const chartTier = (chart) => (chart.weight > 0 ? 'rivals-win' : chart.unplayed ? 'not-played' : 'you-win');
const TABS = [
  { id: 'rivals-win', label: 'Rivals win' },
  { id: 'not-played', label: 'Not played' },
  { id: 'you-win', label: 'You win' },
];
const UI_STATE_KEY = 'piuscores.rivalScores.uiState';


function isPlayerSessionsPage() {
  return /^\/Player\/[^/]+\/Sessions\/?$/i.test(location.pathname);
}


function isPlayerProfilePage() {
  return /^\/Player\/[^/]+\/?$/i.test(location.pathname);
}


function readUiState() {
  try {
    const raw = sessionStorage.getItem(UI_STATE_KEY);
    if (!raw) return { isOpen: false, selectedLevel: null, selectedTab: 'rivals-win' };

    const saved = JSON.parse(raw);
    return {
      isOpen: saved.isOpen === true,
      selectedLevel: typeof saved.selectedLevel === 'string' ? saved.selectedLevel : null,
      selectedTab: TABS.some(({ id }) => id === saved.selectedTab) ? saved.selectedTab : 'rivals-win',
    };
  } catch (error) {
    console.error('[piuscores] Unable to restore rival scores window state', error);
    return { isOpen: false, selectedLevel: null, selectedTab: 'rivals-win' };
  }
}


const styles = `
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
  .rival-delete { background: none; font: inherit; font-size: 13px; cursor: pointer; }
  .rival-delete:hover { color: #FF5A5A; border-color: #FF5A5A; background: #2B1C1C; }
  .rival-scrap { margin: 4px 0 0 24px; font-size: 13px; color: #8A9590; font-variant-numeric: tabular-nums; }
  .rival-scrap > span { color: #9AB3A3; }
  .rival-scrap .zero { opacity: .4; }
  .rival.off .rival-name, .rival.off .rival-pum, .rival.off .rival-stats, .rival.off .rival-scrap { opacity: .45; }
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
  th { position: sticky; top: 0; z-index: 1; background: #14201A; color: #9AB3A3; font-weight: 500;
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


export function createScoresUI(exportTargets, scrapeResults, getScrapInfo) {
  let uiHost = null;
  let isScraping = false;
  let scrapStatus = null;
  const savedState = readUiState();
  let isWindowOpen = savedState.isOpen;
  let selectedLevel = savedState.selectedLevel;
  let selectedTab = savedState.selectedTab;

  function saveUiState() {
    try {
      sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({ isOpen: isWindowOpen, selectedLevel, selectedTab }));
    } catch (error) {
      console.error('[piuscores] Unable to save rival scores window state', error);
    }
  }

  // The scrap info is null until the Sessions page has loaded its cards and the stored
  // checkpoint is known, so the button stays disabled until the session count is final.
  function updateScrapButton(shadow) {
    const scrapButton = shadow.querySelector('.scrap-results');
    scrapButton.hidden = !isPlayerSessionsPage() && !isPlayerProfilePage();
    if (isPlayerProfilePage()) {
      scrapButton.disabled = false;
      scrapButton.textContent = 'Open sessions to grab scores';
      return;
    }
    const info = getScrapInfo();
    scrapButton.disabled = isScraping || !info || info.count === 0;
    const label = scrapStatus ?? scrapLabel(info);
    if (scrapButton.textContent !== label) scrapButton.textContent = label;
  }

  // "6+" means every session on the page is new, so older pages may hold more. PB is left out
  // until the PUMBILITY of the newest session can be read.
  function scrapLabel(info) {
    if (!info) return 'Grab scores';
    const { count, more, known, name, pumbility } = info;
    if (count === 0) return 'No new sessions to grab';
    if (!known) return `Add player '${name}'${pumbility === null ? '' : ` PB ${fmt(pumbility)}`} and scrap his results`;
    const sessions = `${count}${more ? '+' : ''} session${count === 1 && !more ? '' : 's'}`;
    return `Grab scores from ${sessions}`;
  }


  function ensure() {
    if (uiHost) {
      if (!uiHost.isConnected) document.body.appendChild(uiHost);
      const shadow = uiHost.shadowRoot;
      updateScrapButton(shadow);
      return shadow;
    }

    uiHost = document.createElement('div');
    const shadow = uiHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${styles}</style>
      <div class="stack"></div>
      <div class="buttons">
        <button class="btn scrap-results" type="button"></button>
        <button class="btn show-scores" type="button" title="Show all saved rival scores">Rival scores</button>
      </div>
      <div class="overlay" ${isWindowOpen ? '' : 'hidden'}>
        <div class="dialog" role="dialog" aria-label="Rival scores">
          <div class="dlg-head"><h2>Rivals</h2>
            <button class="btn export" type="button" title="Download charts where rivals beat you or you have no score">Export targets</button>
            <button class="btn clear-data" type="button" title="Clear all PIU Scores data saved by this extension">Clear data</button>
            <button class="dlg-close" type="button" aria-label="Close">×</button></div>
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
    shadow.querySelector('.export').addEventListener('click', () => {
      exportTargets().catch((error) => console.error('[piuscores]', error));
    });
    const scrapButton = shadow.querySelector('.scrap-results');
    updateScrapButton(shadow);
    scrapButton.addEventListener('click', async () => {
      if (isPlayerProfilePage()) {
        location.assign(`${location.pathname.replace(/\/$/, '')}/Sessions`);
        return;
      }
      isScraping = true;
      updateScrapButton(shadow);
      try {
        await scrapeResults((status) => {
          scrapStatus = status;
          updateScrapButton(shadow);
        });
      } catch (error) {
        console.error('[piuscores] Unable to scrape player sessions', error);
        scrapStatus = 'Scraping failed';
      } finally {
        isScraping = false;
        updateScrapButton(shadow);
        setTimeout(() => {
          scrapStatus = null;
          updateScrapButton(shadow);
        }, 2500);
      }
    });
    shadow.querySelector('.show-scores').addEventListener('click', () => open());
    shadow.querySelector('.clear-data').addEventListener('click', async () => {
      if (!window.confirm('Clear all PIU Scores data saved by this extension? This cannot be undone.')) return;

      try {
        await chrome.storage.local.clear();
        selectedLevel = null;
        selectedTab = 'rivals-win';
        await render();
      } catch (error) {
        console.error('[piuscores] Unable to clear saved data', error);
      }
    });
    shadow.querySelector('.dlg-close').addEventListener('click', () => close());
    shadow.querySelector('.rival-list').addEventListener('change', async (event) => {
      const box = event.target.closest('input[data-player]');
      if (!box) return;
      try {
        const hidden = new Set((await loadPreferences()).hiddenRivals);
        if (box.checked) hidden.delete(box.dataset.player);
        else hidden.add(box.dataset.player);
        await savePreferences({ hiddenRivals: [...hidden] });
        await render();
      } catch (error) {
        console.error('[piuscores] Unable to save rival selection', error);
      }
    });
    shadow.querySelector('.rival-list').addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-delete]');
      if (!button) return;
      const { delete: playerId, name, own } = button.dataset;
      const question = own
        ? 'Delete all your saved scores? Your player record is kept. This cannot be undone.'
        : `Delete ${name} and all their saved scores? This cannot be undone.`;
      if (!window.confirm(question)) return;
      try {
        await deletePlayer(playerId);
        await render();
      } catch (error) {
        console.error('[piuscores] Unable to delete player data', error);
      }
    });
    shadow.querySelector('.filters').addEventListener('click', (event) => {
      const chip = event.target.closest('.chip');
      if (!chip) return;
      selectedLevel = chip.dataset.level;
      saveUiState();
      render().catch((error) => console.error('[piuscores]', error));
    });
    shadow.querySelector('.tabs').addEventListener('click', (event) => {
      const tab = event.target.closest('.tab');
      if (!tab) return;
      selectedTab = tab.dataset.tab;
      saveUiState();
      render().catch((error) => console.error('[piuscores]', error));
    });
    document.body.appendChild(uiHost);
    return shadow;
  }

  function chartRows(chart, myName) {
    const list = [...chart.rivals];
    if (chart.mine !== null) list.push({ player: 'You', score: chart.mine, me: true });
    list.sort((a, b) => b.score - a.score || (b.me ? 1 : 0) - (a.me ? 1 : 0));

    return list.map((rival, i) => {
      const head = i === 0
        ? `<td class="track" rowspan="${list.length}" title="${esc(chart.track)}">${esc(chart.track)}</td>
           <td rowspan="${list.length}"><b>${esc(chart.chart)}</b></td>`
        : '';
      const tr = i === 0 ? '<tr class="group alt">' : i % 2 === 0 ? '<tr class="alt">' : '<tr>';
      if (rival.me) {
        return `${tr}${head}<td class="sm mine" title="${esc(myName)}">${esc(displayName(myName))}</td><td class="sm num score mine">${fmtScore(rival.score)}</td><td class="sm"></td></tr>`;
      }
      const won = rival.delta !== null && rival.delta > 0 ? ' won' : ' ahead';
      const playerId = rival.playerId;
      const name = playerId
        ? `<a class="player-link" href="https://piuscores.arroweclip.se/Player/${encodeURIComponent(playerId)}/Sessions">${esc(displayName(rival.player))}</a>`
        : esc(displayName(rival.player));
      return `${tr}${head}<td class="sm${won}" title="${esc(rival.player)}">${name}</td><td class="sm num score${won}">${fmtScore(rival.score)}</td><td class="sm num${won}">${fmtDelta(rival.delta)}</td></tr>`;
    });
  }

  function renderTitle(shadow, me, totals) {
    const title = me?.name ? `Rivals for ${displayName(me.name)}` : 'Rivals';
    shadow.querySelector('.dlg-head h2').innerHTML = `${esc(title)}`
      + `<span class="head-stats"> — ${stat('neg', totals.lose)} losses, ${stat('blue', totals.unplayed)} np, `
      + `${stat('pos', totals.win)} wins</span>`;
  }

  // Rivals (and you) are sorted by pumbility (highest first); those without one follow alphabetically.
  // Each rival shows how many of their charts you lose / haven't played / win.
  // Below the links: scores and sessions grabbed by the scrap button, and stored best scores.
  function renderRivalList(shadow, charts, players, ownPlayerId, hidden, bestCounts) {
    const rivalStats = {};
    for (const chart of charts) {
      for (const rival of chart.rivals) {
        const counts = (rivalStats[rival.playerId] ||= { lose: 0, win: 0, unplayed: 0 });
        counts[rival.delta === null ? 'unplayed' : rival.delta < 0 ? 'lose' : 'win']++;
      }
    }
    const ids = new Set(Object.keys(players));
    for (const chart of charts) for (const rival of chart.rivals) ids.add(rival.playerId);
    if (ownPlayerId) ids.add(ownPlayerId);
    const rivals = [...ids].map((playerId) => ({
      playerId,
      name: displayName(players[playerId]?.name || playerId),
      pumbility: typeof players[playerId]?.pumbility === 'number' ? players[playerId].pumbility : null,
    }));
    rivals.sort((a, b) => (b.pumbility ?? -1) - (a.pumbility ?? -1)
      || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const list = shadow.querySelector('.rival-list');
    list.innerHTML = rivals.length
      ? rivals.map(({ playerId, name, pumbility }) => {
        const me = playerId === ownPlayerId;
        const on = me || !hidden.has(playerId);
        const base = `https://piuscores.arroweclip.se/Player/${encodeURIComponent(playerId)}`;
        const toggle = me
          ? '<span class="rival-spacer"></span>'
          : `<input type="checkbox" data-player="${esc(playerId)}"${on ? ' checked' : ''}>`;
        return `<div class="rival${on ? '' : ' off'}${me ? ' me' : ''}">`
          + `<label class="rival-toggle" title="${esc(name)}">${toggle}`
          + `<span class="rival-name">${esc(name)}</span><span class="rival-pum">${fmt(pumbility)}</span></label>`
          + `<div class="rival-links"><a class="rival-link" href="${base}">${me ? 'My page' : 'Rival'}</a>`
          + `<a class="rival-link" href="${base}/Sessions">Sessions</a>`
          + `<button class="rival-link rival-delete" type="button" data-delete="${esc(playerId)}" `
          + `data-name="${esc(name)}"${me ? ' data-own="1"' : ''} `
          + `title="${me ? 'Delete all your saved scores' : 'Delete this player and all their saved scores'}">Delete</button>`
          + (me ? '' : `<span class="rival-stats" title="charts: losing / not played / best">${
            statLine(rivalStats[playerId] || { lose: 0, win: 0, unplayed: 0 })}</span>`)
          + '</div>'
          + `<div class="rival-scrap" title="scraped scores · best scores · scraped sessions">${
            scrapLine(players[playerId]?.scrapStats, bestCounts[playerId])}</div>`
          + '</div>';
      }).join('')
      : '<div class="muted">No rivals yet</div>';
  }

  async function render() {
    const shadow = ensure();
    const [allCharts, { players, ownPlayerId, bestCounts }, { hiddenRivals }] =
      await Promise.all([loadCharts(), loadPlayers(), loadPreferences()]);
    const hidden = new Set(hiddenRivals);
    renderRivalList(shadow, allCharts, players, ownPlayerId, hidden, bestCounts);
    const charts = allCharts
      .map((chart) => withRivals(chart, (rival) => !hidden.has(rival.playerId)))
      .filter(Boolean);
    const levels = [...new Set(charts.map((chart) => chart.chart))].sort(compareLevels);
    if (!levels.includes(selectedLevel)) {
      selectedLevel = levels[0] ?? null;
      saveUiState();
    }

    const stats = {};
    const totals = { lose: 0, win: 0, unplayed: 0 };
    const statsFor = (key) => (stats[key] ||= { lose: 0, win: 0, unplayed: 0 });
    for (const chart of charts) {
      const statKey = { 'rivals-win': 'lose', 'not-played': 'unplayed', 'you-win': 'win' }[chartTier(chart)];
      statsFor(chart.chart)[statKey]++;
      totals[statKey]++;
    }
    renderTitle(shadow, players[ownPlayerId], totals);

    const chip = (label) => {
      const on = label === selectedLevel;
      const counts = statsFor(label);
      return `<button class="chip${on ? ' on' : ''}" type="button" role="radio" aria-checked="${on}" data-level="${esc(label)}"><span>${esc(label)}</span>`
        + `<span class="chip-stats" title="charts: losing / not played / best">${statLine(counts)}</span></button>`;
    };
    const types = [...new Set(levels.map(levelType))];
    // Every level between the lowest and highest gets a row, so missing levels keep their place.
    const levelNums = levels.map(levelNum);
    const minNum = Math.min(...levelNums), maxNum = Math.max(...levelNums);
    const nums = levels.length ? Array.from({ length: maxNum - minNum + 1 }, (_, i) => minNum + i) : [];
    const cell = (type, num) => {
      const level = levels.find((l) => levelType(l) === type && levelNum(l) === num);
      return level ? chip(level)
        : '<span class="chip placeholder" aria-hidden="true"><span>&nbsp;</span><span class="chip-stats">&nbsp;</span></span>';
    };
    shadow.querySelector('.filters').innerHTML =
      `<div class="filter-grid" role="radiogroup" style="grid-template-columns: repeat(${types.length}, auto)">${
        nums.map((num) => types.map((type) => cell(type, num)).join('')).join('')}</div>`;

    const levelCharts = charts.filter((chart) => chart.chart === selectedLevel);
    const tabCounts = Object.fromEntries(TABS.map(({ id }) => [
      id, levelCharts.filter((chart) => chartTier(chart) === id).length,
    ]));
    shadow.querySelector('.tabs').innerHTML = TABS.map(({ id, label }) =>
      `<button class="tab" type="button" role="tab" aria-selected="${id === selectedTab}" data-tab="${id}">`
      + `${label}<span class="tab-count ${id}">${tabCounts[id]}</span></button>`).join('');

    const visible = levelCharts.filter((chart) => chartTier(chart) === selectedTab);
    const byRivalCount = (a, b) => b.rivals.length - a.rivals.length || a.track.localeCompare(b.track);
    visible.sort({ 'you-win': byLeadWeight, 'not-played': byRivalCount }[selectedTab] || byTargetWeight);
    const body = shadow.querySelector('.dlg-body');
    if (visible.length === 0) {
      const message = allCharts.length === 0
        ? 'No saved rival scores yet — grab them on a player\'s Sessions page.'
        : charts.length === 0
          ? 'No charts for the selected rivals — check some rivals on the left.'
          : `No ${TABS.find(({ id }) => id === selectedTab).label.toLowerCase()} charts at this level.`;
      body.innerHTML = `<div class="empty">${message}</div>`;
      return;
    }

    const myName = players[ownPlayerId]?.name || 'You';
    const rows = visible.flatMap((chart, i) =>
      i === 0 ? chartRows(chart, myName) : ['<tr class="gap"><td colspan="5"></td></tr>', ...chartRows(chart, myName)]);
    body.innerHTML = `<table>
      <thead><tr><th class="track">Track</th><th class="col-chart">Chart</th><th class="col-player">Player</th><th class="num col-score">Score</th><th class="num col-diff">Diff</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table>`;
  }

  function isOpen() {
    return isWindowOpen;
  }

  function open() {
    isWindowOpen = true;
    saveUiState();
    ensure().querySelector('.overlay').hidden = false;
    render().catch((error) => console.error('[piuscores]', error));
  }

  function close() {
    isWindowOpen = false;
    saveUiState();
    ensure().querySelector('.overlay').hidden = true;
  }

  function initialize() {
    ensure();
    if (isWindowOpen) render().catch((error) => console.error('[piuscores]', error));
  }

  return { ensure, initialize, render, isOpen };
}
