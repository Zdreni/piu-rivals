# PIU Scores Scraper

This Chrome extension collects rival scores from player pages on
`piuscores.arroweclip.se` and shows changes and saved scores.
It also collects rival scores from Phoenix 2 sessions. On a player's Sessions
page, use **Scrap results** to traverse session pages, open each new session,
show all plays, and parse sessions chronologically. The latest parsed session's
title and timestamp are saved with that player's metadata so later runs only
process sessions newer than the checkpoint. Phoenix sessions are ignored, and
encountering one marks the end of the Phoenix 2 history scan.
Scraped scores only replace a stored score when they are higher, so older
session results cannot lower a saved best.
Scores are associated with player IDs. The extension identifies your own ID
from the account menu's “My Sessions” link so your scores can be compared with
the rival scores collected from player pages. Player display names are stored
in `chrome.storage.local` as `players: { "<playerId>": { "name": "<name>", "lastScrapedSession": { "title": "<title>", "timestamp": "<timestamp>" } } }`.
Chart scores are stored as `results: { "<track>|<chart>": { "<playerId>": <score> } }`.
The storage schema version is recorded as `storageVersion: 1`.
UI preferences are stored as `preferences: { "hiddenRivals": ["<playerId>", ...] }`;
rivals unchecked in the Rival scores window are excluded from its statistics.
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

Use underscores, not hyphens, in folder and module names
(for example `page_scrappers/rival_compare.js`).
