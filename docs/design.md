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

A background worker on the VPS scrapes players' sessions from piuscores with headless Chromium, in runs that admins start and watch from the admin panel. How it finds new sessions, keeps each player's checkpoint and parses plays is in [scraping.md](scraping.md).

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
- `GET /players` lists players with scraped results and a name or PUMBILITY (id, name, PUMBILITY) for the Rivals view's Others tab.
- `GET /bests?players=<id,...>&since=<server time>` returns best results with judgments, plus the server's current time to pass as `since` next time. Without `since`, it returns everything for those players. It also returns each player's total number of best results (`counts`), changed or not. The site keeps the rows in IndexedDB and filters locally (see [the Rivals view](#rivals-view)).

**Admin** (requires `is_admin`)
- `GET/POST/PATCH/DELETE /admin/users`: email, display name, linked player (one user per player), `is_admin`. Admins can't remove their own admin rights or delete themselves.
- `GET /admin/players`, `DELETE /admin/players/:id`
- `POST /admin/scrape-runs` with `{ kind, players? }` queues a run, or adds register and selected players to an active register or selected run; `players` are GUIDs or piuscores player links
- `GET /admin/scrape-runs?state=current` lists queued and running runs in the order the worker takes them; `?state=previous[&limit=<n>]` lists finished ones, newest first, 50 per page by default
- `GET /admin/scrape-runs/:id` returns progress, the players with their states, and failures, and the IDs of the runs before and after it
- `POST /admin/scrape-runs/:id/cancel`

## Rivals view

The Rivals tab (`/#/rivals`) is the old extension's rivals window, ported to the site with its logic and look: your totals, the score cap, NP min rivals and count by settings, the rival list with solo mode, the level bars, and the lost / non-matched / won / hidden tabs. Charts below level 10 are left out, as in the extension. The extension's try cooldown is left out; filtering by the days since the last try will come back in a different form. The view fills the window below the menu bar. The rivals column has two tabs: My rivals, and Others, which lists the registered players who aren't your rivals (by PUMBILITY, with a name filter) with a + button to add them, and you among them, to compare with. Removing a rival only takes them off the list. The extension's export of target charts is left out for now.

**Where settings live.** The rival list, with each rival's on/off switch, is in `user_rivals`. The view's settings (score cap, NP min rivals, count by) are the user's preferences. Each change is sent on its own (one rival, or only the changed settings), so two open pages changing different things don't undo each other's changes. Changes show at once and are saved in the background. Preference saves go one at a time, in order. When a save fails, the error is shown and the page reloads the user's state from the server. Solo mode, the focused rival, and the selected level and tabs are per-page state, not saved on the server (level and tab are kept in this browser's `localStorage`).

**Keeping scores current.** Best results are cached in IndexedDB, keyed by player and chart, with the `serverTime` of each player's last download. On opening the view, cached rows are shown at once, then `/bests` is asked for what changed since each player's last download (a newly added rival is loaded in full). Deletions never arrive as changes, e.g. after a rescan, so the site compares each player's cached row count with `counts`. A player whose counts differ is dropped from the cache and loaded again in full. While the page is visible, it syncs again every 5 minutes, and when it comes back into view after more than a minute, reloading `/me` as well for fresh names and PUMBILITY (skipped while a change is being saved). Without IndexedDB (e.g. a private window) everything is loaded once per visit.

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
