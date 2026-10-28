import { type Kysely, sql } from 'kysely';

const tableOptions = sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`;


// A user's settings for single charts; for now only a snooze, which hides the chart until a time.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createTable('user_chart_preferences')
    .addColumn('user_id', 'integer', (c)  =>  c.notNull())
    .addColumn('chart_id', 'integer', (c)  =>  c.notNull())
    .addColumn('snoozed_until', 'datetime')
    .addPrimaryKeyConstraint('user_chart_preferences_pk', ['user_id', 'chart_id'])
    .addForeignKeyConstraint('user_chart_preferences_user_id_fk', ['user_id'], 'users', ['id'], (c)  =>  c.onDelete('cascade'))
    .addForeignKeyConstraint('user_chart_preferences_chart_id_fk', ['chart_id'], 'charts', ['id'], (c)  =>  c.onDelete('cascade'))
    .modifyEnd(tableOptions)
    .execute();
}


export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('user_chart_preferences').execute();
}
