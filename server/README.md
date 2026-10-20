# piurivals server

The backend of piurivals: the MySQL database and the scrape worker that reads players' Phoenix 2
sessions from piuscores with headless Chromium. The API comes next. See
[the design](../docs/piurivals_design.md) and [the database tables](../docs/database.md).

## Setup

Needs Node 22+ and MySQL 8.

```sh
npm install                          # from the repo root (npm workspaces)
cp server/.env.example server/.env   # then set DATABASE_URL
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
| `npm run scrape -- <player GUID or link> --dry-run` | Scrape one player's full Phoenix 2 history and print it; no database needed |
| `npm run scrape -- <player GUID or link>` | Scrape one player into the database right away (new sessions since their checkpoint) |
| `npm run queue -- all` | Queue a scrape run of every stored player, for the worker |
| `npm run queue -- register\|selected\|rescan <GUID or link> [...]` | Queue a run for specific players |
| `npm run worker` | Run the scrape worker in the foreground |
| `npm test` | Parser and scan logic tests, against saved pages in `test/fixtures` |
| `npm run typecheck` | Type-check |

## On the VPS

```sh
pm2 start ecosystem.config.cjs   # starts piurivals-worker
pm2 save
```

The worker picks up queued runs one at a time. Until the admin panel exists, runs are queued
with `npm run queue`. `SCRAPE_DELAY_MS` (default 2000) is the pause between page actions on
piuscores.
