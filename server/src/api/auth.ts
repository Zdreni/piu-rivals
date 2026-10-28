import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { type Kysely, sql } from 'kysely';
import { config } from '../config.ts';
import type { Database } from '../db/schema.ts';
import { HttpError } from './errors.ts';

export interface GoogleIdentity {
  email: string;
  name: string | null;
}

// Checks a Google ID token from the site's "Sign in with Google" button; replaced in tests.
export type VerifyGoogleToken = (idToken: string) => Promise<GoogleIdentity>;

export interface SessionUser {
  id: number;
  email: string;
  isAdmin: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    sessionUser: SessionUser | null;
  }
}

export const hashToken = (token: string)  =>  createHash('sha256').update(token).digest('hex');


export function googleTokenVerifier(clientId: string): VerifyGoogleToken {
  const client = new OAuth2Client(clientId);
  return async (idToken)  => {
    const payload = await client.verifyIdToken({ idToken, audience: clientId })
      .then((ticket)  =>  ticket.getPayload())
      .catch(()  =>  null);

    if (! payload?.email  ||  ! payload.email_verified)
      throw new HttpError(401, 'Invalid Google sign-in');

    return { email: payload.email.toLowerCase(), name: payload.name  ??  null };
  };
}


// Creates a login session; only the token's hash is stored.
export async function createSession(db: Kysely<Database>, userId: number, days = config.sessionDays) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + days * 86400000);
  await db.insertInto('auth_sessions')
    .values({ token_hash: hashToken(token), user_id: userId, expires_at: expires.toISOString().slice(0, 23).replace('T', ' ') })
    .execute();

  return { token, expiresAt: expires.toISOString() };
}


// Reads the "Authorization: Bearer <token>" login session into request.sessionUser.
export function loadSessionUser(db: Kysely<Database>) {
  return async (request: FastifyRequest)  => {
    request.sessionUser = null;

    const token = request.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (! token)
      return;

    const user = await db.selectFrom('auth_sessions')
      .innerJoin('users', 'users.id', 'auth_sessions.user_id')
      .select(['users.id', 'users.email', 'users.is_admin'])
      .where('auth_sessions.token_hash', '=', hashToken(token))
      .where('auth_sessions.expires_at', '>', sql<string>`CURRENT_TIMESTAMP`)
      .executeTakeFirst();

    if (user)
      request.sessionUser = { id: user.id, email: user.email, isAdmin: !! user.is_admin };
  };
}


export async function requireUser(request: FastifyRequest, _reply: FastifyReply) {
  if (! request.sessionUser)
    throw new HttpError(401, 'Not signed in');
}


export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (! request.sessionUser)
    throw new HttpError(401, 'Not signed in');

  if (! request.sessionUser.isAdmin)
    throw new HttpError(403, 'Admins only');
}


// The signed-in user; only for routes behind requireUser or requireAdmin.
export function sessionUser(request: FastifyRequest): SessionUser {
  if (! request.sessionUser)
    throw new HttpError(401, 'Not signed in');

  return request.sessionUser;
}
