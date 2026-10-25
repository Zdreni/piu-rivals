import type { ScrapeRunKind, ScrapeRunStatus } from '@piu-rivals/shared';
import type { ColumnType, Generated, Insertable, Selectable } from 'kysely';

// Dates come back as strings (the pool uses dateStrings): DATE as "YYYY-MM-DD",
// DATETIME as "YYYY-MM-DD HH:MM:SS" (UTC).
type CreatedAt = ColumnType<string, string | undefined, never>;

export interface PlayersTable {
  id: Generated<number>;
  // How piuscores (and the API) knows the player.
  piuscores_guid: string;
  // As scraped from PIU Scores.
  name: string | null;
  // Shown on the site instead of `name` when set by an admin.
  display_name: string | null;
  pumbility: number | null;
  created_at: CreatedAt;
  created_by_user_id: number | null;
  last_scraped_at: string | null;
  // Checkpoint: the two latest scanned sessions of any mix, as shown on their cards. The anchor
  // (second latest) never changes, while the latest one may grow and move later.
  // last_session_no counts Phoenix 2 sessions only: it's the session_no of the latest one.
  last_session_no: Generated<number>;
  last_session_title: string | null;
  last_session_timestamp: string | null;
  anchor_session_title: string | null;
  anchor_session_timestamp: string | null;
}

export interface TracksTable {
  id: Generated<number>;
  // The song's image name, e.g. "BLAZOR-p2": two songs may share a title, but not an image.
  song_key: string;
  title: string;
  // Shown where the title doesn't fit; the title unless an admin changed it.
  short_title: string;
  // When the short title last changed, "YYYY-MM-DD HH:MM:SS.mmm" UTC.
  updated_at: ColumnType<string, string | undefined, string>;
}

export interface ChartsTable {
  id: Generated<number>;
  track_id: number;
  chart_type: string;
  level: number;
}

export interface PlaysTable {
  id: Generated<number>;
  player_id: number;
  chart_id: number;
  session_no: number;
  played_on: string | null;
  score: number;
  grade: string | null;
  // MySQL booleans are TINYINT: 1 for a pass, 0 for a broken play.
  passed: number;
  plate: string | null;
  perfect: number | null;
  great: number | null;
  good: number | null;
  bad: number | null;
  miss: number | null;
  max_combo: number | null;
}

export interface BestResultsTable {
  player_id: number;
  chart_id: number;
  // The best try; its score, pass and date are read from the play.
  play_id: number;
  // How much the best score rose over the best before it, by play order; null for a chart's first best.
  improvement: number | null;
  last_played_on: string | null;
  tries: number;
  // When our server last changed the row, "YYYY-MM-DD HH:MM:SS.mmm" UTC.
  updated_at: ColumnType<string, string | undefined, string>;
}

export type { ScrapeRunKind, ScrapeRunStatus };

export interface ScrapeRunsTable {
  id: Generated<number>;
  kind: ScrapeRunKind;
  // May hold players deleted since; 0 is one deleted before players had integer ids.
  player_ids: ColumnType<number[] | null, string | null, string | null>;
  status: Generated<ScrapeRunStatus>;
  started_by_user_id: number | null;
  created_at: CreatedAt;
  started_at: string | null;
  finished_at: string | null;
  players_total: Generated<number>;
  players_done: Generated<number>;
  current_player_id: number | null;
  sessions_added: Generated<number>;
  plays_added: Generated<number>;
  bests_improved: Generated<number>;
  cancel_requested: Generated<number>;
}

export interface ScrapeFailuresTable {
  id: Generated<number>;
  scrape_run_id: number;
  player_id: number | null;
  message: string;
  created_at: CreatedAt;
}

export interface UsersTable {
  id: Generated<number>;
  email: string;
  display_name: string | null;
  player_id: number | null;
  is_admin: Generated<number>;
  created_at: CreatedAt;
  last_login_at: string | null;
}

export interface UserRivalsTable {
  user_id: number;
  player_id: number;
  hidden: Generated<number>;
}

export interface UserPreferencesTable {
  user_id: number;
  data: ColumnType<Record<string, unknown>, string, string>;
}

// A user's settings for one chart. A row whose settings are all null is deleted.
export interface UserChartPreferencesTable {
  user_id: number;
  chart_id: number;
  // Hidden from the Rivals view's tabs until then (UTC); a past time is no snooze.
  snoozed_until: string | null;
}

export interface AuthSessionsTable {
  token_hash: string;
  user_id: number;
  created_at: CreatedAt;
  expires_at: string;
}

export interface Database {
  players: PlayersTable;
  tracks: TracksTable;
  charts: ChartsTable;
  plays: PlaysTable;
  best_results: BestResultsTable;
  scrape_runs: ScrapeRunsTable;
  scrape_failures: ScrapeFailuresTable;
  users: UsersTable;
  user_rivals: UserRivalsTable;
  user_preferences: UserPreferencesTable;
  user_chart_preferences: UserChartPreferencesTable;
  auth_sessions: AuthSessionsTable;
}

export type Player = Selectable<PlayersTable>;
export type NewPlay = Insertable<PlaysTable>;
export type ScrapeRun = Selectable<ScrapeRunsTable>;
