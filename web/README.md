# piu-rivals site

The site at <https://zdreni.github.io/piu-rivals/>: Google sign-in and the admin panel (players,
scrape runs, users). The Rivals view comes next. See [the design](../docs/design.md).

Vite + React + TypeScript. API response types come from [shared/](../shared/src/api.ts).

## Config

`web/.env` holds the Google client ID and the API URL. Both end up in the published page, so
nothing there is secret, and the file is committed. `web/.env.development` points `npm run dev`
at the API running locally.

## Commands

Run from `web/`.

| Command | What |
|---|---|
| `npm run dev` | Site at <http://localhost:5173/piu-rivals/>, using the local API (`npm run api` in `server/`) |
| `npm run build` | Type-check and build into `web/dist` |
| `npm run typecheck` | Type-check only |

Google sign-in works locally only when `http://localhost:5173` is an authorized JavaScript origin
of the OAuth client (see [the Google setup](../docs/google_login_setup.md)).

## Publishing

Every push to `main` that changes `web/` or `shared/` builds the site and publishes it to GitHub
Pages ([.github/workflows/pages.yml](../.github/workflows/pages.yml)). Files in `web/public`, like
the privacy policy, are published as they are.
