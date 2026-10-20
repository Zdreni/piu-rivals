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


export const config = {
  databaseUrl: () => required('DATABASE_URL'),
  piuscoresUrl: process.env.PIUSCORES_URL  ||  'https://piuscores.arroweclip.se',
  // Pause between page actions, so the load on piuscores is like one person browsing.
  scrapeDelayMs: numberOr('SCRAPE_DELAY_MS', 2000),
  // Browser channel for Playwright, e.g. "msedge" to use an installed Edge; empty uses Playwright's Chromium.
  browserChannel: process.env.SCRAPER_BROWSER_CHANNEL  ||  undefined,
  headless: process.env.SCRAPER_HEADLESS !== 'false',
  workerPollMs: numberOr('WORKER_POLL_MS', 5000),
};
