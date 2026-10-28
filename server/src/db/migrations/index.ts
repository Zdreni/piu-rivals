import { type Kysely, type Migration, Migrator } from 'kysely';
import type { Database } from '../schema.ts';
import * as initial from './2026_10_20_initial.ts';
import * as rivalVisibility from './2026_10_21_rival_visibility.ts';
import * as trimBestResults from './2026_10_21_trim_best_results.ts';
import * as playerIntIds from './2026_10_22_player_int_ids.ts';
import * as tracks from './2026_10_23_tracks.ts';
import * as tracksUpdatedAt from './2026_10_23_tracks_updated_at.ts';
import * as playerDisplayNames from './2026_10_24_player_display_names.ts';
import * as userChartPreferences from './2026_10_24_user_chart_preferences.ts';
import * as bestImprovement from './2026_10_25_best_improvement.ts';

// Migrations run in name order; add new ones here.
const migrations: Record<string, Migration> = {
  '2026_10_20_initial': initial,
  '2026_10_21_rival_visibility': rivalVisibility,
  '2026_10_21_trim_best_results': trimBestResults,
  '2026_10_22_player_int_ids': playerIntIds,
  '2026_10_23_tracks': tracks,
  '2026_10_23_tracks_updated_at': tracksUpdatedAt,
  '2026_10_24_player_display_names': playerDisplayNames,
  '2026_10_24_user_chart_preferences': userChartPreferences,
  '2026_10_25_best_improvement': bestImprovement,
};


export function migrateToLatest(db: Kysely<Database>) {
  return new Migrator({ db, provider: { getMigrations: async ()  =>  migrations } }).migrateToLatest();
}
