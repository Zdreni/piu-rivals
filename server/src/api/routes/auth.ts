import type { LoginResponse } from '@piu-rivals/shared';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { sql } from 'kysely';
import { config } from '../../config.ts';
import type { AppDeps } from '../app.ts';
import { createSession, hashToken, requireUser } from '../auth.ts';
import { HttpError } from '../errors.ts';
import { loadUser } from '../mappers.ts';


export const authRoutes: FastifyPluginAsyncTypebox<AppDeps> = async (app, { db, verifyGoogleToken })  => {
  // Only users added by an admin can sign in. Emails in ADMIN_EMAILS, and the very first sign-in
  // while there are no users, become admins.
  app.post('/auth/google', {
    schema: { body: Type.Object({ idToken: Type.String({ minLength: 1 }) }) },
  }, async (request): Promise<LoginResponse>  => {
    const identity = await verifyGoogleToken(request.body.idToken);
    const listedAdmin = config.adminEmails.includes(identity.email);
    let user = await db.selectFrom('users').selectAll().where('email', '=', identity.email).executeTakeFirst();
    if (! user) {
      const { count } = await db.selectFrom('users').select((eb)  =>  eb.fn.countAll<number>().as('count')).executeTakeFirstOrThrow();
      if (! listedAdmin  &&  Number(count) > 0)
        throw new HttpError(403, `${identity.email} has no access to piu-rivals yet; ask an admin to add it`);

      await db.insertInto('users').values({ email: identity.email, display_name: identity.name, is_admin: 1 }).execute();
      user = await db.selectFrom('users').selectAll().where('email', '=', identity.email).executeTakeFirstOrThrow();
    }

    await db.updateTable('users')
      .set({
        last_login_at: sql<string>`CURRENT_TIMESTAMP`,
        ...(listedAdmin  ?  { is_admin: 1 }  :  {}),
        ...(user.display_name  ?  {}  :  { display_name: identity.name }),
      })
      .where('id', '=', user.id)
      .execute();

    const session = await createSession(db, user.id);
    return { ...session, user: (await loadUser(db, user.id))! };
  });


  app.post('/auth/logout', { preHandler: requireUser }, async (request)  => {
    const token = request.headers.authorization!.match(/^Bearer\s+(\S+)$/i)![1]!;
    await db.deleteFrom('auth_sessions').where('token_hash', '=', hashToken(token)).execute();
    return { ok: true };
  });
};
