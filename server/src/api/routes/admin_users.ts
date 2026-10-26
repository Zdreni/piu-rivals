import type { AdminUserResponse, AdminUsersResponse, User } from '@piu-rivals/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { type Kysely, sql } from 'kysely';
import { playerIdsByGuid } from '../../db/players.ts';
import type { Database } from '../../db/schema.ts';
import type { AppDeps } from '../app.ts';
import { requireAdmin, sessionUser } from '../auth.ts';
import { HttpError } from '../errors.ts';
import { loadChartPreferences, loadPreferences, loadRivals, loadUser, loadUsers } from '../mappers.ts';
import { GUID, IdParams } from './params.ts';

const UserFields = {
  displayName: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  playerId: Type.Optional(Type.Union([GUID, Type.Null()])),
  isAdmin: Type.Optional(Type.Boolean()),
};


// A player can be "their" player of only one user. Returns the player's id, or null for no player.
async function userPlayerId(db: Kysely<Database>, guid: string | null, userId: number | null): Promise<number | null> {
  if (! guid)
    return null;

  const playerId = (await playerIdsByGuid(db, [guid])).get(guid);
  if (playerId === undefined)
    throw new HttpError(404, `Unknown player ${guid}`);

  const owner = await db.selectFrom('users').select(['id', 'email']).where('player_id', '=', playerId).executeTakeFirst();
  if (owner  &&  owner.id !== userId)
    throw new HttpError(409, `Player ${guid} already belongs to ${owner.email}`);

  return playerId;
}


export const adminUserRoutes: FastifyPluginAsyncTypebox<AppDeps> = async (app, { db }) => {
  app.addHook('preHandler', requireAdmin);


  app.get('/admin/users', async (): Promise<AdminUsersResponse> => {
    const rivalCounts = new Map((await db.selectFrom('user_rivals')
      .select(['user_id', sql<number>`COUNT(*)`.as('rivals'), sql<number>`SUM(hidden)`.as('off')])
      .groupBy('user_id')
      .execute()).map((row) => [row.user_id, row]));

    return {
      users: (await loadUsers(db)).map(({ user, createdAt, lastLoginAt }) => {
        const counts = rivalCounts.get(user.id);
        return { ...user, createdAt, lastLoginAt, rivals: Number(counts?.rivals  ??  0), rivalsOff: Number(counts?.off  ??  0) };
      }),
    };
  });


  app.get('/admin/users/:id', { schema: { params: IdParams } }, async (request): Promise<AdminUserResponse> => {
    const { id } = request.params;
    const [loaded] = await loadUsers(db, [id]);
    if (! loaded)
      throw new HttpError(404, 'Unknown user');

    const rivals = await loadRivals(db, id);
    const { user, createdAt, lastLoginAt } = loaded;
    return {
      user: { ...user, createdAt, lastLoginAt, rivals: rivals.length, rivalsOff: rivals.filter((rival) => rival.hidden).length },
      rivals,
      preferences: await loadPreferences(db, id),
      snoozes: (await loadChartPreferences(db, id)).length,
    };
  });


  app.post('/admin/users', {
    schema: { body: Type.Object({ email: Type.String({ format: 'email', maxLength: 191 }), ...UserFields }) },
  }, async (request): Promise<{ user: User }> => {
    const email = request.body.email.trim().toLowerCase();
    if (await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst())
      throw new HttpError(409, `${email} is already a user`);

    const playerId = await userPlayerId(db, request.body.playerId?.toLowerCase()  ??  null, null);
    const { insertId } = await db.insertInto('users')
      .values({
        email,
        display_name: request.body.displayName  ??  null,
        player_id: playerId,
        is_admin: request.body.isAdmin ? 1 : 0,
      })
      .executeTakeFirstOrThrow();

    return { user: (await loadUser(db, Number(insertId)))! };
  });


  app.patch('/admin/users/:id', {
    schema: { params: IdParams, body: Type.Object(UserFields) },
  }, async (request): Promise<{ user: User }> => {
    const { id } = request.params;
    const { displayName, playerId, isAdmin } = request.body;
    if (! await loadUser(db, id))
      throw new HttpError(404, 'Unknown user');

    if (id === sessionUser(request).id  &&  isAdmin === false)
      throw new HttpError(409, "You can't remove your own admin rights");

    const newPlayerId = playerId !== undefined ? await userPlayerId(db, playerId?.toLowerCase()  ??  null, id) : undefined;
    const changes = {
      ...(displayName !== undefined ? { display_name: displayName } : {}),
      ...(newPlayerId !== undefined ? { player_id: newPlayerId } : {}),
      ...(isAdmin !== undefined ? { is_admin: isAdmin ? 1 : 0 } : {}),
    };

    if (Object.keys(changes).length) {
      await db.transaction().execute(async (trx) => {
        await trx.updateTable('users').set(changes).where('id', '=', id).execute();
        // Your own player can't stay in your rival list.
        if (newPlayerId)
          await trx.deleteFrom('user_rivals').where('user_id', '=', id).where('player_id', '=', newPlayerId).execute();
      });
    }

    return { user: (await loadUser(db, id))! };
  });


  app.delete('/admin/users/:id', { schema: { params: IdParams } }, async (request) => {
    if (request.params.id === sessionUser(request).id)
      throw new HttpError(409, "You can't delete yourself");

    const { numDeletedRows } = await db.deleteFrom('users').where('id', '=', request.params.id).executeTakeFirst();
    if (! numDeletedRows)
      throw new HttpError(404, 'Unknown user');

    return { ok: true };
  });
};
