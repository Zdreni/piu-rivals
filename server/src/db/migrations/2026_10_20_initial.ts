import { type Kysely, sql } from 'kysely';

const tableOptions = sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`;
const now = sql`CURRENT_TIMESTAMP`;
// Case-sensitive, so keys differing only in case stay apart.
const binaryString = (length: number) => sql`varchar(${sql.raw(String(length))}) COLLATE utf8mb4_bin`;


export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createTable('users')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('email', 'varchar(191)', (c) => c.notNull().unique())
    .addColumn('display_name', 'varchar(100)')
    .addColumn('player_id', 'char(36)', (c) => c.unique())
    .addColumn('is_admin', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(now))
    .addColumn('last_login_at', 'datetime')
    .modifyEnd(tableOptions)
    .execute();

  await db.schema.createTable('players')
    .addColumn('id', 'char(36)', (c) => c.primaryKey())
    .addColumn('name', 'varchar(100)')
    .addColumn('pumbility', 'integer')
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(now))
    .addColumn('created_by_user_id', 'integer', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('last_scraped_at', 'datetime')
    .addColumn('last_session_no', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('last_session_title', 'varchar(255)')
    .addColumn('last_session_timestamp', 'varchar(64)')
    .addColumn('anchor_session_title', 'varchar(255)')
    .addColumn('anchor_session_timestamp', 'varchar(64)')
    .modifyEnd(tableOptions)
    .execute();

  await db.schema.alterTable('users')
    .addForeignKeyConstraint('users_player_fk', ['player_id'], 'players', ['id'], (c) => c.onDelete('set null'))
    .execute();

  await db.schema.createTable('charts')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('song_key', binaryString(191), (c) => c.notNull())
    .addColumn('song_title', 'varchar(255)', (c) => c.notNull())
    .addColumn('chart_type', binaryString(16), (c) => c.notNull())
    .addColumn('level', 'integer', (c) => c.notNull())
    .addUniqueConstraint('charts_song_chart_unique', ['song_key', 'chart_type', 'level'])
    .modifyEnd(tableOptions)
    .execute();

  await db.schema.createTable('scrape_runs')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('kind', sql`enum('all', 'selected', 'register', 'rescan')`, (c) => c.notNull())
    .addColumn('player_ids', 'json')
    .addColumn('status', sql`enum('queued', 'running', 'done', 'failed', 'cancelled', 'interrupted')`,
      (c) => c.notNull().defaultTo('queued'))
    .addColumn('started_by_user_id', 'integer', (c) => c.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(now))
    .addColumn('started_at', 'datetime')
    .addColumn('finished_at', 'datetime')
    .addColumn('players_total', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('players_done', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('current_player_id', 'char(36)')
    .addColumn('sessions_added', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('plays_added', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('bests_improved', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('cancel_requested', 'boolean', (c) => c.notNull().defaultTo(false))
    .modifyEnd(tableOptions)
    .execute();

  await db.schema.createIndex('scrape_runs_status_idx').on('scrape_runs').columns(['status', 'id']).execute();

  await db.schema.createTable('scrape_failures')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('scrape_run_id', 'integer', (c) => c.notNull().references('scrape_runs.id').onDelete('cascade'))
    .addColumn('player_id', 'char(36)')
    .addColumn('message', 'text', (c) => c.notNull())
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(now))
    .modifyEnd(tableOptions)
    .execute();

  await db.schema.createTable('plays')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('player_id', 'char(36)', (c) => c.notNull().references('players.id').onDelete('cascade'))
    .addColumn('chart_id', 'integer', (c) => c.notNull().references('charts.id'))
    .addColumn('session_no', 'integer', (c) => c.notNull())
    .addColumn('played_on', 'date')
    .addColumn('scrape_run_id', 'integer', (c) => c.references('scrape_runs.id').onDelete('set null'))
    .addColumn('score', 'integer', (c) => c.notNull())
    .addColumn('grade', 'varchar(16)')
    .addColumn('passed', 'boolean', (c) => c.notNull())
    .addColumn('plate', 'varchar(16)')
    .addColumn('perfect', 'integer')
    .addColumn('great', 'integer')
    .addColumn('good', 'integer')
    .addColumn('bad', 'integer')
    .addColumn('miss', 'integer')
    .addColumn('max_combo', 'integer')
    .modifyEnd(tableOptions)
    .execute();

  await db.schema.createIndex('plays_player_session_idx').on('plays').columns(['player_id', 'session_no']).execute();
  await db.schema.createIndex('plays_player_chart_idx').on('plays').columns(['player_id', 'chart_id', 'score']).execute();

  await db.schema.createTable('best_results')
    .addColumn('player_id', 'char(36)', (c) => c.notNull().references('players.id').onDelete('cascade'))
    .addColumn('chart_id', 'integer', (c) => c.notNull().references('charts.id'))
    .addColumn('play_id', 'bigint', (c) => c.notNull())
    .addColumn('score', 'integer', (c) => c.notNull())
    .addColumn('passed', 'boolean', (c) => c.notNull())
    .addColumn('best_played_on', 'date')
    .addColumn('last_played_on', 'date')
    .addColumn('tries', 'integer', (c) => c.notNull())
    // When our server last changed the row (UTC), not a time from piuscores.
    .addColumn('updated_at', sql`datetime(3)`, (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP(3)`))
    .addPrimaryKeyConstraint('best_results_pk', ['player_id', 'chart_id'])
    .modifyEnd(tableOptions)
    .execute();

  await db.schema.createIndex('best_results_updated_idx').on('best_results').columns(['player_id', 'updated_at']).execute();

  await db.schema.createTable('user_rivals')
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('player_id', 'char(36)', (c) => c.notNull().references('players.id').onDelete('cascade'))
    .addPrimaryKeyConstraint('user_rivals_pk', ['user_id', 'player_id'])
    .modifyEnd(tableOptions)
    .execute();

  await db.schema.createTable('user_preferences')
    .addColumn('user_id', 'integer', (c) => c.primaryKey().references('users.id').onDelete('cascade'))
    .addColumn('data', 'json', (c) => c.notNull())
    .modifyEnd(tableOptions)
    .execute();

  await db.schema.createTable('auth_sessions')
    .addColumn('token_hash', 'char(64)', (c) => c.primaryKey())
    .addColumn('user_id', 'integer', (c) => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(now))
    .addColumn('expires_at', 'datetime', (c) => c.notNull())
    .modifyEnd(tableOptions)
    .execute();
}


export async function down(db: Kysely<any>): Promise<void> {
  for (const table of [
    'auth_sessions', 'user_preferences', 'user_rivals', 'best_results', 'plays',
    'scrape_failures', 'scrape_runs', 'charts',
  ])
    await db.schema.dropTable(table).execute();

  await db.schema.alterTable('users').dropConstraint('users_player_fk').execute();
  await db.schema.dropTable('players').execute();
  await db.schema.dropTable('users').execute();
}
