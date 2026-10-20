# piurivals: design

Status: draft for review. Nothing here is implemented yet.

## Overview

```
                    ┌──────────── VPS (pm2) ─────────────┐
piuscores site <────┤ scrape worker (headless Chromium)  │
                    │        │ writes                    │
                    │      MySQL                         │
                    │        │ reads/writes              │
piurivals  <─HTTPS──┤ API server  <── nginx (TLS)        │
(GitHub Pages)      └────────────────────────────────────┘
```

| Folder | What | Stack |
|---|---|---|
| `piuscores-extension/` | Old extension, left untouched | JS |
| `server/` | API server and scrape worker, both from one codebase | Node, TS, Fastify, Kysely, MySQL, Playwright, pm2 |
| `web/` | piurivals site, including the admin section | Vite, React, TS |
| `shared/` | API request/response types, grade/plate/chart helpers | TS |

The root `package.json` declares npm workspaces for `shared`, `server` and `web`.

There is no scraper extension. Scraping runs on the VPS in a background worker, and admins start and watch it from the admin panel. If piuscores ever blocks the VPS, a scraper extension could be added later as a fallback that sends to the same database through the API.

**Players vs users.** A *player* is a piuscores player identified by GUID. There will be many of them (~500), and they are created by registering them for scraping. A *user* is a piurivals account (Google login). There are fewer users; an admin creates each one and can optionally link it to one player. A user without a linked player can use everything except the Rivals tab.

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

All requests and responses are JSON. Authentication uses `Authorization: Bearer <login session token>`. CORS allows `https://zdreni.github.io`.

**Auth and own account**
- `POST /auth/google` with `{ idToken }` returns `{ token, user }`. Only emails added by an admin can log in, with two bootstrap exceptions: emails in the `ADMIN_EMAILS` config, and the first login while the users table is empty, who becomes admin. That second rule means whoever logs in first on a fresh install is admin, so log in yourself right after deploying.
- `POST /auth/logout`
- `GET /me`, `PUT /me/preferences`, `PUT /me/rivals`

**Data**
- `GET /players` lists players (id, name, PUMBILITY) for the rival picker.
- `GET /bests?players=<id,...>&since=<server time>` returns best results with judgments, plus the server's current time to pass as `since` next time. Without `since`, it returns everything for those players. The site keeps the rows in IndexedDB and filters locally.

**Admin** (requires `is_admin`)
- `GET/POST/PATCH/DELETE /admin/users`: email, linked player, `is_admin`
- `GET /admin/players`, `DELETE /admin/players/:id`
- `POST /admin/players/import`: JSON exported from the old extension's `players`, importing GUID, name and PUMBILITY
- `POST /admin/scrape-runs` with `{ kind, playerIds? | playerUrl? }` queues a run
- `GET /admin/scrape-runs` lists runs, newest first
- `GET /admin/scrape-runs/:id` returns progress and failures
- `POST /admin/scrape-runs/:id/cancel`

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
- `ecosystem.config.cjs` defines two pm2 apps, `piurivals-api` and `piurivals-worker`, started with `pm2 start ecosystem.config.cjs`.
- nginx terminates TLS for `api.pumpking.top` and forwards requests to `127.0.0.1:9876`. Example:

```nginx
server {
    listen 443 ssl;   # or the public port you choose
    server_name api.pumpking.top;
    ssl_certificate     /etc/letsencrypt/live/api.pumpking.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.pumpking.top/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:9876;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The public API URL (including the port, if it isn't 443) is set in `web/` config.

### GitHub Pages

1. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
2. The workflow `.github/workflows/pages.yml` builds `web/` with `base: '/piu-rivals/'` and deploys it on every push to `main` that changes `web/` or `shared/`.
3. Routes use hashes (`/#/rivals`), so Pages never needs a server-side fallback.
4. The site lives at `https://zdreni.github.io/piu-rivals/`. Pages always uses https, so the API must be https as well.

### Google login setup (one time)

1. Open <https://console.cloud.google.com>, sign in, and create a project (e.g. `piurivals`).
2. Go to **APIs & Services → OAuth consent screen** (shown as "Google Auth Platform" in newer consoles). Set the app name `piurivals`, your support email and audience **External**. Then **publish** the app. With only the basic `openid email profile` scopes, Google doesn't need to verify it.
3. Under **Clients → Create client**, choose **Web application**. In **Authorized JavaScript origins**, add `https://zdreni.github.io`, plus `http://localhost:5173` for local development. No redirect URIs are needed.
4. Copy the **Client ID**. It goes into `web/` config and `server/.env` as `GOOGLE_CLIENT_ID`. No client secret is needed: the server only checks Google's ID tokens.

## Build order

1. `shared/` and `server/`: schema, migrations, the session page parser with saved-page fixtures, the scrape worker, and a command-line entry to scrape one player for testing
2. `server/`: API, including auth, the admin API and scrape runs
3. `web/`: login, the admin panel (users, players, import, scrape runs with progress), the Pages workflow
4. `web/`: the Rivals view, ported from the old extension's rivals window

## Open items

- Do piuscores session times depend on a logged-in account's settings? This doesn't matter as long as the worker stays anonymous.
- Ask the piuscores owner whether regular scraping is OK, or whether there's an API.
