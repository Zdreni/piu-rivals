import type { Kysely } from 'kysely';


// The name the site shows for a player, set by an admin; null shows the name scraped from PIU Scores.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('players').addColumn('display_name', 'varchar(100)').execute();
}


export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('players').dropColumn('display_name').execute();
}
