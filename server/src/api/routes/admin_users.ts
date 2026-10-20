import type { AdminUsersResponse, User } from '@piu-rivals/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.ts';
import type { AppDeps } from '../app.ts';
import { requireAdmin, sessionUser } from '../auth.ts';
import { HttpError } from '../errors.ts';
import { loadUser, loadUsers } from '../mappers.ts';
import { GUID, IdParams } from './params.ts';

const UserFields = {
  displayName: Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  playerId: Type.Optional(Type.Union([GUID, Type.Null()])),
  isAdmin: Type.Optional(Type.Boolean()),
};


// A player can be "their" player of only one user.
async function checkPlayer(db: Kysely<Database>, playerId: string | null | undefined, userId: number | null) {
  if (! playerId)
    return;

  if (! await db.selectFrom('players').select('id').where('id', '=', playerId).executeTakeFirst())
    throw new HttpError(404, `Unknown player ${playerId}`);

  const owner = await db.selectFrom('users').select(['id', 'email']).where('player_id', '=', playerId).executeTakeFirst();
  if (owner  &&  owner.id !== userId)
    throw new HttpError(409, `Player ${playerId} already belongs to ${owner.email}`);
}


export const adminUserRoutes: FastifyPluginAsyncTypebox<AppDeps> = async (app, { db }) => {
  app.addHook('preHandler', requireAdmin);


  app.get('/admin/users', async (): Promise<AdminUsersResponse> => ({
    users: (await loadUsers(db)).map(({ user, createdAt, lastLoginAt }) => ({ ...user, createdAt, lastLoginAt })),
  }));


  app.post('/admin/users', {
    schema: { body: Type.Object({ email: Type.String({ format: 'email', maxLength: 191 }), ...UserFields }) },
  }, async (request): Promise<{ user: User }> => {
    const email = request.body.email.trim().toLowerCase();
    const playerId = request.body.playerId?.toLowerCase()  ??  null;
    if (await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst())
      throw new HttpError(409, `${email} is already a user`);

    await checkPlayer(db, playerId, null);
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

    await checkPlayer(db, playerId?.toLowerCase(), id);
    const changes = {
      ...(displayName !== undefined ? { display_name: displayName } : {}),
      ...(playerId !== undefined ? { player_id: playerId?.toLowerCase()  ??  null } : {}),
      ...(isAdmin !== undefined ? { is_admin: isAdmin ? 1 : 0 } : {}),
    };

    if (Object.keys(changes).length) {
      await db.transaction().execute(async (trx) => {
        await trx.updateTable('users').set(changes).where('id', '=', id).execute();
        // Your own player can't stay in your rival list.
        if (playerId)
          await trx.deleteFrom('user_rivals').where('user_id', '=', id).where('player_id', '=', playerId.toLowerCase()).execute();
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
