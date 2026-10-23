import { type Kysely, sql } from 'kysely';

// Songs move out of charts into their own table, tracks, which also gets a short title (the title by
// default) that admins can change. charts point at their track instead of repeating its key and title.
const tableOptions = sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`;


export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createTable('tracks')
    .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    .addColumn('song_key', sql`varchar(191) COLLATE utf8mb4_bin`, (c) => c.notNull().unique())
    .addColumn('title', 'varchar(255)', (c) => c.notNull())
    .addColumn('short_title', 'varchar(255)', (c) => c.notNull())
    .modifyEnd(tableOptions)
    .execute();

  // New ids go in the order the songs were first seen.
  await sql`
    INSERT INTO tracks (song_key, title, short_title)
    SELECT song_key, MIN(song_title), MIN(song_title) FROM charts GROUP BY song_key ORDER BY MIN(id)`.execute(db);

  await sql`ALTER TABLE charts ADD COLUMN track_id int NULL AFTER id`.execute(db);
  await sql`UPDATE charts JOIN tracks ON tracks.song_key = charts.song_key SET charts.track_id = tracks.id`.execute(db);
  await sql`
    ALTER TABLE charts DROP INDEX charts_song_chart_unique, DROP COLUMN song_key, DROP COLUMN song_title,
    MODIFY track_id int NOT NULL,
    ADD CONSTRAINT charts_track_chart_unique UNIQUE (track_id, chart_type, level),
    ADD CONSTRAINT charts_track_id_fk FOREIGN KEY (track_id) REFERENCES tracks (id)`.execute(db);
}


export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE charts DROP FOREIGN KEY charts_track_id_fk, DROP INDEX charts_track_chart_unique,
    ADD COLUMN song_key varchar(191) COLLATE utf8mb4_bin NULL AFTER track_id,
    ADD COLUMN song_title varchar(255) NULL AFTER song_key`.execute(db);

  await sql`
    UPDATE charts JOIN tracks ON tracks.id = charts.track_id
    SET charts.song_key = tracks.song_key, charts.song_title = tracks.title`.execute(db);

  await sql`
    ALTER TABLE charts DROP COLUMN track_id,
    MODIFY song_key varchar(191) COLLATE utf8mb4_bin NOT NULL, MODIFY song_title varchar(255) NOT NULL,
    ADD CONSTRAINT charts_song_chart_unique UNIQUE (song_key, chart_type, level)`.execute(db);

  await db.schema.dropTable('tracks').execute();
}
