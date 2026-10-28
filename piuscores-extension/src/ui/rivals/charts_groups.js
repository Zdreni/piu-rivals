import { esc, levelStats, STAT_WORDS } from './common.js';

export const chartsGroupsStyles = `
  .filters { display: flex; gap: 6px; padding: 10px 10px 10px 16px; border-right: 1px solid #2B4034;
             overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable; flex-shrink: 0;
             scrollbar-width: thin; scrollbar-color: #2B4034 transparent; }
  .filters:hover { scrollbar-color: #3D5A49 transparent; }
  /* Rows share the column height evenly, but never get thinner than 10px (the panel scrolls then). */
  .level-chart { display: grid; grid-template-columns: 128px 38px 128px; grid-template-rows: auto;
                 grid-auto-rows: minmax(10px, 1fr); row-gap: 6px; font-size: 14px; }
  .level-head { color: #9AB3A3; font-size: 17px; padding-bottom: 4px; }
  .level-head.single { text-align: right; }
  .level-num { display: flex; align-items: center; justify-content: center; font-size: 18px; color: #9AB3A3; font-variant-numeric: tabular-nums; }
  .level-num.on, .level-head.on { color: #EAF5EC; font-weight: 600; }
  .level-bar { display: flex; height: 100%; padding: 0; border: 1px solid rgba(255,255,255,.04); box-sizing: border-box; border-radius: 3px; overflow: hidden;
               background: #1C2B22; cursor: pointer; opacity: .75; }
  .level-bar.single { flex-direction: row-reverse; }
  .level-bar:hover { opacity: 1; }
  .level-bar.on { opacity: 1; box-shadow: 0 0 0 2px #EAF5EC; }
  .level-bar.placeholder { visibility: hidden; }
  /* Each segment shows its count and is always wide enough for it, even if that bends the proportions. */
  .level-bar > span { flex: 0 0 0; min-width: max-content; padding: 0 3px; overflow: hidden; display: flex; align-items: center;
                      justify-content: center; font: 600 11px/1 Roboto, Arial, sans-serif; color: rgba(0,0,0,.55); }
  /* Wins and np darken from the level number outward. Losses burn from red in the middle to orange at
     the end; how orange is set by --heat (0..1), and only the most losses of any level reach full orange. */
  .level-bar .win { background: linear-gradient(to right, #72C457, #3F7D24); }
  .level-bar.single .win { background: linear-gradient(to left, #72C457, #3F7D24); }
  .level-bar .unplayed { background: linear-gradient(to right, #0F2B3C, #061219); color: #7F9DB0; }
  .level-bar.single .unplayed { background: linear-gradient(to left, #0F2B3C, #061219); }
  .level-bar .lose { --hot: color-mix(in srgb, #FF8A00 calc(var(--heat) * 100%), #D01E00);
                     background: linear-gradient(to left, var(--hot), #B01C00); }
  .level-bar.single .lose { background: linear-gradient(to right, var(--hot), #B01C00); }
  .level-bar .hidden-loss { background: #34140E; }
  /* Segments round their outer corners and lie over the next segment, which slides under them. */
  .level-bar > span { position: relative; }
  .level-bar .win { z-index: 3; }
  .level-bar .unplayed { z-index: 2; }
  .level-bar .hidden-loss { z-index: 1; }
  .level-bar > span:not(.lose) { border-radius: 0 2px 2px 0; }
  .level-bar > span + span { margin-left: -2px; padding-left: 5px; }
  .level-bar.single > span:not(.lose) { border-radius: 2px 0 0 2px; }
  .level-bar.single > span + span { margin: 0 -2px 0 0; padding: 0 5px 0 3px; }
  .level-other { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; margin-top: 6px; }
  .level-other .level-num { grid-column: 1; justify-content: flex-end; padding-right: 6px; }
  .level-other .level-bar { grid-column: 2 / -1; }
`;

const levelType = (level)  =>  (level.match(/^[A-Za-z]+/)  ||  [level])[0];

const levelNum = (level)  =>  parseInt((level.match(/\d+/)  ||  ['0'])[0], 10);
const TYPE_ORDER = { S: 0, D: 1 };

const plural = (n, word)  =>  `${n} ${word}${(n === 1  ?  ''  :  's')}`;


function compareLevels(a, b) {
  const ta = levelType(a), tb = levelType(b);
  return (TYPE_ORDER[ta]  ??  9) - (TYPE_ORDER[tb]  ??  9)
    ||  ta.localeCompare(tb)
    ||  levelNum(a) - levelNum(b);
}


export const sortedLevels = (charts)  =>  [...new Set(charts.map((chart)  =>  chart.chart))].sort(compareLevels);


// The levels column: one bar per chart level, singles on the left and doubles on the right.
// `onSelect` gets the level whose bar was clicked.
export function createChartsGroups(container, onSelect) {
  container.addEventListener('click', (event)  => {
    const bar = event.target.closest('.level-bar[data-level]');
    if (bar)
      onSelect(bar.dataset.level);
  });

  // `hiddenCharts` are the losses hidden by the try cooldown or the score cap; they get their own dark segment.
  // `countBy` ('charts' or 'results') picks what sizes and labels the segments.
  function render(charts, hiddenCharts, selectedLevel, countBy) {
    const levels = sortedLevels([...charts, ...hiddenCharts]);
    const stats = {};
    for (const level of levels) {
      const atLevel = (chart)  =>  chart.chart === level;
      stats[level] = levelStats(charts.filter(atLevel), hiddenCharts.filter(atLevel));
    }

    // A level's heat grows with the square of its losses, relative to the level with the most.
    const maxLose = Math.max(1, ...levels.map((level)  =>  stats[level][countBy].lose));
    const heat = (n)  =>  ((n / maxLose) ** 2).toFixed(3);

    // Each bar is split by the share of wins / not played / hidden losses / losses; wins sit next to
    // the level number and losses at the outer end, so singles grow to the left and doubles to the right.
    const bar = (level, side)  => {
      if (! level)
        return `<span class="level-bar ${side} placeholder" aria-hidden="true"></span>`;

      const on = level === selectedLevel;
      const { charts: byCharts, results: byResults } = stats[level];
      const counts = stats[level][countBy];
      // The hidden-losses segment has no number; its count is in the tooltip, which shows both countings.
      const part = (cls, n, label = n, style = '')  =>
        (n  ?  `<span class="${cls}" style="flex-grow: ${n}${style}">${label}</span>`  :  '');

      const tipLine = (stat)  =>  `\n${plural(byCharts[stat], `${STAT_WORDS.charts[stat]} chart`)}`
        + ` / ${plural(byResults[stat], `${STAT_WORDS.results[stat]} result`)}`;

      const tip = `${level}:${tipLine('lose')}${tipLine('hidden')}${tipLine('unplayed')}${tipLine('win')}`;
      return `<button class="level-bar ${side}${(on  ?  ' on'  :  '')}" type="button" role="radio" aria-checked="${on}" `
        + `data-level="${esc(level)}" title="${esc(tip)}">`
        + `${part('win', counts.win)}${part('unplayed', counts.unplayed)}${part('hidden-loss', counts.hidden, '')}`
        + `${part('lose', counts.lose, counts.lose, `; --heat: ${heat(counts.lose)}`)}</button>`;
    };

    const sideLevels = levels.filter((level)  =>  levelType(level) in TYPE_ORDER);
    const otherLevels = levels.filter((level)  =>  ! (levelType(level) in TYPE_ORDER));
    // Every level between the highest and lowest gets a row, highest on top, so missing levels keep their place.
    const levelNums = sideLevels.map(levelNum);
    const minNum = Math.min(...levelNums), maxNum = Math.max(...levelNums);
    const nums = (sideLevels.length  ?  Array.from({ length: maxNum - minNum + 1 }, (_, i)  =>  maxNum - i)  :  []);
    const find = (type, num)  =>  sideLevels.find((l)  =>  levelType(l) === type  &&  levelNum(l) === num);

    const row = (num)  => {
      const single = find('S', num), double = find('D', num);
      const on = selectedLevel !== null  &&  (selectedLevel === single  ||  selectedLevel === double);
      return `${bar(single, 'single')}<span class="level-num${(on  ?  ' on'  :  '')}">${num}</span>${bar(double, 'double')}`;
    };

    const other = (level)  =>  `<div class="level-other"><span class="level-num${(level === selectedLevel  ?  ' on'  :  '')}">`
      + `${esc(level)}</span>${bar(level, 'double')}</div>`;

    const headOn = (type)  =>  ((selectedLevel !== null  &&  levelType(selectedLevel) === type)  ?  ' on'  :  '');
    container.innerHTML = `<div class="level-chart" role="radiogroup" aria-label="Levels">`
      + `<span class="level-head single${headOn('S')}">Singles</span><span></span><span class="level-head${headOn('D')}">Doubles</span>`
      + `${nums.map(row).join('')}${otherLevels.map(other).join('')}</div>`;
  }

  return { render };
}
