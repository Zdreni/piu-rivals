import { displayName } from '../storage.js';

const MAX_LINES = 8;
const TOAST_MS = 5000;

const fmt = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));
const fmtDelta = (n) => {
  if (n === null || n === undefined) return '<span>—</span>';
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  return `<span class="${cls}">${n > 0 ? '+' : ''}${fmt(n)}</span>`;
};
const fmtScore = (score, prev) =>
  prev === null || prev === score ? fmt(score) : `${fmt(prev)} → ${fmt(score)}`;
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


function pushToast(shadow, toast) {
  const close = () => {
    if (toast.classList.contains('out')) return;
    toast.classList.add('out');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 600);
  };
  toast.addEventListener('click', close);
  setTimeout(close, TOAST_MS);
  shadow.querySelector('.stack').appendChild(toast);
}


export function showToast(shadow, rival, events) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  const all = events.flatMap(eventLines);
  const lines = all.slice(0, MAX_LINES).map((line) => `<div class="line">${line}</div>`).join('');
  const more = all.length > MAX_LINES
    ? `<div class="more">…and ${all.length - MAX_LINES} more line(s) (see console)</div>` : '';
  toast.innerHTML = `<div class="title">${esc(rival)}: ${events.length} change(s)</div>${lines}${more}`;

  pushToast(shadow, toast);
}


export function showSessionToast(shadow, player, title, timestamp, scannedResults) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<div class="title">${esc(displayName(player))}: parsed new session</div>`
    + `<div class="line">${esc(title)}</div><div class="line">${esc(timestamp)}</div>`
    + `<div class="line">Scanned ${fmt(scannedResults)} results</div>`;

  pushToast(shadow, toast);
}


export function showPumbilityToast(shadow, player, pumbility, prevPumbility) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  const change = prevPumbility === null
    ? '<span class="new">NEW</span>'
    : fmtDelta(pumbility - prevPumbility);
  toast.innerHTML = `<div class="title">${esc(displayName(player))}: PUMBILITY</div>`
    + `<div class="line">${fmtScore(pumbility, prevPumbility)} (${change})</div>`;
  pushToast(shadow, toast);
}
