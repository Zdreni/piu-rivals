import { type Kysely, sql } from 'kysely';


// When a user last opened the site, signed in or not; starts from their last sign-in.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('users').addColumn('last_seen_at', 'datetime').execute();
  await sql`UPDATE users SET last_seen_at = last_login_at`.execute(db);
}


export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('users').dropColumn('last_seen_at').execute();
}
