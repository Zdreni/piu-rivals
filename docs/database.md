# piu-rivals: database

MySQL schema of the piu-rivals server, created by the Kysely migrations in [server/src/db/migrations/](../server/src/db/migrations/). For how scraping fills it, see [scraping.md](scraping.md).

DATETIME columns are in UTC. Dates come back from the server as strings: `YYYY-MM-DD` for DATE, `YYYY-MM-DD HH:MM:SS` for DATETIME.

## Tables

```
players
  id                        CHAR(36) PK            -- piuscores player GUID
  name                      VARCHAR NULL
  pumbility                 INT NULL               -- highest seen
  created_at                DATETIME
  created_by_user_id        INT NULL FK users
  last_scraped_at           DATETIME NULL
  -- checkpoint: the two latest scanned sessions of any mix, as shown on their cards
  last_session_no           INT DEFAULT 0          -- session_no of the latest scanned Phoenix 2 session
  last_session_title        VARCHAR NULL
  last_session_timestamp    VARCHAR NULL
  anchor_session_title      VARCHAR NULL           -- the session before the latest one
  anchor_session_timestamp  VARCHAR NULL

charts
  id                        INT PK AUTO_INCREMENT
  song_key                  VARCHAR                -- song image name, e.g. "BLAZOR-p2"
  song_title                VARCHAR
  chart_type                VARCHAR                -- "S", "D", ...
  level                     INT
  UNIQUE(song_key, chart_type, level)

plays
  id                        BIGINT PK AUTO_INCREMENT
  player_id                 CHAR(36) FK players
  chart_id                  INT FK charts
  session_no                INT                    -- per-player session counter, assigned by us
  played_on                 DATE NULL              -- date of the session the try was first seen in
  scrape_run_id             INT NULL FK scrape_runs  -- run that stored it
  score                     INT
  grade                     VARCHAR NULL           -- e.g. "sssplus", "aa"
  passed                    BOOL                   -- false for a broken play
  plate                     VARCHAR NULL           -- e.g. "pg"
  perfect                   INT NULL
  great                     INT NULL
  good                      INT NULL
  bad                       INT NULL
  miss                      INT NULL
  max_combo                 INT NULL
  INDEX(player_id, session_no)
  INDEX(player_id, chart_id, score)

best_results                                       -- one row per player and chart
  player_id                 CHAR(36) FK players
  chart_id                  INT FK charts
  play_id                   BIGINT                 -- the best try; its score, pass and date are read from the play
  last_played_on            DATE NULL              -- date of the latest try
  tries                     INT
  updated_at                DATETIME(3)            -- when our server last changed the row (UTC)
  PK(player_id, chart_id)
  INDEX(player_id, updated_at)

scrape_runs
  id                        INT PK AUTO_INCREMENT
  kind                      ENUM(all, selected, register, rescan)
  player_ids                JSON NULL              -- for every kind but "all"
  status                    ENUM(queued, running, done, failed, cancelled, interrupted)
  started_by_user_id        INT NULL FK users
  created_at                DATETIME
  started_at                DATETIME NULL
  finished_at               DATETIME NULL
  players_total             INT
  players_done              INT
  current_player_id         CHAR(36) NULL
  sessions_added            INT
  plays_added               INT
  bests_improved            INT
  cancel_requested          BOOL

scrape_failures
  id                        INT PK AUTO_INCREMENT
  scrape_run_id             INT FK scrape_runs
  player_id                 CHAR(36) NULL          -- null when the whole run failed
  message                   TEXT
  created_at                DATETIME

users
  id                        INT PK AUTO_INCREMENT
  email                     VARCHAR UNIQUE         -- Google account
  display_name              VARCHAR NULL
  player_id                 CHAR(36) NULL UNIQUE FK players  -- "their" piuscores player
  is_admin                  BOOL
  created_at                DATETIME
  last_login_at             DATETIME NULL

user_rivals
  user_id                   INT FK users
  player_id                 CHAR(36) FK players
  hidden                    BOOL DEFAULT false     -- switched off in the Rivals view, but kept in the list
  PK(user_id, player_id)

user_preferences
  user_id                   INT PK FK users
  data                      JSON                   -- the Rivals view's settings: score cap, np minimal rivals, count by

auth_sessions
  token_hash                CHAR(64) PK
  user_id                   INT FK users
  created_at                DATETIME
  expires_at                DATETIME
```

## Notes

- **No sessions table.** Plays have no time of their own, and a session's timestamp moves when scores are re-imported into it, so session timestamps are never stored on plays. They are kept only in the player's checkpoint, to tell new sessions from the grown one and to know where to stop scanning. Each play has the per-player `session_no` of the session it came from, used only to compare a grown session with what was stored from it. Each play also has a date (`played_on`), which feeds the best-score date and the last-try date (max `played_on` over the chart's tries, used by the try cooldown).
- **Try counts are exact.** Identical tries in different sessions are separate rows. Only a grown session is compared with stored tries, and only with its own.
- **Best for a chart** is the play with the highest score (the earliest one on ties). `best_results` points at that play and keeps the last try's date and the number of tries, so reading bests never has to go over all of a player's plays; the best try's score, pass and date come from its play. A row changes whenever a chart gets a new try.
- **`updated_at`** is when our server last wrote the row, in UTC from the database clock; it is never a time read from piuscores. piu-rivals can ask for rows changed since its last download. The server sends its own current time with each response, and the next request asks from that time, so the browser's clock doesn't matter.
- **PUMBILITY** is only raised, never lowered.
- **Deleting a player** (admin only) removes their plays and best results, and unlinks them from any user or rival list.
