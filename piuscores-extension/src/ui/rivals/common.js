export const fmt = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));
// The last three digits are drawn smaller and dimmer, e.g. 997 + smaller ',458'.
export const fmtScore = (n, tailClass = 'tail') => {
  const text = fmt(n);
  const i = text.lastIndexOf(',');
  return i === -1 ? text : `${text.slice(0, i)}<span class="${tailClass}">${text.slice(i)}</span>`;
};
// The colour follows `outcome` (the capped diff), so a capped tie stays neutral whatever the real diff is.
export const fmtDelta = (n, outcome = n) => {
  if (n === null || n === undefined) return '<span>—</span>';
  const cls = outcome > 0 ? 'pos' : outcome < 0 ? 'neg' : '';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  // Below a thousand every digit is dimmed, like the last three digits of bigger diffs.
  const digits = Math.abs(n) < 1000
    ? `<span class="tail-dim">${Math.abs(n)}</span>`
    : fmtScore(Math.abs(n), 'tail-dim');
  return `<span class="${cls}">${sign}${digits}</span>`;
};
export const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const stat = (cls, n) => `<span class="${cls}${n === 0 ? ' zero' : ''}">${n}</span>`;
export const statWords = (counts, separator = ', ') =>
  `${stat('neg', counts.lose)} losses${separator}${stat('blue', counts.unplayed)} np${separator}${stat('pos', counts.win)} wins`;


export const chartTier = (chart) => (chart.weight > 0 ? 'rivals-win' : chart.unplayed ? 'not-played' : 'you-win');
export const TABS = [
  { id: 'rivals-win', label: 'Rivals win' },
  { id: 'not-played', label: 'Not played' },
  { id: 'you-win', label: 'You win' },
];
const TIER_STAT = { 'rivals-win': 'lose', 'not-played': 'unplayed', 'you-win': 'win' };


export function tierCounts(charts) {
  const counts = { lose: 0, win: 0, unplayed: 0 };
  for (const chart of charts) counts[TIER_STAT[chartTier(chart)]]++;
  return counts;
}
