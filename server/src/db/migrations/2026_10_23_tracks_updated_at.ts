import { type Kysely, sql } from 'kysely';


// When a track's short title last changed, so /bests can send its charts again to sites that cached them.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('tracks')
    .addColumn('updated_at', sql`datetime(3)`, (c)  =>  c.notNull().defaultTo(sql`CURRENT_TIMESTAMP(3)`))
    .execute();

  await db.schema.createIndex('tracks_updated_idx').on('tracks').column('updated_at').execute();
}


export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('tracks_updated_idx').on('tracks').execute();
  await db.schema.alterTable('tracks').dropColumn('updated_at').execute();
}
