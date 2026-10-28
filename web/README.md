# piu-rivals site

The site at <https://zdreni.github.io/piu-rivals/>: Google sign-in, the Rivals view
([src/pages/rivals/](src/pages/rivals/), ported from the old extension's rivals window), the History
view ([src/pages/history/](src/pages/history/)) and the admin panel (players, scrape runs, users). The
chart cards both views show are in [src/components/charts/](src/components/charts/), and both views'
styles are put together in [src/score_views.css](src/score_views.css). Data loading, the score cache and
score logic used by the pages are in [src/data/](src/data/). See [the design](../docs/design.md).

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
Pages ([.github/workflows/deploy.yml](../.github/workflows/deploy.yml), after the server when that changed too). Files in `web/public`, like
the privacy policy, are published as they are.

## Conventions

Follow the coding rules in [../CODING_RULES.md](../CODING_RULES.md).
