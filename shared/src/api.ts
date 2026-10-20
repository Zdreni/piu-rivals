// Response types of the piu-rivals API, shared by the server and the site.
// Dates are "YYYY-MM-DD"; times are ISO 8601 UTC ("2026-10-20T10:16:21.245Z").

export interface ApiError {
  error: string;
}

export interface PlayerSummary {
  id: string;
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

export interface MeResponse {
  user: User;
  rivals: PlayerSummary[];
  preferences: Record<string, unknown>;
}

export interface PlayersResponse {
  players: PlayerSummary[];
}

export interface Chart {
  id: number;
  songKey: string;
  songTitle: string;
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
  charts: Chart[];
  bests: BestResult[];
}

export interface AdminUser extends User {
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUsersResponse {
  users: AdminUser[];
}

export interface AdminPlayer extends PlayerSummary {
  createdAt: string;
  plays: number;
  charts: number;
  lastSessionTimestamp: string | null;
}

export interface AdminPlayersResponse {
  players: AdminPlayer[];
}

export interface ImportPlayersResponse {
  added: number;
  // Players that were stored already; they keep their name and the higher PUMBILITY.
  existing: number;
}

export type ScrapeRunKind = 'all' | 'selected' | 'register' | 'rescan';
export type ScrapeRunStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted';

export interface ScrapeFailure {
  playerId: string | null;
  message: string;
  createdAt: string;
}

export interface ScrapeRun {
  id: number;
  kind: ScrapeRunKind;
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
  runs: ScrapeRun[];
}

export interface ScrapeRunResponse {
  run: ScrapeRun;
  failureList: ScrapeFailure[];
}
