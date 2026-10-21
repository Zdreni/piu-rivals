import { type Kysely, sql } from 'kysely';

// The best try's score, pass and date are read from its play instead of being copied into best_results.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('best_results')
    .dropColumn('score')
    .dropColumn('passed')
    .dropColumn('best_played_on')
    .execute();
}


export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('best_results')
    .addColumn('score', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('passed', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('best_played_on', 'date')
    .execute();

  await sql`
    UPDATE best_results b JOIN plays p ON p.id = b.play_id
    SET b.score = p.score, b.passed = p.passed, b.best_played_on = p.played_on`.execute(db);
}
