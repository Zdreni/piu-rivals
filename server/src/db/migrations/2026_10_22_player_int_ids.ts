import { type Kysely, sql } from 'kysely';

// Players get an integer key: the piuscores GUID moves to players.piuscores_guid, and every table that
// pointed at a player by GUID points at the new id instead. plays also loses scrape_run_id, which
// nothing read. The large tables (plays, best_results, user_rivals) are copied into new ones in one
// pass instead of being altered column by column.

type Db = Kysely<any>;
type ForeignKey = [name: string, column: string, table: string, onDelete: 'cascade' | 'set null' | null];

// The player column type and the players column to look it up by, in each direction.
const TO_ID = { type: sql`int`, from: 'piuscores_guid', to: 'id' };
const TO_GUID = { type: sql`char(36)`, from: 'id', to: 'piuscores_guid' };
type Direction = typeof TO_ID;

const PLAYS_COLUMNS = ['id', 'chart_id', 'session_no', 'played_on', 'score', 'grade', 'passed', 'plate',
  'perfect', 'great', 'good', 'bad', 'miss', 'max_combo'];

const COPIED_TABLES: { table: string; columns: string[]; foreignKeys: ForeignKey[] }[] = [
  {
    table: 'plays',
    columns: PLAYS_COLUMNS,
    foreignKeys: [['plays_player_id_fk', 'player_id', 'players', 'cascade'], ['plays_chart_id_fk', 'chart_id', 'charts', null]],
  },
  {
    table: 'best_results',
    columns: ['chart_id', 'play_id', 'last_played_on', 'tries', 'updated_at'],
    foreignKeys: [
      ['best_results_player_id_fk', 'player_id', 'players', 'cascade'], ['best_results_chart_id_fk', 'chart_id', 'charts', null],
    ],
  },
  {
    table: 'user_rivals',
    columns: ['user_id', 'hidden'],
    foreignKeys: [['user_rivals_user_id_fk', 'user_id', 'users', 'cascade'], ['user_rivals_player_id_fk', 'player_id', 'players', 'cascade']],
  },
];

// Player columns converted in place, on small tables. A GUID of a deleted player becomes null.
const ALTERED_COLUMNS: { table: string; column: string; foreignKey: ForeignKey }[] = [
  { table: 'users', column: 'player_id', foreignKey: ['users_player_fk', 'player_id', 'players', 'set null'] },
  {
    table: 'scrape_runs', column: 'current_player_id',
    foreignKey: ['scrape_runs_current_player_id_fk', 'current_player_id', 'players', 'set null'],
  },
  // A deleted player's failures go with them; null means a failure of the whole run.
  { table: 'scrape_failures', column: 'player_id', foreignKey: ['scrape_failures_player_id_fk', 'player_id', 'players', 'cascade'] },
];


async function dropForeignKey(db: Db, table: string, name: string) {
  await sql`ALTER TABLE ${sql.table(table)} DROP FOREIGN KEY ${sql.id(name)}`.execute(db);
}


async function addForeignKey(db: Db, table: string, [name, column, target, onDelete]: ForeignKey) {
  await sql`
    ALTER TABLE ${sql.table(table)} ADD CONSTRAINT ${sql.id(name)} FOREIGN KEY (${sql.id(column)})
    REFERENCES ${sql.table(target)} (id) ${(onDelete  ?  sql.raw(`ON DELETE ${onDelete.toUpperCase()}`)  :  sql``)}`.execute(db);
}


async function alterPlayerColumn(db: Db, table: string, column: string, direction: Direction) {
  const t = sql.table(table);
  await sql`ALTER TABLE ${t} ADD COLUMN new_player_ref ${direction.type} NULL AFTER ${sql.id(column)}`.execute(db);
  await sql`
    UPDATE ${t} JOIN players p ON p.${sql.id(direction.from)} = ${t}.${sql.id(column)}
    SET ${t}.new_player_ref = p.${sql.id(direction.to)}`.execute(db);

  await sql`ALTER TABLE ${t} DROP COLUMN ${sql.id(column)}, RENAME COLUMN new_player_ref TO ${sql.id(column)}`.execute(db);
}


// Copies the table into a new one with the player column converted, then replaces it. `change` alters
// the new, empty table further; `values` gives what the columns missing from the old table get.
async function copyWithPlayerColumn(
  db: Db, table: string, columns: string[], direction: Direction, change = sql``, values: string[] = [],
) {
  const t = sql.table(table);
  const copy = sql.table(`${table}_copy`);
  await sql`CREATE TABLE ${copy} LIKE ${t}`.execute(db);
  await sql`ALTER TABLE ${copy} MODIFY player_id ${direction.type} NOT NULL ${change}`.execute(db);
  await sql`
    INSERT INTO ${copy} (player_id, ${sql.join([...columns, ...values].map((c)  =>  sql.id(c)))})
    SELECT p.${sql.id(direction.to)}, ${sql.join(columns.map((c)  =>  sql`old.${sql.id(c)}`))}${(values.length  ?  sql`, ${sql.join(values.map(()  =>  sql`NULL`))}`  :  sql``)}
    FROM ${t} old JOIN players p ON p.${sql.id(direction.from)} = old.player_id`.execute(db);

  await sql`DROP TABLE ${t}`.execute(db);
  await sql`RENAME TABLE ${copy} TO ${t}`.execute(db);
}


// scrape_runs.player_ids is a JSON list, converted in code. A deleted player becomes 0 (no player) in
// a list of ids, keeping the list's positions; in a list of GUIDs, that player is gone.
async function convertRunPlayerLists(db: Db, direction: Direction) {
  const players = await sql<{ from: string | number; to: string | number }>`
    SELECT ${sql.id(direction.from)} AS \`from\`, ${sql.id(direction.to)} AS \`to\` FROM players`.execute(db);

  const lookup = new Map(players.rows.map((p)  =>  [String(p.from), p.to]));
  const runs = await sql<{ id: number; player_ids: (string | number)[] }>`
    SELECT id, player_ids FROM scrape_runs WHERE player_ids IS NOT NULL`.execute(db);

  for (const run of runs.rows) {
    const converted = (direction === TO_ID
      ?  run.player_ids.map((guid)  =>  lookup.get(String(guid))  ??  0)
      :  run.player_ids.map((id)  =>  lookup.get(String(id))).filter((guid)  =>  guid !== undefined));

    await sql`UPDATE scrape_runs SET player_ids = ${JSON.stringify(converted)} WHERE id = ${run.id}`.execute(db);
  }
}


export async function up(db: Db): Promise<void> {
  // players.id can only change once nothing points at it.
  await dropForeignKey(db, 'users', 'users_player_fk');
  for (const { table, foreignKeys } of COPIED_TABLES)
    await dropForeignKey(db, table, foreignKeys.find(([, column])  =>  column === 'player_id')![0]);

  await dropForeignKey(db, 'plays', 'plays_scrape_run_id_fk');

  // New ids go in the order the players were added.
  await sql`
    ALTER TABLE players DROP PRIMARY KEY, RENAME COLUMN id TO piuscores_guid,
    ADD CONSTRAINT players_piuscores_guid_unique UNIQUE (piuscores_guid)`.execute(db);

  await sql`ALTER TABLE players ADD COLUMN id int NULL FIRST`.execute(db);

  await sql`
    UPDATE players JOIN (
      SELECT piuscores_guid, ROW_NUMBER() OVER (ORDER BY created_at, piuscores_guid) AS n FROM players
    ) numbered USING (piuscores_guid)
    SET players.id = numbered.n`.execute(db);

  await sql`ALTER TABLE players MODIFY id int NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (id)`.execute(db);

  await sql`DELETE FROM scrape_failures WHERE player_id NOT IN (SELECT piuscores_guid FROM players)`.execute(db);
  for (const { table, column } of ALTERED_COLUMNS)
    await alterPlayerColumn(db, table, column, TO_ID);

  await sql`ALTER TABLE users ADD CONSTRAINT users_player_id_unique UNIQUE (player_id)`.execute(db);
  await convertRunPlayerLists(db, TO_ID);

  for (const { table, columns } of COPIED_TABLES)
    await copyWithPlayerColumn(db, table, columns, TO_ID, (table === 'plays'  ?  sql`, DROP COLUMN scrape_run_id`  :  sql``));

  for (const { table, foreignKeys } of COPIED_TABLES) {
    for (const foreignKey of foreignKeys)
      await addForeignKey(db, table, foreignKey);
  }

  for (const { table, foreignKey } of ALTERED_COLUMNS)
    await addForeignKey(db, table, foreignKey);
}


export async function down(db: Db): Promise<void> {
  for (const { table, foreignKey } of ALTERED_COLUMNS)
    await dropForeignKey(db, table, foreignKey[0]);

  for (const { table, foreignKeys } of COPIED_TABLES)
    await dropForeignKey(db, table, foreignKeys.find(([, column])  =>  column === 'player_id')![0]);

  await sql`ALTER TABLE users DROP INDEX users_player_id_unique`.execute(db);
  for (const { table, column } of ALTERED_COLUMNS)
    await alterPlayerColumn(db, table, column, TO_GUID);

  await sql`ALTER TABLE users ADD CONSTRAINT player_id UNIQUE (player_id)`.execute(db);
  await convertRunPlayerLists(db, TO_GUID);

  for (const { table, columns } of COPIED_TABLES) {
    const plays = table === 'plays';
    await copyWithPlayerColumn(db, table, columns, TO_GUID,
      (plays  ?  sql`, ADD COLUMN scrape_run_id int NULL AFTER played_on`  :  sql``), (plays  ?  ['scrape_run_id']  :  []));
  }

  await sql`
    ALTER TABLE players DROP PRIMARY KEY, DROP COLUMN id, DROP INDEX players_piuscores_guid_unique,
    RENAME COLUMN piuscores_guid TO id, ADD PRIMARY KEY (id)`.execute(db);

  for (const { table, foreignKeys } of COPIED_TABLES) {
    for (const foreignKey of foreignKeys)
      await addForeignKey(db, table, foreignKey);
  }

  await addForeignKey(db, 'users', ['users_player_fk', 'player_id', 'players', 'set null']);
  await addForeignKey(db, 'plays', ['plays_scrape_run_id_fk', 'scrape_run_id', 'scrape_runs', 'set null']);
}
