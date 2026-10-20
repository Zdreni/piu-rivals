import type { ScrapeRunKind, ScrapeRunStatus } from '@piu-rivals/shared';
import type { ColumnType, Generated, Insertable, Selectable } from 'kysely';

// Dates come back as strings (the pool uses dateStrings): DATE as "YYYY-MM-DD",
// DATETIME as "YYYY-MM-DD HH:MM:SS" (UTC).
type CreatedAt = ColumnType<string, string | undefined, never>;

export interface PlayersTable {
  id: string;
  name: string | null;
  pumbility: number | null;
  created_at: CreatedAt;
  created_by_user_id: number | null;
  last_scraped_at: string | null;
  // Checkpoint: the two latest scanned sessions, as shown on their cards. The anchor (second
  // latest) never changes, while the latest one may grow and move later.
  last_session_no: Generated<number>;
  last_session_title: string | null;
  last_session_timestamp: string | null;
  anchor_session_title: string | null;
  anchor_session_timestamp: string | null;
}

export interface ChartsTable {
  id: Generated<number>;
  song_key: string;
  song_title: string;
  chart_type: string;
  level: number;
}

export interface PlaysTable {
  id: Generated<number>;
  player_id: string;
  chart_id: number;
  session_no: number;
  played_on: string | null;
  scrape_run_id: number | null;
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
  player_id: string;
  chart_id: number;
  play_id: number;
  score: number;
  // Whether the best try passed.
  passed: number;
  best_played_on: string | null;
  last_played_on: string | null;
  tries: number;
  // When our server last changed the row, "YYYY-MM-DD HH:MM:SS.mmm" UTC.
  updated_at: ColumnType<string, string | undefined, string>;
}

export type { ScrapeRunKind, ScrapeRunStatus };

export interface ScrapeRunsTable {
  id: Generated<number>;
  kind: ScrapeRunKind;
  player_ids: ColumnType<string[] | null, string | null, string | null>;
  status: Generated<ScrapeRunStatus>;
  started_by_user_id: number | null;
  created_at: CreatedAt;
  started_at: string | null;
  finished_at: string | null;
  players_total: Generated<number>;
  players_done: Generated<number>;
  current_player_id: string | null;
  sessions_added: Generated<number>;
  plays_added: Generated<number>;
  bests_improved: Generated<number>;
  cancel_requested: Generated<number>;
}

export interface ScrapeFailuresTable {
  id: Generated<number>;
  scrape_run_id: number;
  player_id: string | null;
  message: string;
  created_at: CreatedAt;
}

export interface UsersTable {
  id: Generated<number>;
  email: string;
  display_name: string | null;
  player_id: string | null;
  is_admin: Generated<number>;
  created_at: CreatedAt;
  last_login_at: string | null;
}

export interface UserRivalsTable {
  user_id: number;
  player_id: string;
  hidden: Generated<number>;
}

export interface UserPreferencesTable {
  user_id: number;
  data: ColumnType<Record<string, unknown>, string, string>;
}

export interface AuthSessionsTable {
  token_hash: string;
  user_id: number;
  created_at: CreatedAt;
  expires_at: string;
}

export interface Database {
  players: PlayersTable;
  charts: ChartsTable;
  plays: PlaysTable;
  best_results: BestResultsTable;
  scrape_runs: ScrapeRunsTable;
  scrape_failures: ScrapeFailuresTable;
  users: UsersTable;
  user_rivals: UserRivalsTable;
  user_preferences: UserPreferencesTable;
  auth_sessions: AuthSessionsTable;
}

export type Player = Selectable<PlayersTable>;
export type NewPlay = Insertable<PlaysTable>;
export type ScrapeRun = Selectable<ScrapeRunsTable>;
