import { type Migration, Migrator } from 'kysely';
import { createDatabase } from './database.ts';
import * as initial from './migrations/2026_10_20_initial.ts';

// Migrations run in name order; add new ones here.
const migrations: Record<string, Migration> = {
  '2026_10_20_initial': initial,
};


const db = createDatabase();
const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
const { error, results } = await migrator.migrateToLatest();

for (const result of results  ||  [])
  console.log(`${result.status === 'Success' ? 'Applied' : 'Failed'} migration ${result.migrationName}`);

if (! results?.length  &&  ! error)
  console.log('Database is up to date');

await db.destroy();
if (error) {
  console.error(error);
  process.exit(1);
}
