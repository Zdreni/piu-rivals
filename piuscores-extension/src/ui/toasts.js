import { displayName } from '../storage.js';
import { useStyles } from './ui_host.js';

const MAX_LINES = 8;
const TOAST_MS = 5000;

const toastStyles = `
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

const fmt = (n) => (n === null  ||  n === undefined ? '—' : n.toLocaleString('en-US'));


const fmtDelta = (n) => {
  if (n === null  ||  n === undefined)
    return '<span>—</span>';

  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  return `<span class="${cls}">${n > 0 ? '+' : ''}${fmt(n)}</span>`;
};


const fmtScore = (score, prev) =>
  prev === null  ||  prev === score ? fmt(score) : `${fmt(prev)} → ${fmt(score)}`;


const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));


function eventLines(event) {
  const name = `${esc(event.track)} <b>${esc(event.chart)}</b>`;
  const badge = event.change === 'new' ? '<span class="new">NEW</span>' : '<span class="upd">UPD</span>';
  if (event.kind === 'rival') {
    return [`${badge} ${name} ${esc(displayName(event.player))}: ${fmtScore(event.score, event.prevScore)} (${fmtDelta(event.delta)})`];
  }

  return [
    `${badge} ${name} You: ${fmtScore(event.score, event.prevScore)}`,
    ...event.deltas.map((d) => `<span class="sub">${esc(displayName(d.player))}: ${fmt(d.score)} (${fmtDelta(d.delta)})</span>`),
  ];
}


function toastStack() {
  const root = useStyles('toasts', toastStyles);
  let stack = root.querySelector('.stack');
  if (! stack) {
    stack = document.createElement('div');
    stack.className = 'stack';
    root.appendChild(stack);
  }

  return stack;
}


function pushToast(toast) {
  const close = () => {
    if (toast.classList.contains('out'))
      return;

    toast.classList.add('out');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 600);
  };

  toast.addEventListener('click', close);
  setTimeout(close, TOAST_MS);
  toastStack().appendChild(toast);
}


export function showToast(rival, events) {
  const toast = document.createElement('div');
  toast.className = 'toast';

  const all = events.flatMap(eventLines);
  const lines = all.slice(0, MAX_LINES).map((line) => `<div class="line">${line}</div>`).join('');
  const more = all.length > MAX_LINES
    ? `<div class="more">…and ${all.length - MAX_LINES} more line(s) (see console)</div>` : '';
  toast.innerHTML = `<div class="title">${esc(rival)}: ${events.length} change(s)</div>${lines}${more}`;

  pushToast(toast);
}


export function showSessionToast(player, title, timestamp, scannedResults) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<div class="title">${esc(displayName(player))}: parsed new session</div>`
    + `<div class="line">${esc(title)}</div><div class="line">${esc(timestamp)}</div>`
    + `<div class="line">Scanned ${fmt(scannedResults)} results</div>`;

  pushToast(toast);
}


export function showPlayerAddedToast(player, playerId, pumbility) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<div class="title">${esc(displayName(player))}: <span class="new">player added</span></div>`
    + `<div class="line">ID ${esc(playerId)}</div>`
    + `<div class="line">PUMBILITY ${fmt(pumbility)}</div>`;
  pushToast(toast);
}


export function showOwnPlayerToast(player, playerId) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<div class="title">${esc(displayName(player))}: <span class="new">you are recognized</span></div>`
    + `<div class="line">ID ${esc(playerId)}</div>`;
  pushToast(toast);
}


export function showPumbilityToast(player, pumbility, prevPumbility) {
  const toast = document.createElement('div');
  toast.className = 'toast';

  const change = prevPumbility === null
    ? '<span class="new">NEW</span>'
    : fmtDelta(pumbility - prevPumbility);
  toast.innerHTML = `<div class="title">${esc(displayName(player))}: PUMBILITY</div>`
    + `<div class="line">${fmtScore(pumbility, prevPumbility)} (${change})</div>`;
  pushToast(toast);
}
