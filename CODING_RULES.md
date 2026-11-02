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

Before naming an entity with a new noun, one that isn't used in the code yet and that the user
hasn't used either (for example "judgment"), ask whether it's the right term or should be
named something else. Use it only once it's confirmed.

Name a collection after the entity it holds (`hiddenPlayers`, `soloRivals`, `newCharts`),
not with an adjective alone such as `hidden`.

Name a number after what it counts: the entity counted, which of them are counted, and
`Count` or `Counts` (`foldedRivalCount`, `HISTORY_LISTED_RIVAL_COUNTS`). The entity alone
(`RIVAL_COUNT`) doesn't say which rivals are counted, and a place or case alone
(`LISTED_DESKTOP`, `HISTORY_ABOVE`) doesn't say what is. The screen, the side or the case goes in
a qualifier or in the record's keys. Limits need no `Count`, since `MAX_` and `MIN_` already say
they're numbers: `MAX_RIVALS`, `MIN_NP_RIVALS`.

```ts
const LISTED_RIVAL_COUNTS = {
  desktop: { unplayed: 6, played: 6 },
  mobile: { unplayed: 4, played: 3 },
};
```

The same goes for other values: a name made only of qualifiers, such as a place, a device or a
time (`DESKTOP`, `ABOVE`, `TODAY`), says where the value applies but not what it is.

Avoid naming other variables and parameters with a single adjective too: say what the value is
(`soloRivalId`, not `solo`, for the id of the rival compared alone). An adjective alone is fine
when it describes a noun in the name of its function or method, as `hidden` does in
`setRivalHidden(playerId, hidden)`. Booleans may be a single adjective when it describes the
subject of their function or component, as `maximized` does for a card's `CardHead`. When the
adjective describes something else, name that with `Is` (or `Are`, `Was`, `Were`) before it:
`menuIsOpen`, not `menuOpen`.

When a lambda is passed to `map`, `filter`, `some` or a similar method of such a collection,
its parameter may be a one or two letter name for the entity instead of the full word:
`p` for a player, `r` for a rival, `t` for a track, `c` or `ch` for a chart, `cb` for a chartboard.

```js
const hiddenIds = hiddenPlayers.map((p)  =>  p.id);
const doubles = newCharts.filter((ch)  =>  ch.double);
```

Name a variable, parameter or prop that holds a function with a verb for what the function does,
not with the noun of what it gives back: a function passed to draw each card is `renderCard`, not
`card`, which reads as a card itself.

```tsx
const renderCard = (chartboard: Chartboard)  =>  <ChartCard chartboard={chartboard} ... />;

<ChartCardsGrid groups={groups} renderCard={renderCard} />
```

A function that works out a value, called right where it's named (`labelWidth(label)`), may be
named for that value, like `chartTier(chartboard)`; so may a sort comparator (`byTargetWeight`).

Name a function or lambda that returns a boolean for an adjective with the `is` prefix:
`isHidden`, not `hidden`.

```js
const isHidden = (rival)  =>  hiddenIds.includes(rival.id);
```

Give a function that transforms the value it's given, but may return `null` instead, the
`OrNull` suffix: `withRivalsOrNull(chartboard, keep)`. Callers then see they have to handle
`null`, as with `.filter` and a type guard in TypeScript. Functions that look something up
(`loadUser`, `claimNextRun`) and parsers (`parseChartLabel`, `parseOpenSession`) don't need
it: "nothing found" is part of what their name says. Neither does one that returns `null`
only when the value it's given is missing.

```ts
const chartboards = allChartboards
  .map((cb)  =>  withRivalsOrNull(cb, isShown))
  .filter((cb): cb is Chartboard  =>  cb !== null);
```

Database tables and columns keep their names when the code's names for them change: a migration
isn't worth it only for a rename. Note the name such a column should get beside it in
`docs/database.md`, and rename it in the next migration that changes its table anyway.

## Comments

Keep comments short, as commit messages are: say what the function or component is for, and
what its parameters mean when their names don't say it. Don't describe each button, control,
value or layout detail it has; the code shows those. A feature may be named briefly when it
explains which parameters it takes, e.g. "with snoozing" for the snooze callbacks.

Size a comment by how far from obvious the code is. Plain code needs a line or none. A long
comment belongs where the code handles a special situation, e.g. that piuscores keeps adding
re-imported plays to the newest session, so the latest stored session has to be matched with
the one it grew into. Say why the code does what it does: the situation it starts from and the
reasons, not the steps. Once that situation is clear, leave out what follows from it plainly;
the reader can work that out from the code.

When a comment has to say what a variable or parameter is (`levels` is the level range in use),
rename it instead (`levelRange`) and drop that part of the comment.

When a comment's sentence goes on to the next line, indent that line by one space more after the
`//`. A sentence that starts a new subject, not one following on from the sentence before, starts
a new line of its own:

```ts
// One chart's card: its header (see CardHead), then `foldedChartboard`'s scores and folds, with
//  `unfoldedRivalCounts` of each fold's rivals unfolded.
// With `onMaximize`, a click on the card only maximizes it.
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

Put two spaces on each side of the `=>` of an arrow function too: `chartboards.map((cb)  =>  cb.id)`,
not `chartboards.map((cb) => cb.id)`. When the line ends with the `{` of the function's body, as
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
const listedRivalCounts = LISTED_RIVAL_COUNTS[(inMobileView  ?  'mobile'  :  'desktop')];
const label = (days)  =>  (days === 1  ?  '1 day'  :  `${days} days`);
return (left === null  ?  null  :  timeLeft(left));
<button className={(selected  ?  'on'  :  undefined)} title={`${(rivalIsSolo  ?  'Solo'  :  'All')} rivals`}>
```

## if / else and loops

Never put the statement of an `if` on the same line as its condition, even when it is
short; it goes on the next line, indented. The same goes for `else`, `for` and `while`:

```js
if (! playerId)
  return;

for (const chartboard of chartboards)
  counts[chartTier(chartboard)]++;
```
