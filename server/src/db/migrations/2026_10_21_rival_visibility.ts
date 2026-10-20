import type { Kysely } from 'kysely';

// A rival can be switched off in the Rivals view without being removed from the list.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('user_rivals')
    .addColumn('hidden', 'boolean', (c) => c.notNull().defaultTo(false))
    .execute();
}


export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('user_rivals').dropColumn('hidden').execute();
}
