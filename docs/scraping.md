# piu-rivals: scraping

How the scrape worker reads players' sessions from piuscores into the database. The code is in [server/src/scraper/](../server/src/scraper/); the tables are in [database.md](database.md).

## Why a browser

piuscores is a Blazor Server app. A plain HTTP request returns only an empty page shell; the content arrives over a live connection after the page loads. The worker therefore drives headless Chromium with Playwright, just as the old extension drove a real page. Sessions pages are public, so no piuscores login is needed. This was tested on 2026-10-19 with a script that rendered `/Player/<id>/Sessions` and expanded all plays.

Session times are formatted by piuscores' own server, not the browser. Renders with the browser time zone set to Kyiv and to Los Angeles were identical. Since all scraping now comes from one place, a session always gets the same timestamp.

## Runs

An admin starts a **scrape run** from the admin panel. A run covers one of:
- **all players**: each player gets their new sessions since their checkpoint
- **selected players**: the same, for chosen players only
- **register player**: paste a piuscores player link or GUID; the player is created (with only the GUID) as soon as it's requested, then fully scraped. If the run doesn't get to them (cancelled, interrupted), the next "all" run does, as it takes never scraped players first
- **rescan**: chosen players' plays are deleted, their checkpoints cleared and their full history scraped again (for when a checkpoint is broken)

The API only inserts a `scrape_runs` row with status `queued`. Register and selected players instead join a register or selected run that is already queued or running, so players added one after another (e.g. from the scrape extension) are scraped together; a player still waiting in an active run isn't added again. The worker reads the run's player list again before each player, under the run's row lock, as does a request adding players, so a run that is finishing either takes the new players or is seen finished and they go to a new run.

The worker (a separate pm2 process) picks up queued runs, one at a time, and scrapes their players in order. It pauses between pages (configurable, default ~2 s) so the load on piuscores is like one person browsing.

## Scraping a player

### Sessions and mixes

A player's Sessions page lists session cards, newest first, a page at a time. Each card shows the mix, a title (e.g. "Official Import · AEOLINA #9184") and a time (e.g. "Wed 21 Oct · 4:28 PM").

Only Phoenix 2 plays are stored, but a player can go back to Phoenix (1) after Phoenix 2, so sessions of both mixes are mixed in the history. Sessions of every mix therefore count the same when finding what's new and moving the checkpoint; only Phoenix 2 sessions are opened and have their plays read.

Phoenix 2 came out on **9 July 2026**, so the history is read only down to the first session from before that date. Card times have no year, so each card's year is the latest one, no later than the card above it, in which its day falls on its weekday.

### The checkpoint

A session's timestamp is not stable: when a player keeps importing scores, they land in their newest session, whose timestamp moves later. Only the newest session can grow.

Each player keeps a checkpoint of the two latest scanned sessions of any mix, by the title and timestamp on their cards:
- the **latest** session; it may have grown since
- the **anchor**, the session before it, which never changes

`last_session_no` is the `session_no` of the latest Phoenix 2 session; it counts Phoenix 2 sessions only.

Checkpoints stored before sessions of other mixes were tracked hold the two latest Phoenix 2 sessions, so Phoenix sessions can sit between their anchor and latest session.

### Steps

1. Open the player's Sessions page and read their name and PUMBILITY. PUMBILITY is read only when the newest session is Phoenix 2; a Phoenix session shows Phoenix's PUMBILITY.
2. **Find what to scan.** Page back through the cards until the latest stored session is found unchanged, or the anchor, or the first session from before Phoenix 2 came out, or the end of the history. If the first card is the latest stored session, unchanged, nothing changed and the player is done (one page load).
   - **Latest stored session found unchanged:** the sessions above it are all new.
   - **Only the anchor found:** the latest stored session has grown. The grown session is taken to be the oldest Phoenix 2 card above the anchor, and the sessions above it are new. Phoenix sessions below it need nothing stored, so they are passed over; this also covers checkpoints from before other mixes were tracked. When the latest stored session was a Phoenix session and a Phoenix 2 one was played since, that Phoenix 2 session is taken as the grown one: its plays are all stored, under the previous Phoenix 2 session's `session_no`, which only matters for telling re-imported tries apart. With no Phoenix 2 card above the anchor, the oldest card is the grown one, which only moves the checkpoint.
   - **Neither found:** if the player has exactly one stored session (latest but no anchor), that session has grown, and the grown session is found the same way among all the cards read; the sessions above it are new. A player with no stored sessions gets their whole history since Phoenix 2 came out, all of it new. In any other case the checkpoint is broken (see [Failures](#failures-and-rescans)).
3. **Scan, oldest first.** A session of another mix only moves the checkpoint. Each Phoenix 2 session is opened, all its plays expanded and every play row parsed (see [Parsing a play row](#parsing-a-play-row)), then stored in its own transaction:
   - A **new session** can't contain stored tries. All its tries are inserted with `session_no = last_session_no + 1` and this session's date.
   - The **grown session** is the previous latest session with re-imported tries. It is compared only with the stored tries of `session_no = last_session_no`, counting identical tries (same chart, score, result stats and max combo). Tries already stored stay as they are, keeping their original date. Only the extra ones are inserted, with the same `session_no` and the grown session's date.
   - Best results are updated for the charts that got new tries.
   - The checkpoint moves: the latest session becomes the anchor (unless this is the grown session, which keeps the anchor), and this session becomes the latest, along with `last_session_no` for a Phoenix 2 session. The checkpoint moves even when the session had nothing worth storing (e.g. only stage breaks).
   - Then the counters on the run are updated.

### Failures and rescans

If neither the latest stored session nor the anchor can be found (e.g. piuscores changed or removed old sessions), the player is reported as a failure, with the error, and the run goes on with the next player. An admin can then run a **rescan** for that player, which deletes their plays, clears their checkpoint and scans their full history again.

### Interruptions

If the worker crashes or the VPS restarts mid-run, every stored session is complete. Sessions are scanned oldest first and the checkpoint moves in the same transaction as the plays, so the checkpoint never skips past an unstored session. Restarting the run (or the next run) continues from each player's checkpoint. Interrupted work is never half-stored, so nothing is counted twice. A run that is `running` while the worker isn't (e.g. after a restart) is marked `interrupted`, and the admin can start it again.

An admin can **cancel** a running run. The worker finishes the current player first, then stops.

## Progress in the admin panel

The run page shows the status; players done out of the total; sessions and plays added; new best results; the current player; and each of the run's players with its state (waiting, scraping now, scraped, failed, or skipped when the run stopped first). A failed player's error is shown under the player; a failure of the run itself is listed on its own. The page polls `GET /admin/scrape-runs/:id` every few seconds while a run is active. The run list keeps a history of past runs.

**Resources:** one headless Chromium page uses about 300–500 MB of RAM, which is fine on the 8 GB VPS. The first full scrape of all players takes a while; later runs only fetch new sessions. Scheduled runs (e.g. nightly) can be added later on top of the same queue.

## Parsing a play row

From each row of a session's "All plays" list:
- song title and song key (from the song image file name, e.g. `DizzyDanceStreetLight`)
- chart type and level (from the difficulty bubble, e.g. `D24`)
- score, grade and plate, stored as their image names (e.g. grade `sssplus`, `aplus`; plate `pg`). piuscores doesn't show a plate on every play.
- `passed`: false for a broken play (the life bar broke, but the play went on to the result screen). piuscores marks these only with a `_broken` grade image (e.g. `aa_broken`), which is stored as grade `aa` and `passed = false`. Broken plays are collected like any other.
- perfect, great, good, bad and miss counts, and max combo (from the result stats strip). Some older imports have no result stats strip, so these may be empty.

Rows without a score, like stage breaks, are skipped. All levels are stored. Only Phoenix 2 plays are stored for now; storing Phoenix plays too would need a `mix` column on plays and opening Phoenix sessions, while the checkpoint already covers both mixes. The parser is built and tested against saved rendered pages, kept as test fixtures.
