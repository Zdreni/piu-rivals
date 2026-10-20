import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile))
  process.loadEnvFile(envFile);


function required(name: string): string {
  const value = process.env[name];
  if (! value)
    throw new Error(`Missing ${name} in server/.env or the environment`);

  return value;
}


const numberOr = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value)  &&  process.env[name] !== '' ? value : fallback;
};


const list = (value: string | undefined) =>
  (value  ||  '').split(',').map((item) => item.trim()).filter(Boolean);


export const config = {
  databaseUrl: () => required('DATABASE_URL'),
  port: numberOr('PORT', 9876),
  // nginx in front terminates TLS, so the API only listens locally.
  host: process.env.HOST  ||  '127.0.0.1',
  googleClientId: () => required('GOOGLE_CLIENT_ID'),
  // Emails that are made admins on login, e.g. the first admin.
  adminEmails: list(process.env.ADMIN_EMAILS).map((email) => email.toLowerCase()),
  corsOrigins: list(process.env.CORS_ORIGIN  ||  'https://zdreni.github.io,http://localhost:5173'),
  sessionDays: numberOr('SESSION_DAYS', 30),
  piuscoresUrl: process.env.PIUSCORES_URL  ||  'https://piuscores.arroweclip.se',
  // Pause between page actions, so the load on piuscores is like one person browsing.
  scrapeDelayMs: numberOr('SCRAPE_DELAY_MS', 2000),
  // Browser channel for Playwright, e.g. "msedge" to use an installed Edge; empty uses Playwright's Chromium.
  browserChannel: process.env.SCRAPER_BROWSER_CHANNEL  ||  undefined,
  headless: process.env.SCRAPER_HEADLESS !== 'false',
  workerPollMs: numberOr('WORKER_POLL_MS', 5000),
};
