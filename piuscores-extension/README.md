# PIU Scores Scraper

This Chrome extension collects rival scores from Phoenix 2 sessions on
`piuscores.arroweclip.se` and shows changes and saved scores. Scores are only
collected from Sessions pages; rival compare pages are not scraped. On a player's Sessions
page, use **Grab scores from N sessions** (or **Add player and grab scores…** for a
player not stored yet; disabled when there are no new sessions) to traverse session pages, open each new session,
show all plays, and parse sessions chronologically. The latest parsed session's
title and timestamp are saved with that player's metadata so later runs only
process sessions newer than the checkpoint. Phoenix sessions are ignored, and
encountering one marks the end of the Phoenix 2 history scan.
Scraped scores only replace a stored score when they are higher, so older
session results cannot lower a saved best.
Scores are associated with player IDs. The extension identifies your own ID
from the account menu's “My Sessions” link so your scores can be compared with
the rival scores collected from Sessions pages. Player display names are stored
in `chrome.storage.local` as `players: { "<playerId>": { "name": "<name>", "lastScrapedSession": { "title": "<title>", "timestamp": "<timestamp>" }, "scrapStats": { "scores": <n>, "sessions": <n> } } }`.
`scrapStats` counts the scores and sessions parsed by the grab button; the Rival
scores window shows them per player together with the number of stored best scores.
Chart scores are stored as `results: { "<track>|<chart>": { "<playerId>": { "bestScore": <score>, "bestScoreDate": "<YYYY-MM-DD>", "lastTryDate": "<YYYY-MM-DD>" } } }`.
Dates are session dates: `bestScoreDate` is set when the best score is raised, and
`lastTryDate` moves to the newest session in which the chart was played.
The storage schema version is recorded as `storageVersion: 2`. Version 1 stored
bare scores (`"<playerId>": <score>`); on load they are migrated to `{ "bestScore": <score> }`
without dates.
UI preferences are stored as `preferences: { "hiddenRivals": ["<playerId>", ...], "scoreCap": <score>, "tryCooldown": <days>, "npMinimalRivals": <count> }`;
rivals unchecked in the Rival scores window are excluded from its statistics, and lost charts
whose own `lastTryDate` is less than `tryCooldown` days ago (Fibonacci steps 0, 1, 2, 3, 5, 8, 13, 21, 34; 0 = off; older `retryCooldown` values are read as a fallback) are hidden from it.
Charts you haven't played count as not played (np) only when at least `npMinimalRivals` shown rivals
have a score on them (1–5); others are left out of the window.
Scraping is limited to chart levels 10 and above (`MIN_SCRAPE_LEVEL`).

## Build

The generated `dist/` directory is a self-contained extension package and is
checked in so it can be loaded directly as an unpacked extension in Chrome
without building. Load `dist/` in Chrome's extension management page.

To modify the source modules, install dependencies and rebuild the bundle:

```sh
npm install
npm run build
```

The build bundles the ES modules in `src/` into `dist/content.js` and copies the
manifest into `dist/manifest.json` with its content-script path adjusted.
Commit the regenerated `dist/` files along with source changes so a checkout
remains directly installable. Run `npm run build` again after changing source
files, or use `npm run watch` to rebuild when they change.

## Conventions

Follow the coding rules in [../CODING_RULES.md](../CODING_RULES.md).

After every code change in `src/`, rebuild `dist/` with `npm run build` and
commit the regenerated files together with the source change.
