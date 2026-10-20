import { buildApp } from './api/app.ts';
import { googleTokenVerifier } from './api/auth.ts';
import { config } from './config.ts';
import { createDatabase } from './db/database.ts';

// The API server. Started by pm2 next to the scrape worker; nginx in front terminates TLS.

const app = await buildApp({ db: createDatabase(), verifyGoogleToken: googleTokenVerifier(config.googleClientId()) }, { logger: true });
await app.listen({ port: config.port, host: config.host });
