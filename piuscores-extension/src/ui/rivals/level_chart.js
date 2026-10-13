import { esc, tierCounts } from './common.js';

export const levelChartStyles = `
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
  .level-bar { display: flex; height: 100%; padding: 0; border: none; border-radius: 3px; overflow: hidden;
               background: #1C2B22; cursor: pointer; opacity: .75; }
  .level-bar.single { flex-direction: row-reverse; }
  .level-bar:hover { opacity: 1; }
  .level-bar.on { opacity: 1; box-shadow: 0 0 0 2px #EAF5EC; }
  .level-bar.placeholder { visibility: hidden; }
  /* Each segment shows its count and is always wide enough for it, even if that bends the proportions. */
  .level-bar > span { flex: 0 0 0; min-width: max-content; padding: 0 3px; overflow: hidden; display: flex; align-items: center;
                      justify-content: center; font: 600 11px/1 Roboto, Arial, sans-serif; color: rgba(0,0,0,.55); }
  .level-bar .win { background: #45C039; }
  .level-bar .unplayed { background: #3E4844; color: #B8C2BD; }
  .level-bar .lose { background: #DC5252; }
  .level-other { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; margin-top: 6px; }
  .level-other .level-num { grid-column: 1; justify-content: flex-end; padding-right: 6px; }
  .level-other .level-bar { grid-column: 2 / -1; }
`;

const levelType = (level) => (level.match(/^[A-Za-z]+/) || [level])[0];
const levelNum = (level) => parseInt((level.match(/\d+/) || ['0'])[0], 10);
const TYPE_ORDER = { S: 0, D: 1 };


function compareLevels(a, b) {
  const ta = levelType(a), tb = levelType(b);
  return (TYPE_ORDER[ta] ?? 9) - (TYPE_ORDER[tb] ?? 9)
    || ta.localeCompare(tb)
    || levelNum(a) - levelNum(b);
}


export const sortedLevels = (charts) => [...new Set(charts.map((chart) => chart.chart))].sort(compareLevels);


// The levels column: one bar per chart level, singles on the left and doubles on the right.
// `onSelect` gets the level whose bar was clicked.
export function createLevelChart(container, onSelect) {
  container.addEventListener('click', (event) => {
    const bar = event.target.closest('.level-bar[data-level]');
    if (bar) onSelect(bar.dataset.level);
  });

  function render(charts, selectedLevel) {
    const levels = sortedLevels(charts);
    const stats = {};
    for (const level of levels) stats[level] = tierCounts(charts.filter((chart) => chart.chart === level));

    // Each bar is split by the share of wins / not played / losses; wins sit next to the level number
    // and losses at the outer end, so singles grow to the left and doubles to the right.
    const bar = (level, side) => {
      if (!level) return `<span class="level-bar ${side} placeholder" aria-hidden="true"></span>`;
      const on = level === selectedLevel;
      const counts = stats[level];
      const part = (cls, n) => (n ? `<span class="${cls}" style="flex-grow: ${n}">${n}</span>` : '');
      return `<button class="level-bar ${side}${on ? ' on' : ''}" type="button" role="radio" aria-checked="${on}" `
        + `data-level="${esc(level)}" title="${esc(level)}: ${counts.lose} losses · ${counts.unplayed} np · ${counts.win} wins">`
        + `${part('win', counts.win)}${part('unplayed', counts.unplayed)}${part('lose', counts.lose)}</button>`;
    };
    const sideLevels = levels.filter((level) => levelType(level) in TYPE_ORDER);
    const otherLevels = levels.filter((level) => !(levelType(level) in TYPE_ORDER));
    // Every level between the lowest and highest gets a row, so missing levels keep their place.
    const levelNums = sideLevels.map(levelNum);
    const minNum = Math.min(...levelNums), maxNum = Math.max(...levelNums);
    const nums = sideLevels.length ? Array.from({ length: maxNum - minNum + 1 }, (_, i) => minNum + i) : [];
    const find = (type, num) => sideLevels.find((l) => levelType(l) === type && levelNum(l) === num);
    const row = (num) => {
      const single = find('S', num), double = find('D', num);
      const on = selectedLevel !== null && (selectedLevel === single || selectedLevel === double);
      return `${bar(single, 'single')}<span class="level-num${on ? ' on' : ''}">${num}</span>${bar(double, 'double')}`;
    };
    const other = (level) => `<div class="level-other"><span class="level-num${level === selectedLevel ? ' on' : ''}">`
      + `${esc(level)}</span>${bar(level, 'double')}</div>`;
    const headOn = (type) => (selectedLevel !== null && levelType(selectedLevel) === type ? ' on' : '');
    container.innerHTML = `<div class="level-chart" role="radiogroup" aria-label="Levels">`
      + `<span class="level-head single${headOn('S')}">Singles</span><span></span><span class="level-head${headOn('D')}">Doubles</span>`
      + `${nums.map(row).join('')}${otherLevels.map(other).join('')}</div>`;
  }

  return { render };
}
