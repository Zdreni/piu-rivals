# Coding rules

## Naming

Use underscores, not hyphens, in folder and module names
(for example `page_scrappers/common.js`).

Name functions and write comments in the extension's own terms (open session, newest
session, PUMBILITY), not in the site's markup terms. Words like "ceremony" or "hero" from
`data-testid` values and CSS classes stay in selectors only.

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


chrome.storage.onChanged.addListener((_, area) => {
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

Put two spaces on each side of the logical `&&` and `||` operators: `a  &&  b`, not
`a && b`. A continuation line that starts with the operator keeps its indentation and
gets two spaces after it.

## if / else and loops

Never put the statement of an `if` on the same line as its condition, even when it is
short; it goes on the next line, indented. The same goes for `else`, `for` and `while`:

```js
if (! playerId)
  return;

for (const chart of charts)
  counts[chartTier(chart)]++;
```
