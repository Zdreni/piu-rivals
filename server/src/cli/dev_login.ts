import { sql } from 'kysely';
import { createSession } from '../api/auth.ts';
import { createDatabase } from '../db/database.ts';

// Signs in the test user on the local site, for checking changes without Google sign-in:
//   npm run dev-login
// Creates the test user on first use: an admin with the scraped player with most bests that no
// user has yet, and the next players by bests as rivals. Prints a link the site's dev server
// (npm run dev in web/) takes the session from; production builds ignore it.

const TEST_EMAIL = 'dev-test@piu-rivals.local';
const SITE_URL = 'http://localhost:5173/piu-rivals/';
const RIVALS = 20;
const SESSION_DAYS = 1;


// Players by their number of bests, most first.
const playersByBests = (db: ReturnType<typeof createDatabase>)  =>
  db.selectFrom('players')
    .leftJoin('best_results', 'best_results.player_id', 'players.id')
    .select(['players.id', 'players.name'])
    .groupBy('players.id')
    .orderBy(sql`COUNT(best_results.player_id)`, 'desc');


async function createTestUser(db: ReturnType<typeof createDatabase>): Promise<number> {
  const player = await playersByBests(db)
    .where('players.id', 'not in', db.selectFrom('users').select('player_id').where('player_id', 'is not', null))
    .executeTakeFirst();

  const { insertId } = await db.insertInto('users')
    .values({ email: TEST_EMAIL, display_name: 'Dev test', player_id: player?.id  ??  null, is_admin: 1 })
    .executeTakeFirstOrThrow();

  const userId = Number(insertId);
  let rivals = playersByBests(db).limit(RIVALS);
  if (player)
    rivals = rivals.where('players.id', '!=', player.id);

  const rivalIds = (await rivals.execute()).map((rival)  =>  rival.id);
  if (rivalIds.length)
    await db.insertInto('user_rivals').values(rivalIds.map((id)  =>  ({ user_id: userId, player_id: id }))).execute();

  console.log(`Created ${TEST_EMAIL} with player ${player?.name  ??  '(none)'} and ${rivalIds.length} rivals`);
  return userId;
}


const db = createDatabase();
try {
  const user = await db.selectFrom('users').select('id').where('email', '=', TEST_EMAIL).executeTakeFirst();
  const userId = user?.id  ??  await createTestUser(db);
  await db.updateTable('users').set({ is_admin: 1 }).where('id', '=', userId).execute();

  const { token } = await createSession(db, userId, SESSION_DAYS);
  console.log(`${SITE_URL}#dev_token=${token}`);
} finally {
  await db.destroy();
}
