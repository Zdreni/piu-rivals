export const fmt = (n)  =>  ((n === null  ||  n === undefined)  ?  '—'  :  n.toLocaleString('en-US'));


// The last three digits are drawn smaller and dimmer, e.g. 997 + smaller ',458'.
export const fmtScore = (n, tailClass = 'tail')  => {
  const text = fmt(n);
  const i = text.lastIndexOf(',');
  return (i === -1  ?  text  :  `${text.slice(0, i)}<span class="${tailClass}">${text.slice(i)}</span>`);
};


// The colour follows `outcome` (the capped diff); a capped tie gets a muted colour from the real diff's sign
// and a tooltip naming `cap`.
export const fmtDelta = (n, outcome = n, cap = null)  => {
  if (n === null  ||  n === undefined)
    return '<span>—</span>';

  const tone = outcome  ||  n;
  const capped = ! outcome  &&  n;
  const cls = (tone > 0  ?  'pos'  :  tone < 0  ?  'neg'  :  '') + (capped  ?  ' muted'  :  '');
  const capText = (cap === null  ?  'score cap'  :  `${cap / 1000}k score cap`);
  const title = (capped  ?  ` title="Both scores ≥ ${capText}, so this counts as a tie"`  :  '');
  const sign = (n > 0  ?  '+'  :  n < 0  ?  '-'  :  '');
  // Below a thousand every digit is dimmed, like the last three digits of bigger diffs.
  const digits = (Math.abs(n) < 1000
    ?  `<span class="tail-dim">${Math.abs(n)}</span>`
    :  fmtScore(Math.abs(n), 'tail-dim'));
  return `<span class="${cls}"${title}>${sign}${digits}</span>`;
};


export const esc = (s)  =>
  s.replace(/[&<>"]/g, (c)  =>  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));


const stat = (cls, n)  =>  `<span class="${cls}${(n === 0  ?  ' zero'  :  '')}">${n}</span>`;


// The word for each stat, by the count by setting.
export const STAT_WORDS = {
  results: { lose: 'lost', unplayed: 'non-matched', win: 'won', hidden: 'hidden' },
  charts: { lose: 'inferior', unplayed: 'not played', win: 'superior', hidden: 'hidden' },
};

export const statWords = (counts, separator = ', ', words = STAT_WORDS.results)  =>
  `${stat('neg', counts.lose)} ${words.lose}${separator}${stat('blue', counts.unplayed)} ${words.unplayed}${separator}`
  + `${stat('pos', counts.win)} ${words.win}`;


export const chartTier = (chart)  =>  (chart.weight > 0  ?  'rivals-win'  :  chart.unplayed  ?  'not-played'  :  'you-win');

// Each tab is labelled with the word of its stat.
export const TABS = [
  { id: 'rivals-win' },
  { id: 'not-played' },
  { id: 'you-win' },
  // Losses hidden by the try cooldown or the score cap; never a chartTier.
  { id: 'hidden' },
];

// The stat each tab counts.
export const TIER_STAT = { 'rivals-win': 'lose', 'not-played': 'unplayed', 'you-win': 'win', hidden: 'hidden' };


export function tierCounts(charts) {
  const counts = { lose: 0, win: 0, unplayed: 0 };
  for (const chart of charts)
    counts[TIER_STAT[chartTier(chart)]]++;

  return counts;
}


// Both countings of a level, as { charts, results }, each { lose, unplayed, win, hidden }. `hiddenCharts` are its
// losses hidden by the try cooldown or the score cap. They are judged uncapped, so score-cap losses count as hidden
// losses, while the rivals you beat on them still count as yours.
export function levelStats(charts, hiddenCharts) {
  const shown = resultCounts(charts);
  const hidden = resultCounts(hiddenCharts, (rival)  =>  rival.realDelta);
  return {
    charts: { ...tierCounts(charts), hidden: hiddenCharts.length },
    results: { lose: shown.lose, unplayed: shown.unplayed, win: shown.win + hidden.win, hidden: hidden.lose },
  };
}


// Like tierCounts, but counts rival results instead of charts, whatever the chart's tier: on played charts
// every rival either beats you or you beat them (draws count as neither), and on np charts every rival result is np.
// `diff` picks the difference to judge by, e.g. the uncapped one.
export function resultCounts(charts, diff = (rival)  =>  rival.delta) {
  const counts = { lose: 0, win: 0, unplayed: 0 };
  for (const chart of charts) {
    for (const rival of chart.rivals) {
      const d = diff(rival);
      if (d !== 0)
        counts[d === null  ?  'unplayed'  :  d < 0  ?  'lose'  :  'win']++;
    }
  }

  return counts;
}
