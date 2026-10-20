import type { MeResponse } from '@piu-rivals/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.ts';
import type { AppDeps } from '../app.ts';
import { requireUser, sessionUser } from '../auth.ts';
import { HttpError } from '../errors.ts';
import { loadUser, playerSummary, playerSummaryColumns } from '../mappers.ts';
import { GUID } from './params.ts';

const MAX_RIVALS = 100;
const MAX_PREFERENCES_LENGTH = 20000;


async function loadRivals(db: Kysely<Database>, userId: number) {
  const rows = await db.selectFrom('user_rivals')
    .innerJoin('players', 'players.id', 'user_rivals.player_id')
    .select(playerSummaryColumns)
    .where('user_rivals.user_id', '=', userId)
    .orderBy('players.name')
    .execute();

  return rows.map(playerSummary);
}


async function loadPreferences(db: Kysely<Database>, userId: number) {
  const row = await db.selectFrom('user_preferences').select('data').where('user_id', '=', userId).executeTakeFirst();
  return row?.data  ??  {};
}


export const meRoutes: FastifyPluginAsyncTypebox<AppDeps> = async (app, { db }) => {
  app.addHook('preHandler', requireUser);


  app.get('/me', async (request): Promise<MeResponse> => {
    const { id } = sessionUser(request);
    return { user: (await loadUser(db, id))!, rivals: await loadRivals(db, id), preferences: await loadPreferences(db, id) };
  });


  // Preferences are the site's own settings (score cap, try cooldown, hidden rivals, ...), stored as given.
  app.put('/me/preferences', {
    schema: { body: Type.Object({ preferences: Type.Record(Type.String(), Type.Unknown()) }) },
  }, async (request) => {
    const { id } = sessionUser(request);
    const data = JSON.stringify(request.body.preferences);
    if (data.length > MAX_PREFERENCES_LENGTH)
      throw new HttpError(400, 'Preferences are too large');

    await db.insertInto('user_preferences').values({ user_id: id, data }).onDuplicateKeyUpdate({ data }).execute();
    return { preferences: await loadPreferences(db, id) };
  });


  // Replaces the rival list. Your own player can't be your rival.
  app.put('/me/rivals', {
    schema: { body: Type.Object({ playerIds: Type.Array(GUID, { maxItems: MAX_RIVALS }) }) },
  }, async (request) => {
    const { id } = sessionUser(request);
    const user = await loadUser(db, id);
    const wanted = [...new Set(request.body.playerIds.map((playerId) => playerId.toLowerCase()))]
      .filter((playerId) => playerId !== user?.player?.id);

    const known = wanted.length
      ? (await db.selectFrom('players').select('id').where('id', 'in', wanted).execute()).map((row) => row.id)
      : [];

    const unknown = wanted.filter((playerId) => ! known.includes(playerId));
    if (unknown.length)
      throw new HttpError(404, `Unknown players: ${unknown.join(', ')}`);

    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom('user_rivals').where('user_id', '=', id).execute();
      if (known.length)
        await trx.insertInto('user_rivals').values(known.map((playerId) => ({ user_id: id, player_id: playerId }))).execute();
    });

    return { rivals: await loadRivals(db, id) };
  });
};
