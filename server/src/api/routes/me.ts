import type { MeResponse, Preferences, PreferencesResponse, Rival, RivalsResponse } from '@piu-rivals/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.ts';
import type { AppDeps } from '../app.ts';
import { requireUser, sessionUser } from '../auth.ts';
import { HttpError } from '../errors.ts';
import { loadUser, playerSummary, playerSummaryColumns } from '../mappers.ts';
import { GUID, PlayerIdParams } from './params.ts';

const MAX_RIVALS = 100;
const MAX_PREFERENCES_LENGTH = 20000;


async function loadRivals(db: Kysely<Database>, userId: number): Promise<Rival[]> {
  const rows = await db.selectFrom('user_rivals')
    .innerJoin('players', 'players.id', 'user_rivals.player_id')
    .select([...playerSummaryColumns, 'user_rivals.hidden'])
    .where('user_rivals.user_id', '=', userId)
    .orderBy('players.name')
    .execute();

  return rows.map((row) => ({ ...playerSummary(row), hidden: !! row.hidden }));
}


async function loadPreferences(db: Kysely<Database>, userId: number): Promise<Preferences> {
  const row = await db.selectFrom('user_preferences').select('data').where('user_id', '=', userId).executeTakeFirst();
  return row?.data  ??  {};
}


function preferencesData(preferences: Preferences): string {
  const data = JSON.stringify(preferences);
  if (data.length > MAX_PREFERENCES_LENGTH)
    throw new HttpError(400, 'Preferences are too large');

  return data;
}


// Your own player can't be your rival, and only stored players can.
async function checkRival(db: Kysely<Database>, userId: number, playerId: string) {
  const user = await loadUser(db, userId);
  if (playerId === user?.player?.id)
    throw new HttpError(409, "Your own player can't be your rival");

  const player = await db.selectFrom('players').select('id').where('id', '=', playerId).executeTakeFirst();
  if (! player)
    throw new HttpError(404, `Unknown player: ${playerId}`);
}


export const meRoutes: FastifyPluginAsyncTypebox<AppDeps> = async (app, { db }) => {
  app.addHook('preHandler', requireUser);


  app.get('/me', async (request): Promise<MeResponse> => {
    const { id } = sessionUser(request);
    return { user: (await loadUser(db, id))!, rivals: await loadRivals(db, id), preferences: await loadPreferences(db, id) };
  });


  // Replaces all preferences, stored as given.
  app.put('/me/preferences', {
    schema: { body: Type.Object({ preferences: Type.Record(Type.String(), Type.Unknown()) }) },
  }, async (request): Promise<PreferencesResponse> => {
    const { id } = sessionUser(request);
    const data = preferencesData(request.body.preferences);
    await db.insertInto('user_preferences').values({ user_id: id, data }).onDuplicateKeyUpdate({ data }).execute();
    return { preferences: await loadPreferences(db, id) };
  });


  // Changes only the given preferences; null removes one. Two pages changing different settings at once
  // don't undo each other's change, as they would by replacing all preferences.
  app.patch('/me/preferences', {
    schema: { body: Type.Object({ changes: Type.Record(Type.String(), Type.Unknown()) }) },
  }, async (request): Promise<PreferencesResponse> => {
    const { id } = sessionUser(request);
    return db.transaction().execute(async (trx) => {
      const row = await trx.selectFrom('user_preferences').select('data').where('user_id', '=', id).forUpdate().executeTakeFirst();
      const preferences = { ...row?.data };
      for (const [key, value] of Object.entries(request.body.changes)) {
        if (value === null)
          delete preferences[key];
        else
          preferences[key] = value;
      }

      const data = preferencesData(preferences);
      await trx.insertInto('user_preferences').values({ user_id: id, data }).onDuplicateKeyUpdate({ data }).execute();
      return { preferences };
    });
  });


  // Replaces the rival list. Rivals that stay keep their hidden setting. Your own player can't be your rival.
  app.put('/me/rivals', {
    schema: { body: Type.Object({ playerIds: Type.Array(GUID, { maxItems: MAX_RIVALS }) }) },
  }, async (request): Promise<RivalsResponse> => {
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
      let removal = trx.deleteFrom('user_rivals').where('user_id', '=', id);
      if (known.length)
        removal = removal.where('player_id', 'not in', known);

      await removal.execute();
      if (known.length) {
        await trx.insertInto('user_rivals').ignore()
          .values(known.map((playerId) => ({ user_id: id, player_id: playerId })))
          .execute();
      }
    });

    return { rivals: await loadRivals(db, id) };
  });


  // Adds one rival; adding one already in the list changes nothing.
  app.post('/me/rivals', {
    schema: { body: Type.Object({ playerId: GUID }) },
  }, async (request): Promise<RivalsResponse> => {
    const { id } = sessionUser(request);
    const playerId = request.body.playerId.toLowerCase();
    await checkRival(db, id, playerId);

    await db.transaction().execute(async (trx) => {
      await trx.insertInto('user_rivals').ignore().values({ user_id: id, player_id: playerId }).execute();
      const { count } = await trx.selectFrom('user_rivals').select((eb) => eb.fn.countAll<number>().as('count'))
        .where('user_id', '=', id).executeTakeFirstOrThrow();

      if (Number(count) > MAX_RIVALS)
        throw new HttpError(409, `You can have up to ${MAX_RIVALS} rivals`);
    });

    return { rivals: await loadRivals(db, id) };
  });


  app.patch('/me/rivals/:id', {
    schema: { params: PlayerIdParams, body: Type.Object({ hidden: Type.Boolean() }) },
  }, async (request): Promise<RivalsResponse> => {
    const { id } = sessionUser(request);
    const { numUpdatedRows } = await db.updateTable('user_rivals')
      .set({ hidden: request.body.hidden ? 1 : 0 })
      .where('user_id', '=', id)
      .where('player_id', '=', request.params.id.toLowerCase())
      .executeTakeFirst();

    // Without the FOUND_ROWS client flag MySQL counts only changed rows, so 0 may also be a rival already set that way.
    if (numUpdatedRows === 0n) {
      const rival = await db.selectFrom('user_rivals').select('player_id')
        .where('user_id', '=', id).where('player_id', '=', request.params.id.toLowerCase()).executeTakeFirst();

      if (! rival)
        throw new HttpError(404, 'Not in your rival list');
    }

    return { rivals: await loadRivals(db, id) };
  });


  // Removes one rival; their scores stay on the server.
  app.delete('/me/rivals/:id', { schema: { params: PlayerIdParams } }, async (request): Promise<RivalsResponse> => {
    const { id } = sessionUser(request);
    await db.deleteFrom('user_rivals').where('user_id', '=', id).where('player_id', '=', request.params.id.toLowerCase()).execute();
    return { rivals: await loadRivals(db, id) };
  });
};
