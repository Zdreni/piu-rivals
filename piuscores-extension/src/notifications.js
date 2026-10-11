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
    return [`${badge} ${name} ${esc(event.player)}: ${fmtScore(event.score, event.prevScore)} (${fmtDelta(event.delta)})`];
  }

  return [
    `${badge} ${name} You: ${fmtScore(event.score, event.prevScore)}`,
    ...event.deltas.map((d) => `<span class="sub">${esc(d.player)}: ${fmt(d.score)} (${fmtDelta(d.delta)})</span>`),
  ];
}

export function showToast(shadow, rival, events) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  const all = events.flatMap(eventLines);
  const lines = all.slice(0, MAX_LINES).map((line) => `<div class="line">${line}</div>`).join('');
  const more = all.length > MAX_LINES
    ? `<div class="more">…and ${all.length - MAX_LINES} more line(s) (see console)</div>` : '';
  toast.innerHTML = `<div class="title">${esc(rival)}: ${events.length} change(s)</div>${lines}${more}`;

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
