// Response types of the piu-rivals API, shared by the server and the site.
// Dates are "YYYY-MM-DD"; times are ISO 8601 UTC ("2026-10-20T10:16:21.245Z").

export interface ApiError {
  error: string;
}

export interface PlayerSummary {
  id: string;
  // The name an admin set, or else the one scraped from PIU Scores; null before the player is scraped.
  name: string | null;
  pumbility: number | null;
  lastScrapedAt: string | null;
}

export interface User {
  id: number;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  // "Their" piuscores player; null for a user without one (no Rivals tab).
  player: PlayerSummary | null;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: User;
}

// A player in the user's rival list.
export interface Rival extends PlayerSummary {
  // Switched off in the Rivals view: kept in the list, but left out of the comparison.
  hidden: boolean;
}

// The site's own settings (score cap, ...); the server stores them as given.
export type Preferences = Record<string, unknown>;

// The user's settings for one chart.
export interface ChartPreference {
  chartId: number;
  // Hidden from the Rivals view's tabs until then; null when not snoozed (an expired snooze is null too).
  snoozedUntil: string | null;
}

// How long a snooze lasts, as offered: N days end (N - 1) * 24 + 12 hours after the snooze is set.
export type SnoozeDays = 1 | 3 | 7;

export interface MeResponse {
  user: User;
  rivals: Rival[];
  preferences: Preferences;
  chartPreferences: ChartPreference[];
}

export interface RivalsResponse {
  rivals: Rival[];
}

export interface PreferencesResponse {
  preferences: Preferences;
}

export interface ChartPreferencesResponse {
  chartPreferences: ChartPreference[];
}

// A registered player with how much of them is scraped: `plays` scores in all, on `charts` charts.
export interface ListedPlayer extends PlayerSummary {
  plays: number;
  charts: number;
}

export interface PlayersResponse {
  players: ListedPlayer[];
}

export interface Chart {
  id: number;
  songKey: string;
  songTitle: string;
  // Shown where the title doesn't fit; the title unless an admin changed it.
  songShortTitle: string;
  // "S", "D", ...
  chartType: string;
  level: number;
}

// A player's best result on a chart: the try with the highest score.
export interface BestResult {
  playerId: string;
  chartId: number;
  score: number;
  // False when the best try was a broken play.
  passed: boolean;
  grade: string | null;
  plate: string | null;
  perfect: number | null;
  great: number | null;
  good: number | null;
  bad: number | null;
  miss: number | null;
  maxCombo: number | null;
  bestPlayedOn: string | null;
  lastPlayedOn: string | null;
  tries: number;
  updatedAt: string;
}

export interface BestsResponse {
  // Pass as `since` next time to get only the best results changed after this response.
  serverTime: string;
  // The charts of the best results; with `since`, also every chart whose track's short title changed since then.
  charts: Chart[];
  bests: BestResult[];
  // How many best results each requested player has in all, changed or not. A cache holding a different
  // number has missed a deletion (e.g. a rescan) and should load that player in full.
  counts: Record<string, number>;
}

export interface AdminUser extends User {
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUsersResponse {
  users: AdminUser[];
}

export interface AdminPlayer extends ListedPlayer {
  // Our own id, in the order players were added; `id` is the PIU Scores GUID.
  dbId: number;
  // The name on PIU Scores; `name` is the same unless an admin set another one.
  scrapedName: string | null;
  createdAt: string;
  lastSessionTimestamp: string | null;
}

export interface AdminPlayersResponse {
  players: AdminPlayer[];
}

export interface AdminTrack {
  id: number;
  // The song's image name on PIU Scores, e.g. "BLAZOR-p2".
  songKey: string;
  title: string;
  // Shown where the title doesn't fit; the title unless an admin changed it.
  shortTitle: string;
}

export interface AdminTracksResponse {
  tracks: AdminTrack[];
}

export type ScrapeRunKind = 'all' | 'selected' | 'register' | 'rescan';
export type ScrapeRunStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted';

export interface ScrapeFailure {
  playerId: string | null;
  message: string;
  createdAt: string;
}

// waiting: not reached yet; running: being scraped now; skipped: never reached (the run stopped).
export type ScrapeRunPlayerState = 'waiting' | 'running' | 'done' | 'failed' | 'skipped';

export interface ScrapeRunPlayer {
  id: string;
  // null while the player is unknown (not scraped yet).
  name: string | null;
  state: ScrapeRunPlayerState;
}

export interface ScrapeRun {
  id: number;
  kind: ScrapeRunKind;
  // The players asked for; for an "all" run, the players it resolved to once started.
  playerIds: string[] | null;
  status: ScrapeRunStatus;
  startedBy: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  playersTotal: number;
  playersDone: number;
  currentPlayer: PlayerSummary | null;
  sessionsAdded: number;
  playsAdded: number;
  bestsImproved: number;
  cancelRequested: boolean;
  failures: number;
}

export interface ScrapeRunsResponse {
  // Current runs (queued, running) in the order the worker takes them; previous (finished) ones newest
  // first, up to the asked limit.
  runs: ScrapeRun[];
  // There are older finished runs beyond the limit.
  hasMore: boolean;
  // How many runs there are in that state in all, beyond the limit too.
  total: number;
  // When the latest "all players" run started; null if none has yet.
  lastAllRunAt: string | null;
}

export interface ScrapeRunResponse {
  run: ScrapeRun;
  // The run's players in the order the worker takes them.
  players: ScrapeRunPlayer[];
  failureList: ScrapeFailure[];
  // The runs queued just before and after this one; null at either end.
  previousRunId: number | null;
  nextRunId: number | null;
}
