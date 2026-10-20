# piu-rivals: design

Status: draft for review. Nothing here is implemented yet.

## Overview

```
                    ┌──────────── VPS (pm2) ─────────────┐
piuscores site <────┤ scrape worker (headless Chromium)  │
                    │        │ writes                    │
                    │      MySQL                         │
                    │        │ reads/writes              │
piu-rivals  <─HTTPS──┤ API server  <── nginx (TLS)        │
(GitHub Pages)      └────────────────────────────────────┘
```

| Folder | What | Stack |
|---|---|---|
| `piuscores-extension/` | Old extension, left untouched | JS |
| `server/` | API server and scrape worker, both from one codebase | Node, TS, Fastify, Kysely, MySQL, Playwright, pm2 |
| `web/` | piu-rivals site, including the admin section | Vite, React, TS |
| `shared/` | API request/response types, grade/plate/chart helpers | TS |

The root `package.json` declares npm workspaces for `shared`, `server` and `web`.

There is no scraper extension. Scraping runs on the VPS in a background worker, and admins start and watch it from the admin panel. If piuscores ever blocks the VPS, a scraper extension could be added later as a fallback that sends to the same database through the API.

**Players vs users.** A *player* is a piuscores player identified by GUID. There will be many of them (~500), and they are created by registering them for scraping. A *user* is a piu-rivals account (Google login). There are fewer users; an admin creates each one and can optionally link it to one player. A user without a linked player can use everything except the Rivals tab.

## Scraping

### Why a browser

piuscores is a Blazor Server app. A plain HTTP request returns only an empty page shell; the content arrives over a live connection after the page loads. The worker therefore drives headless Chromium with Playwright, just as the old extension drove a real page. Sessions pages are public, so no piuscores login is needed. This was tested on 2026-10-19 with a script that rendered `/Player/<id>/Sessions` and expanded all plays.

Session times are formatted by piuscores' own server, not the browser. Renders with the browser time zone set to Kyiv and to Los Angeles were identical. Since all scraping now comes from one place, a session always gets the same timestamp.

### Runs

An admin starts a **scrape run** from the admin panel. A run covers one of:
- **all players**: each player gets their new sessions since their checkpoint
- **selected players**: the same, for chosen players only
- **register player**: paste a piuscores player link or GUID; the player is created and fully scraped
- **rescan**: chosen players' plays are deleted, their checkpoints cleared and their full history scraped again (for when a checkpoint is broken)

The API only inserts a `scrape_runs` row with status `queued`. The worker (a separate pm2 process) picks up queued runs, one at a time, and works through the players:

1. Open the player's Sessions page and read their name and PUMBILITY.
2. **Check for new results.** If the first session card still has exactly the stored title and timestamp of the latest scanned session, nothing changed and the player is done (one page load).
3. **Find what to scan.** A session's timestamp is not stable: when a player keeps importing scores, they land in their newest session, whose timestamp moves later. Only the newest session can grow, so the second-newest scanned session (the **anchor**) never changes. The worker pages back through Phoenix 2 sessions until it finds the latest stored session unchanged, or the anchor, or reaches the first Phoenix (1) session or the end of the history:
   - **Latest stored session found unchanged:** only the sessions above it are scanned, and all of them are new.
   - **Only the anchor found:** the latest stored session has grown. The session right above the anchor is that grown session, and the sessions above it are new.
   - **Neither found:** if the player has exactly one stored session (latest but no anchor), that session has grown, and it is the oldest Phoenix 2 session in the history. A player with no stored sessions gets their full Phoenix 2 history scanned, all of it new. In any other case the checkpoint is broken (see below).
4. **Scan, oldest first.** Open each session, expand all plays, and parse every play row. Each session is stored in its own transaction:
   - A **new session** (the latest stored session is still on the page unchanged, or this session is above the grown one) can't contain stored tries. All its tries are inserted with `session_no = last_session_no + 1` and this session's date.
   - The **grown session** (the latest stored session is gone from the page, and this is the session right above the anchor) is the previous latest session with re-imported tries. It is compared only with the stored tries of `session_no = last_session_no`, counting identical tries (same chart, score, judgments and max combo). Tries already stored stay as they are, keeping their original date. Only the extra ones are inserted, with the same `session_no` and the grown session's date.
   - Best results are updated for the charts that got new tries.
   - The player's checkpoint moves: the latest session's title and timestamp become the anchor's (unless this is the grown session, which keeps the anchor), and this session's become the latest, along with `last_session_no`. The checkpoint moves even when the session had nothing worth storing (e.g. only stage breaks).
   - Then the counters on the run are updated.

If the anchor can't be found (e.g. piuscores changed or removed old sessions), the player is reported as a failure. An admin can then run a **rescan** for that player, which deletes their plays, clears their checkpoint and scans their full history again.
5. Pause between pages (configurable, default ~2 s) so the load on piuscores is like one person browsing.

If the worker crashes or the VPS restarts mid-run, every stored session is complete. Sessions are scanned oldest first and the checkpoint moves in the same transaction as the plays, so the checkpoint never skips past an unstored session. Restarting the run (or the next run) continues from each player's checkpoint. Interrupted work is never half-stored, so nothing is counted twice. A run that is `running` while the worker isn't (e.g. after a restart) is marked `interrupted`, and the admin can start it again.

An admin can **cancel** a running run. The worker finishes the current session first, then stops.

**Progress in the admin panel:** status; players done out of the total; sessions and plays added; new best results; current player; and failures, listing the player and error message. The panel polls `GET /admin/scrape-runs/:id` every few seconds while a run is active. The run list keeps a history of past runs.

**Resources:** one headless Chromium page uses about 300–500 MB of RAM, which is fine on the 8 GB VPS. The first full scrape of all players with complete history takes hours; later runs only fetch new sessions. Scheduled runs (e.g. nightly) can be added later on top of the same queue.

### Parsing a play row

From each row of a session's "All plays" list:
- song title and song key (from the song image file name, e.g. `DizzyDanceStreetLight`)
- chart type and level (from the difficulty bubble, e.g. `D24`)
- score, grade and plate, stored as their image names (e.g. grade `sssplus`, `aplus`; plate `pg`). piuscores doesn't show a plate on every play.
- `passed`: false for a broken play (the life bar broke, but the play went on to the result screen). piuscores marks these only with a `_broken` grade image (e.g. `aa_broken`), which is stored as grade `aa` and `passed = false`. Broken plays are collected like any other.
- perfect, great, good, bad and miss counts, and max combo (from the judgment strip). Some older imports have no judgment strip, so these may be empty.

Rows without a score, like stage breaks, are skipped. All levels are stored. Only Phoenix 2 is scraped for now; Phoenix may be added later, which will need a `mix` column on plays and a separate checkpoint per mix. The parser is built and tested against saved rendered pages, kept as test fixtures.

## Database

The tables, their fields and how they fit together are in [database.md](database.md).

## API

All requests and responses are JSON; response types are in [shared/src/api.ts](../shared/src/api.ts), and the endpoint list is in [server/README.md](../server/README.md#api). Authentication uses `Authorization: Bearer <login session token>`. CORS allows `https://zdreni.github.io` (and `http://localhost:5173` for development).

**Auth and own account**
- `POST /auth/google` with `{ idToken }` returns `{ token, expiresAt, user }`. Sessions last 30 days (`SESSION_DAYS`); only a hash of the token is stored. Only emails added by an admin can log in, with two bootstrap exceptions: emails in the `ADMIN_EMAILS` config, and the first login while the users table is empty, who becomes admin. That second rule means whoever logs in first on a fresh install is admin, so log in yourself right after deploying.
- `POST /auth/logout`
- `GET /me` returns the user, their rivals and their preferences. A user's own player is never in their rival list.
- `POST /me/rivals`, `PATCH /me/rivals/:id` (`{ hidden }`), `DELETE /me/rivals/:id` add, switch off and remove one rival; `PUT /me/rivals` replaces the list. Each returns the whole rival list.
- `PATCH /me/preferences` with `{ changes }` changes only the given settings (`null` removes one); `PUT /me/preferences` replaces them all. The server stores preferences as given; the site checks them when reading.

**Data**
- `GET /players` lists players (id, name, PUMBILITY) for the rival picker.
- `GET /bests?players=<id,...>&since=<server time>` returns best results with judgments, plus the server's current time to pass as `since` next time. Without `since`, it returns everything for those players. It also returns each player's total number of best results (`counts`), changed or not. The site keeps the rows in IndexedDB and filters locally (see [the Rivals view](#rivals-view)).

**Admin** (requires `is_admin`)
- `GET/POST/PATCH/DELETE /admin/users`: email, display name, linked player (one user per player), `is_admin`. Admins can't remove their own admin rights or delete themselves.
- `GET /admin/players`, `DELETE /admin/players/:id`
- `POST /admin/players/import`: JSON exported from the old extension's `players`, importing GUID, name and PUMBILITY. Returns how many were added and how many already existed.
- `POST /admin/scrape-runs` with `{ kind, players? }` queues a run; `players` are GUIDs or piuscores player links
- `GET /admin/scrape-runs` lists runs, newest first
- `GET /admin/scrape-runs/:id` returns progress and failures
- `POST /admin/scrape-runs/:id/cancel`

## Rivals view

The Rivals tab (`/#/rivals`) is the old extension's rivals window, ported to the site with its logic and look: your totals, the score cap, NP min rivals and count by settings, the rival list with solo mode, the level bars, and the lost / non-matched / won / hidden tabs. Charts below level 10 are left out, as in the extension. The extension's try cooldown is left out; filtering by the days since the last try will come back in a different form. Rivals are added by name from all registered players, and removing one only takes them off the list.

**Where settings live.** The rival list, with each rival's on/off switch, is in `user_rivals`. The view's settings (score cap, NP min rivals, count by) are the user's preferences. Each change is sent on its own (one rival, or only the changed settings), so two open pages changing different things don't undo each other's changes. Changes show at once and are saved in the background. Preference saves go one at a time, in order. When a save fails, the error is shown and the page reloads the user's state from the server. Solo mode, the focused rival, and the selected level and tab are per-page state, not saved on the server (level and tab are kept in this browser's `localStorage`).

**Keeping scores current.** Best results are cached in IndexedDB, keyed by player and chart, with the `serverTime` of each player's last download. On opening the view, cached rows are shown at once, then `/bests` is asked for what changed since each player's last download (a newly added rival is loaded in full). Deletions never arrive as changes, e.g. after a rescan, so the site compares each player's cached row count with `counts`. A player whose counts differ is dropped from the cache and loaded again in full. While the page is visible, it syncs again every 5 minutes, and when it comes back into view after more than a minute, reloading `/me` as well for fresh names and PUMBILITY (skipped while a change is being saved). Without IndexedDB (e.g. a private window) everything is loaded once per visit.

## Exporting players from the old extension

On `piuscores.arroweclip.se`, open DevTools. In the console's context dropdown, pick the "PIU Scores Scraper" extension, then run:

```js
chrome.storage.local.get('players').then(({ players }) => copy(JSON.stringify(players)));
```

This copies the players to the clipboard. Paste the result into the admin panel's import field. Imported players are then picked up by the next "all players" run.

## Deployment

### Server (VPS)

- `server/.env` holds `PORT`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `ADMIN_EMAILS`, `CORS_ORIGIN`, `SCRAPE_DELAY_MS`.
- Playwright installs its own Chromium on the VPS (`npx playwright install --with-deps chromium`).
- Database migrations are Kysely migrations, run with `npm run migrate`.
- `ecosystem.config.cjs` defines two pm2 apps, `piu-rivals-api` and `piu-rivals-worker`, started with `pm2 start ecosystem.config.cjs`.
- Pushes to `main` that change `server/` or `shared/` deploy automatically: the `Deploy` workflow tests the server, then runs `server/deploy.sh` on the VPS over SSH (packages, migrations, pm2 restart, health check), using a key that may only run that script.
- nginx terminates TLS on `https://api.pumpking.top:6767` and forwards requests to the API on `127.0.0.1:9876`. The public API URL is set in `web/.env`.

The step-by-step setup is in [vps_deployment.md](vps_deployment.md).

### GitHub Pages

1. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
2. The workflow `.github/workflows/deploy.yml` builds `web/` with `base: '/piu-rivals/'` and deploys it on every push to `main` that changes `web/` or `shared/`, after the server's deploy when that changed too.
3. Routes use hashes (`/#/rivals`), so Pages never needs a server-side fallback.
4. The site lives at `https://zdreni.github.io/piu-rivals/`. Pages always uses https, so the API must be https as well.

### Google login setup (one time)

The steps for the Google Cloud project `piu-rivals` are in [google_login_setup.md](google_login_setup.md).

## Build order

1. ✅ `server/`: schema, migrations, the session page parser with saved-page fixtures, the scrape worker, and a command-line entry to scrape one player for testing
2. ✅ `shared/` and `server/`: API, including auth, the admin API and scrape runs
3. ✅ `web/`: login, the admin panel (users, players, import, scrape runs with progress), the Pages workflow
4. ✅ `web/`: the Rivals view, ported from the old extension's rivals window

## Open items

- Do piuscores session times depend on a logged-in account's settings? This doesn't matter as long as the worker stays anonymous.
- Ask the piuscores owner whether regular scraping is OK, or whether there's an API.
