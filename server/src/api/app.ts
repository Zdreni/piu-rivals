import cors from '@fastify/cors';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify, { type FastifyError } from 'fastify';
import type { Kysely } from 'kysely';
import { config } from '../config.ts';
import type { Database } from '../db/schema.ts';
import { loadSessionUser, type VerifyGoogleToken } from './auth.ts';
import { HttpError } from './errors.ts';
import { adminPlayerRoutes } from './routes/admin_players.ts';
import { adminRunRoutes } from './routes/admin_runs.ts';
import { adminUserRoutes } from './routes/admin_users.ts';
import { authRoutes } from './routes/auth.ts';
import { dataRoutes } from './routes/data.ts';
import { meRoutes } from './routes/me.ts';

export interface AppDeps {
  db: Kysely<Database>;
  verifyGoogleToken: VerifyGoogleToken;
}


export async function buildApp(deps: AppDeps, options: { logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger  ??  false, trustProxy: true }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(cors, { origin: config.corsOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  app.decorateRequest('sessionUser', null);
  app.addHook('onRequest', loadSessionUser(deps.db));

  app.setErrorHandler<FastifyError | HttpError>((error, request, reply) => {
    if (error instanceof HttpError)
      return reply.status(error.statusCode).send({ error: error.message });

    if (error.validation)
      return reply.status(400).send({ error: error.message });

    // Errors Fastify raises itself, e.g. a malformed JSON body.

    if (error.statusCode  &&  error.statusCode < 500)
      return reply.status(error.statusCode).send({ error: error.message });

    request.log.error(error);
    return reply.status(500).send({ error: 'Internal server error' });
  });

  app.get('/health', async () => ({ ok: true }));
  await app.register(authRoutes, deps);
  await app.register(meRoutes, deps);
  await app.register(dataRoutes, deps);
  await app.register(adminUserRoutes, deps);
  await app.register(adminPlayerRoutes, deps);
  await app.register(adminRunRoutes, deps);
  return app;
}
