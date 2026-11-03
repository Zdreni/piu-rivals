import { type Kysely, sql } from 'kysely';


// Runs the worker queues by itself, every SCRAPE_INTERVAL_HOURS.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE scrape_runs MODIFY kind ENUM('all', 'selected', 'register', 'rescan', 'scheduled') NOT NULL`.execute(db);
}


export async function down(db: Kysely<any>): Promise<void> {
  await sql`DELETE FROM scrape_runs WHERE kind = 'scheduled'`.execute(db);
  await sql`ALTER TABLE scrape_runs MODIFY kind ENUM('all', 'selected', 'register', 'rescan') NOT NULL`.execute(db);
}
