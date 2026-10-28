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
- `GET /me` returns the user, their rivals, their preferences and their chart preferences (snoozes). A user's own player is never in their rival list.
- `POST /me/rivals`, `PATCH /me/rivals/:id` (`{ hidden }`), `DELETE /me/rivals/:id` add, switch off and remove one rival; `PUT /me/rivals` replaces the list. Each returns the whole rival list.
- `PATCH /me/chart-preferences/:chartId` with `{ snoozeDays }` snoozes one chart for 1, 3 or 7 days, or wakes it (`null`). The server works out the end time from its clock, and returns the chart preferences in force.
- `PATCH /me/preferences` with `{ changes }` changes only the given settings (`null` removes one); `PUT /me/preferences` replaces them all. The server stores preferences as given; the site checks them when reading.

**Data**
- `GET /players` lists players with scraped results and a name or PUMBILITY (id, name, PUMBILITY) for the Rivals view's Others tab.
- `GET /bests?players=<id,...>&since=<server time>` returns best results with result stats, plus the server's current time to pass as `since` next time. Without `since`, it returns everything for those players. It also returns each player's total number of best results (`counts`), changed or not. Each chart comes with its track's title and short title; with `since`, the charts of tracks whose short title changed since then come too, so cached charts pick up new short names. Chart cards show the short title, with the full one on hover. The site keeps the rows in IndexedDB and filters locally (see [the Rivals view](#rivals-view)).

**Admin** (requires `is_admin`)
- `GET/POST/PATCH/DELETE /admin/users`: email, display name, linked player (one user per player), `is_admin`. The list also has how many rivals each user has, and how many of them are switched off. Admins can't remove their own admin rights or delete themselves.
- `GET /admin/users/:id` returns one user for their page (`/#/admin/users/:id`, opened by their name in the Users list): their account, and their rival list, Rivals view settings and number of snoozed charts, to look at only. The Users list only shows each user's name (admins' in bold yellow), last sign-in and rivals; their name, player and admin rights are changed, and the user deleted, on their page.
- `GET /admin/players`, `DELETE /admin/players/:id`; `PATCH /admin/players/:id` sets the name the site shows for the player (empty: their name on PIU Scores)
- `GET /admin/tracks`; `PATCH /admin/tracks/:id` sets a track's short name, which can't be another track's name or short name (empty: its name)
- `POST /admin/scrape-runs` with `{ kind, players? }` queues a run, or adds register and selected players to an active register or selected run; `players` are GUIDs or piuscores player links
- `GET /admin/scrape-runs?state=current` lists queued and running runs in the order the worker takes them; `?state=previous[&limit=<n>]` lists finished ones, newest first, 50 per page by default
- `GET /admin/scrape-runs/:id` returns progress, the players with their states, and failures, and the IDs of the runs before and after it
- `POST /admin/scrape-runs/:id/cancel`

## Rivals view

The Rivals tab (`/#/rivals`) is the old extension's rivals window, ported to the site with its logic and look: your totals, the score cap, unplayed min rivals, min and max level, and count by settings, the rival list with solo mode, the level bars, and the lost / non-matched / won / hidden tabs. Charts are compared within the min and max level. The first time your bests are loaded and they aren't set, they're worked out from your bests and saved, so they don't change later without you: the min level is the lowest level you have bests on 3 charts of, and the max level is one above the highest level you have played. With no bests yet, they're levels 10 and up, as in the extension, and aren't saved. The Others tab always compares levels 10 and up. The extension's try cooldown is left out; filtering by the days since the last try will come back in a different form. The view fills the window below the menu bar. The rivals column has two tabs: My rivals, and Others, which lists the registered players who aren't your rivals (by PUMBILITY, with a name filter) with a + button to add them, and you among them, to compare with. Removing a rival only takes them off the list. The extension's export of target charts is left out for now.

**Snoozes.** A click on a card's header unrolls it: the track's full name, then a `Snooze…` button and the chart. The button opens a menu of 1, 3 and 7 days, turns red and dims the card; a length snoozes the chart. A click anywhere else only closes the menu, without doing what it would otherwise do, and so does Escape. Wake is sent at once. A snoozed or woken card fades out, and the cards after it move into its place. A snooze of N days lasts (N − 1) × 24h + 12h: it outlasts any session, while a 1-day snooze set in the evening may still hide the chart the next morning, and a fixed length doesn't depend on time zones. A snoozed chart counts as hidden under the same rules as the score cap: it leaves its tab and goes to the Hidden tab's Snoozed group, above the score cap's (soonest to wake first, and only there when the score cap hides it too), whatever its scores do meanwhile, and its losses and non-matches count as hidden in the totals, the level bars and solo stats, but not in the rivals' own stats. Its header always shows the time left (`Snoozed for 30h`, or in days beyond 48 hours, e.g. `Snoozed for 3d`, rounded up and counted on the browser's clock) and a Wake button, without unrolling. Charts in the Hidden tab are hidden already, so they can't be snoozed there. It comes back by itself when the time is up; the page checks every minute. Snoozes are per user, in `user_chart_preferences`, kept apart from scores so neither can overwrite the other; the table has room for other per-chart settings later.

**Where settings live.** The rival list, with each rival's on/off switch, is in `user_rivals`. The view's settings (score cap, unplayed min rivals, min and max level, count by) are the user's preferences. Each change is sent on its own (one rival, or only the changed settings), so two open pages changing different things don't undo each other's changes. Changes show at once and are saved in the background. Preference saves go one at a time, in order. When a save fails, the error is shown and the page reloads the user's state from the server. Solo mode, the focused rival, and the selected level and tabs are per-page state, not saved on the server (level and tab are kept in this browser's `localStorage`).

**Keeping scores current.** Best results are cached in IndexedDB, keyed by player and chart, with the `serverTime` of each player's last download. On opening the view, cached rows are shown at once, then `/bests` is asked for what changed since each player's last download (a newly added rival is loaded in full). Deletions never arrive as changes, e.g. after a rescan, so the site compares each player's cached row count with `counts`. A player whose counts differ is dropped from the cache and loaded again in full. While the page is visible, it syncs again every 5 minutes, and when it comes back into view after more than a minute, reloading `/me` as well for fresh names and PUMBILITY (skipped while a change is being saved). Without IndexedDB (e.g. a private window) everything is loaded once per visit.

## History

The History page (`/#/history`, next to Rivals in the menu bar) lists your best results, of any level, as cards like in the Rivals view, grouped by the day each best was set, the latest day first. Tries have no time of their own, so charts of the same day are listed by track. Your row shows, in the diff column and in your score's colour, how much the best rose over your previous one, with a plus, e.g. "+12,345". It comes from `best_results.improvement`, worked out on the server whenever a best is updated: the best score less the highest earlier try, by play order (within a session, the order the page lists them in); none for a chart's first best. Your rivals switched on are compared on the cards, which fold their scores like in the tab of the chart's tier; snoozes don't apply. It lists 60 charts, and 60 more with each click on Show more. It uses the same cached best results as the Rivals view, and syncs the same way.

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
- Clean up unused rows of `user_chart_preferences` (see [database.md](database.md#notes)): today they are only cleared for a user who changes a chart's settings again. Fine with few users and snoozes, but a scale issue later.
