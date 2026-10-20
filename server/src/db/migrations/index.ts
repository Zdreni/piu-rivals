import { type Kysely, type Migration, Migrator } from 'kysely';
import type { Database } from '../schema.ts';
import * as initial from './2026_10_20_initial.ts';
import * as rivalVisibility from './2026_10_21_rival_visibility.ts';

// Migrations run in name order; add new ones here.
const migrations: Record<string, Migration> = {
  '2026_10_20_initial': initial,
  '2026_10_21_rival_visibility': rivalVisibility,
};


export function migrateToLatest(db: Kysely<Database>) {
  return new Migrator({ db, provider: { getMigrations: async () => migrations } }).migrateToLatest();
}
