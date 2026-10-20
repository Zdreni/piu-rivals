# piu-rivals server

The backend of piu-rivals:
- **API** (`src/server.ts`): Google sign-in, the site's data, and the admin endpoints.
- **Scrape worker** (`src/worker.ts`): reads players' Phoenix 2 sessions from piuscores with
  headless Chromium, for scrape runs queued by admins.

Both use the same MySQL database. See [the design](../docs/design.md) and
[the database tables](../docs/database.md). API response types are in
[shared/src/api.ts](../shared/src/api.ts).

## Setup

Needs Node 22+ and MySQL 8.

```sh
npm install                          # from the repo root (npm workspaces)
cp server/.env.example server/.env   # then fill it in
```

Create the database and its user, e.g. in `mysql -u root -p`:

```sql
CREATE DATABASE piurivals CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'piurivals'@'localhost' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON piurivals.* TO 'piurivals'@'localhost';
```

Then, from `server/`:

```sh
npm run migrate                              # create or update the tables
npx playwright install --with-deps chromium  # once per machine; on Windows, SCRAPER_BROWSER_CHANNEL=msedge can use Edge instead
```

## Commands

Run from `server/`.

| Command | What |
|---|---|
| `npm run api` | Run the API in the foreground (needs `GOOGLE_CLIENT_ID`) |
| `npm run worker` | Run the scrape worker in the foreground |
| `npm run scrape -- <player GUID or link> --dry-run` | Scrape one player's full Phoenix 2 history and print it; no database needed |
| `npm run scrape -- <player GUID or link>` | Scrape one player into the database right away (new sessions since their checkpoint) |
| `npm run queue -- all` | Queue a scrape run of every stored player, for the worker |
| `npm run queue -- register\|selected\|rescan <GUID or link> [...]` | Queue a run for specific players |
| `npm test` | Parser, scan logic and API tests; the API test needs `TEST_DATABASE_URL` (a database it may empty) |
| `npm run typecheck` | Type-check |

## API

All bodies are JSON. Requests other than `/auth/google` and `/health` need
`Authorization: Bearer <token>` from `/auth/google`. Errors are `{ "error": "<message>" }`.

| Endpoint | What |
|---|---|
| `POST /auth/google` `{ idToken }` | Sign in with a Google ID token. Only users added by an admin may sign in, plus emails in `ADMIN_EMAILS` and the very first sign-in (both become admins). Returns `{ token, expiresAt, user }` |
| `POST /auth/logout` | End this session |
| `GET /me` | `{ user, rivals, preferences }` |
| `PUT /me/rivals` `{ playerIds }` | Replace the rival list |
| `PUT /me/preferences` `{ preferences }` | Replace the site's settings object |
| `GET /players` | All players |
| `GET /bests?players=<id,...>[&since=<serverTime>]` | Best results with chart and try details; with `since`, only rows changed since an earlier response's `serverTime` |
| `GET/POST /admin/users`, `PATCH/DELETE /admin/users/:id` | Manage users: email, display name, linked player, admin |
| `GET /admin/players`, `DELETE /admin/players/:id` | Players with play counts; deleting removes their results |
| `POST /admin/players/import` | Players exported from the old extension (see the design) |
| `POST /admin/scrape-runs` `{ kind, players? }` | Queue a run: `all`, or `register`/`selected`/`rescan` with player GUIDs or piuscores links |
| `GET /admin/scrape-runs`, `GET /admin/scrape-runs/:id` | Runs with progress; one run with its failures |
| `POST /admin/scrape-runs/:id/cancel` | Cancel a queued run, or stop a running one after its current player |

## On the VPS

```sh
pm2 start ecosystem.config.cjs   # starts piu-rivals-api and piu-rivals-worker
pm2 save
```

nginx terminates TLS for `api.pumpking.top` and forwards to `127.0.0.1:9876` (see the design for
the config). Turn on gzip for JSON there (`gzip on; gzip_types application/json;`): best results
compress well. `SCRAPE_DELAY_MS` (default 2000) is the worker's pause between page actions on
piuscores.
