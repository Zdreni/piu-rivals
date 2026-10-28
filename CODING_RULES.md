# Coding rules

For all code in the repository: the site (`web/`), the server, the shared types and the Chrome
extension, in JavaScript, TypeScript and TSX alike.

## Naming

Use underscores, not hyphens, in source folder and module names (for example
`scraper/session_page.ts`, `components/charts/chart_card.tsx`). The package folder at the
top (`piuscores-scrap-extension`) keeps its name.

Name functions and write comments in the project's own terms (open session, newest session,
PUMBILITY, rivals), not in the scraped site's markup terms. Words like "ceremony" or "hero"
from its `data-testid` values and CSS classes stay in selectors only.

Name a collection after the entity it holds (`hiddenPlayers`, `soloRivals`, `newCharts`),
not with an adjective alone such as `hidden`.

When a lambda is passed to `map`, `filter`, `some` or a similar method of such a collection,
its parameter may be a one or two letter name for the entity instead of the full word:
`p` for a player, `r` for a rival, `t` for a track, `c` or `ch` for a chart.

```js
const hiddenIds = hiddenPlayers.map((p)  =>  p.id);
const doubles = newCharts.filter((ch)  =>  ch.double);
```

Name a function or lambda that returns a boolean for an adjective with the `is` prefix:
`isHidden`, not `hidden`.

```js
const isHidden = (rival)  =>  hiddenIds.includes(rival.id);
```

Give a function that transforms the value it's given, but may return `null` instead, the
`OrNull` suffix: `withRivalsOrNull(chart, keep)`. Callers then see they have to handle
`null`, as with `.filter` and a type guard in TypeScript. Functions that look something up
(`loadUser`, `claimNextRun`) and parsers (`parseChartLabel`, `parseOpenSession`) don't need
it: "nothing found" is part of what their name says. Neither does one that returns `null`
only when the value it's given is missing.

```ts
const charts = allCharts
  .map((c)  =>  withRivalsOrNull(c, isShown))
  .filter((c): c is ChartRow  =>  c !== null);
```

## Variables

Don't keep an element from `querySelector` in a variable when it's used only once, for
example to add an event listener. Call the method on the `querySelector` result directly:

```js
container.querySelector('.close').addEventListener('click', close);
```

Keep the variable when the element is used again later, such as in a render function.


## Module size

Keep a module under roughly 300 lines and 10 KB. When a module grows past that, check
whether it should be split by responsibility (for example, page reading, saving to
storage, UI state).

## Blank lines

Separate top-level functions in source files with two blank lines, not one. Functions
nested inside another function get one blank line around them. Multiline arrow functions
count as functions; one-line top-level arrow functions get at least one blank line
between them.

A statement that passes a multiline lambda as an argument (`addListener`,
`addEventListener`, `setTimeout`, `.then(...)`, ...) is spaced like a function at its
level: two blank lines around it at the top level of a file, one inside a function.

```js
const rivalsWindow = createRivalsWindow(exportTargets, pagePlayerId);


chrome.storage.onChanged.addListener((_, area)  => {
  ...
});


let timer = null;
```

Leave a blank line before a variable declaration (`const`, `let`), unless the line
before it is also a one-line variable declaration. A declaration whose initialization
spans several lines doesn't count, so the declaration after it gets a blank line:

```js
const toast = document.createElement('div');
toast.className = 'toast';

const all = events.flatMap(eventLines);
const lines = all.slice(0, MAX_LINES).join('');
const more = all.length > MAX_LINES
  ? `<div class="more">+${all.length - MAX_LINES} more</div>`
  : '';

const html = lines + more;
```

The same goes for the initialization of a variable declared earlier without a real value
(`let overlay = null;` or `let overlay;`): the line that first gives it its value is
spaced like a declaration, and counts as a one-line declaration for the line after it.

```js
const root = useStyles('rivals', styles);
showButton = document.createElement('button');
showButton.className = 'btn show-scores';
buttonStack().appendChild(showButton);

overlay = document.createElement('div');
overlay.className = 'overlay';
```

No blank line is needed at the start or end of a block.

Leave one blank line after each `if` statement (after its last `else`, if it has one),
unless the enclosing block closes right after it. The same goes for `for` and `while`
loops, including one-line ones.

## Operators

In logical conditions, put one space after the negation operator: `if (! playerId)`,
not `if (!playerId)`. Double negation gets one space too: `!! value`.

Put two spaces on each side of the logical `&&`, `||` and `??` operators: `a  &&  b`, not
`a && b`. A continuation line that starts with the operator keeps its indentation and
gets two spaces after it.

Put two spaces on each side of the `=>` of an arrow function too: `charts.map((chart)  =>  chart.id)`,
not `charts.map((chart) => chart.id)`. When the line ends with the `{` of the function's body, as
in a local function or a lambda passed as an argument, there may be one space between `=>` and `{`:

```js
const leave = (chartId, days)  => {
  ...
};

useEffect(()  => {
  ...
}, []);
```

Put two spaces on each side of a ternary's `?` and `:` too: `a  ?  b  :  c`, not `a ? b : c`. A
continuation line that starts with `?` or `:` keeps its indentation and gets two spaces after it.

Put parentheses around a whole ternary used as a value: assigned to a variable or an object
property, returned (also as an arrow function's body), passed as an argument or a JSX attribute,
or put in a template literal. A ternary nested in another one's branch needs none of its own.

A ternary's condition with logical operators (`&&`, `||`, `??`) goes in parentheses too, so it's
clear where the condition ends: the ternary binds more loosely than they do, so
`a  &&  b  ?  c  :  d` means `(a  &&  b)  ?  c  :  d`, never `a  &&  (b  ?  c  :  d)`.

```js
const tone = (delta > 0  ?  'pos'  :  'neg');
const folding = { keep: (phone  ?  KEEP_PHONE  :  KEEP_DESKTOP) };
const label = (days)  =>  (days === 1  ?  '1 day'  :  `${days} days`);
return (left === null  ?  null  :  timeLeft(left));
<button className={(on  ?  'on'  :  undefined)} title={`${(solo  ?  'Solo'  :  'All')} rivals`}>
```

## if / else and loops

Never put the statement of an `if` on the same line as its condition, even when it is
short; it goes on the next line, indented. The same goes for `else`, `for` and `while`:

```js
if (! playerId)
  return;

for (const chart of charts)
  counts[chartTier(chart)]++;
```
