import { createDatabase } from './database.ts';
import { migrateToLatest } from './migrations/index.ts';

// `npm run migrate`: creates or updates the tables.

const db = createDatabase();
const { error, results } = await migrateToLatest(db);

for (const result of results  ||  [])
  console.log(`${result.status === 'Success' ? 'Applied' : 'Failed'} migration ${result.migrationName}`);

if (! results?.length  &&  ! error)
  console.log('Database is up to date');

await db.destroy();
if (error) {
  console.error(error);
  process.exit(1);
}
