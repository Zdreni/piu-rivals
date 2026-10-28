# piu-rivals admin scraper

A Chrome extension for piu-rivals admins. On a player's profile (`/Player/<id>`) or Sessions
page (`/Player/<id>/Sessions`) on `piuscores.arroweclip.se`, it shows whether the player is in
piu-rivals and when they were last scraped. On every piuscores page, links to players' profiles
and Sessions pages get a green frame for players in piu-rivals and an orange one for players who
aren't, followed by a small yellow **+** button that adds the player and scrapes them, as the
status box's button does. Its title tells how the request went; the link turns green once the
player is scraped.

The extension never scrapes by itself. Its only button, **Add to piu-rivals and scrape**, asks
for a `register` scrape run (`POST /admin/scrape-runs`) and shows the player's progress in it
until the scrape worker is through with the player. When a register or selected run is already
queued or running, the server adds the player to it instead of queueing a new run, so players
added one after another are scraped together. The button is disabled, reading **Already in piu-rivals**, for a player who is
stored, and **Scraping…** while a run covering the player is queued or running.

It is separate from [piuscores-extension](../piuscores-extension), which keeps its scores in the
browser; the two can be installed side by side.

## Signing in

The extension has no sign-in of its own: it uses your piu-rivals login. A content script on
`https://zdreni.github.io/piu-rivals/*` copies the site's session token (`piu-rivals.token` in
the site's `localStorage`) into the extension's `chrome.storage.local`, and removes it when you
sign out on the site. So: sign in on piu-rivals once, then use piuscores.

- Nothing is shown unless the session belongs to an admin (`GET /me`). The server enforces this
  as well: every `/admin/*` endpoint answers 403 to anyone else.
- When the API turns the session down (expired, signed out elsewhere), the copy is dropped and
  not picked up again from a site tab still holding it; open piu-rivals and sign in again.

## How it calls the API

The API's CORS allows only the piu-rivals site, and a content script's requests count as coming
from piuscores. So the piuscores content script only sends messages to the extension's
background service worker (`src/background.js`), which calls the API with the token; the API is
in the manifest's `host_permissions`, so CORS doesn't apply there. The token never reaches the
piuscores page.

| File | What |
|---|---|
| `src/token_sync.js` | Content script on the piu-rivals site: copies the login session |
| `src/background.js` | Service worker: API calls, the admin check, caches of `/me` and `/admin/players` |
| `src/piuscores.js` | Content script on piuscores: finds the page's player, runs the status box |
| `src/ui/badge.js` | The status box (top right, in its own shadow root) |
| `src/player_links.js` | Marks links to players by whether they're in piu-rivals, with their scrape buttons |

## Build

`dist/` is a self-contained extension package, checked in so it can be loaded directly: in
`chrome://extensions`, turn on Developer mode, **Load unpacked**, and pick `dist/`.

After changing `src/`, rebuild and commit `dist/` with the change:

```sh
npm install
npm run build    # or: npm run watch
```

Follow the coding rules in [../CODING_RULES.md](../CODING_RULES.md).
