import { type Kysely, sql } from 'kysely';


// How much each best score rose over the best before it, so the site can show it without the earlier tries.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('best_results').addColumn('improvement', 'integer').execute();

  // The best before a best try is the highest score of the chart's earlier tries, by play order.
  await sql`
    UPDATE best_results b
    JOIN plays p ON p.id = b.play_id
    JOIN (
      SELECT b2.player_id, b2.chart_id, MAX(q.score) AS previous_best
      FROM best_results b2
      JOIN plays q ON q.player_id = b2.player_id AND q.chart_id = b2.chart_id AND q.id < b2.play_id
      GROUP BY b2.player_id, b2.chart_id
    ) earlier ON earlier.player_id = b.player_id AND earlier.chart_id = b.chart_id
    SET b.improvement = p.score - earlier.previous_best
    WHERE p.score > earlier.previous_best`.execute(db);
}


export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('best_results').dropColumn('improvement').execute();
}
