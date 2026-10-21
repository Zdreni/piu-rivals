import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type {
  AdminPlayersResponse, BestsResponse, LoginResponse, MeResponse, PreferencesResponse, RivalsResponse, ScrapeRunResponse,
  ScrapeRunsResponse,
} from '@piu-rivals/shared';
import { sql } from 'kysely';
import { buildApp } from '../src/api/app.ts';
import { HttpError } from '../src/api/errors.ts';
import { createDatabase } from '../src/db/database.ts';
import { migrateToLatest } from '../src/db/migrations/index.ts';
import type { ParsedPlay } from '../src/scraper/session_page.ts';
import { ensurePlayer, storeSession } from '../src/scraper/store.ts';

// Runs the API against a real MySQL database, which it EMPTIES first: set TEST_DATABASE_URL to a
// database meant for tests. Skipped without it.
const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL is not set';

const ME = '11111111-1111-4111-8111-111111111111';
const RIVAL = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

const db = url ? createDatabase(url) : null!;
const app = url
  ? await buildApp({
    db,
    // The test's "Google token" is just the email.
    verifyGoogleToken: async (idToken) => {
      if (! idToken.includes('@'))
        throw new HttpError(401, 'Invalid Google sign-in');

      return { email: idToken.toLowerCase(), name: idToken.split('@')[0]! };
    },
  })
  : null!;

const tokens: Record<string, string> = {};


async function call<T = any>(method: string, path: string, options: { as?: string; body?: unknown } = {}) {
  const response = await app.inject({
    method: method as 'GET',
    url: path,
    headers: options.as ? { authorization: `Bearer ${tokens[options.as]}` } : {},
    ...(options.body !== undefined ? { payload: options.body as object } : {}),
  });

  return { status: response.statusCode, body: response.json() as T };
}


async function login(email: string) {
  const response = await call<LoginResponse>('POST', '/auth/google', { body: { idToken: email } });
  if (response.status === 200)
    tokens[email] = response.body.token;

  return response;
}


const play = (songKey: string, score: number, passed = true): ParsedPlay => ({
  songKey, songTitle: songKey, chartType: 'S', level: 20, score, grade: 'ss', passed, plate: null,
  perfect: 900, great: 10, good: 1, bad: 0, miss: 1, maxCombo: 800,
});


async function scrapedSession(playerId: string, timestamp: string, date: string, plays: ParsedPlay[]) {
  await ensurePlayer(db, playerId);
  await storeSession(db, {
    playerId,
    card: { mix: 'Phoenix 2', title: 'Official Import', timestamp, isOpen: false },
    date,
    plays,
    grown: false,
    scrapeRunId: null,
  });
}


before(async () => {
  if (! url)
    return;

  const { error } = await migrateToLatest(db);
  if (error)
    throw error;

  await sql`SET FOREIGN_KEY_CHECKS = 0`.execute(db);
  for (const table of ['auth_sessions', 'user_preferences', 'user_rivals', 'best_results', 'plays', 'scrape_failures',
    'scrape_runs', 'charts', 'users', 'players'])
    await sql`TRUNCATE TABLE ${sql.table(table)}`.execute(db);

  await sql`SET FOREIGN_KEY_CHECKS = 1`.execute(db);
  await scrapedSession(ME, 'Mon 1', '2026-10-01', [play('Alpha', 900000), play('Beta', 950000)]);
  await scrapedSession(RIVAL, 'Mon 1', '2026-10-01', [play('Alpha', 910000), play('Alpha', 920000, false)]);
  await ensurePlayer(db, OTHER);
});


after(async () => {
  await app?.close();
  await db?.destroy();
});


test('the first sign-in becomes admin; unknown emails are refused', { skip }, async () => {
  const first = await login('admin@example.com');
  assert.equal(first.status, 200);
  assert.equal(first.body.user.isAdmin, true);
  assert.equal((await login('stranger@example.com')).status, 403);
  assert.equal((await login('not-an-email')).status, 401);
});


test('requests need a session, and admin routes an admin', { skip }, async () => {
  assert.equal((await call('GET', '/me')).status, 401);
  assert.equal((await call('GET', '/admin/users', { as: 'admin@example.com' })).status, 200);

  await call('POST', '/admin/users', { as: 'admin@example.com', body: { email: 'Player@Example.com', playerId: ME } });
  assert.equal((await login('player@example.com')).status, 200);
  assert.equal((await call('GET', '/admin/users', { as: 'player@example.com' })).status, 403);
});


test('admins manage users; a player belongs to one user', { skip }, async () => {
  const taken = await call('POST', '/admin/users', { as: 'admin@example.com', body: { email: 'second@example.com', playerId: ME } });
  assert.equal(taken.status, 409);

  const users = (await call('GET', '/admin/users', { as: 'admin@example.com' })).body.users;
  const admin = users.find((u: { email: string }) => u.email === 'admin@example.com');
  const own = await call('PATCH', `/admin/users/${admin.id}`, { as: 'admin@example.com', body: { isAdmin: false } });
  assert.equal(own.status, 409);
  assert.equal((await call('DELETE', `/admin/users/${admin.id}`, { as: 'admin@example.com' })).status, 409);
});


test('a user keeps rivals and preferences; their own player is never a rival', { skip }, async () => {
  const rivals = await call('PUT', '/me/rivals', { as: 'player@example.com', body: { playerIds: [RIVAL, ME] } });
  assert.equal(rivals.status, 200);
  assert.deepEqual(rivals.body.rivals.map((r: { id: string }) => r.id), [RIVAL]);
  assert.equal((await call('PUT', '/me/rivals', {
    as: 'player@example.com', body: { playerIds: ['44444444-4444-4444-8444-444444444444'] },
  })).status, 404);

  await call('PUT', '/me/preferences', { as: 'player@example.com', body: { preferences: { scoreCap: 999000 } } });
  const me = await call<MeResponse>('GET', '/me', { as: 'player@example.com' });
  assert.equal(me.body.user.player?.id, ME);
  assert.deepEqual(me.body.rivals.map((r) => r.id), [RIVAL]);
  assert.deepEqual(me.body.preferences, { scoreCap: 999000 });
});


test('rivals are added, hidden and removed one by one', { skip }, async () => {
  const as = 'player@example.com';
  assert.equal((await call('POST', '/me/rivals', { as, body: { playerId: ME } })).status, 409);
  assert.equal((await call('POST', '/me/rivals', { as, body: { playerId: '44444444-4444-4444-8444-444444444444' } })).status, 404);

  const added = await call<RivalsResponse>('POST', '/me/rivals', { as, body: { playerId: OTHER.toUpperCase() } });
  assert.equal(added.status, 200);
  assert.deepEqual(added.body.rivals.map((r) => [r.id, r.hidden]).sort(), [[RIVAL, false], [OTHER, false]]);

  const hidden = await call<RivalsResponse>('PATCH', `/me/rivals/${OTHER}`, { as, body: { hidden: true } });
  assert.equal(hidden.body.rivals.find((r) => r.id === OTHER)?.hidden, true);
  assert.equal((await call('PATCH', `/me/rivals/${OTHER}`, { as, body: { hidden: true } })).status, 200);
  assert.equal((await call('PATCH', `/me/rivals/${ME}`, { as, body: { hidden: true } })).status, 404);

  // Replacing the list keeps the hidden setting of rivals that stay.
  const replaced = await call<RivalsResponse>('PUT', '/me/rivals', { as, body: { playerIds: [OTHER, RIVAL] } });
  assert.equal(replaced.body.rivals.find((r) => r.id === OTHER)?.hidden, true);

  const removed = await call<RivalsResponse>('DELETE', `/me/rivals/${OTHER}`, { as });
  assert.deepEqual(removed.body.rivals.map((r) => r.id), [RIVAL]);
});


test('changing preferences keeps the others; null removes one', { skip }, async () => {
  const as = 'player@example.com';
  await call('PUT', '/me/preferences', { as, body: { preferences: { scoreCap: 999000, countBy: 'charts' } } });
  const changed = await call<PreferencesResponse>('PATCH', '/me/preferences', {
    as, body: { changes: { npMinimalRivals: 2, countBy: null } },
  });

  assert.deepEqual(changed.body.preferences, { scoreCap: 999000, npMinimalRivals: 2 });
  assert.deepEqual((await call<MeResponse>('GET', '/me', { as })).body.preferences, { scoreCap: 999000, npMinimalRivals: 2 });
  await call('PUT', '/me/preferences', { as, body: { preferences: { scoreCap: 999000 } } });
});


test('best results come with their chart and try details, and since returns only changes', { skip }, async () => {
  const all = await call<BestsResponse>('GET', `/bests?players=${ME},${RIVAL}`, { as: 'player@example.com' });
  assert.equal(all.status, 200);
  assert.equal(all.body.bests.length, 3);
  assert.deepEqual(all.body.charts.map((c) => c.songKey).sort(), ['Alpha', 'Beta']);
  assert.deepEqual(all.body.counts, { [ME]: 2, [RIVAL]: 1 });

  const rivalAlpha = all.body.bests.find((b) => b.playerId === RIVAL)!;
  // The broken 920,000 beats the passed 910,000: the best is the highest score.
  assert.equal(rivalAlpha.score, 920000);
  assert.equal(rivalAlpha.passed, false);
  assert.equal(rivalAlpha.tries, 2);
  assert.equal(rivalAlpha.perfect, 900);
  assert.equal(rivalAlpha.bestPlayedOn, '2026-10-01');

  const unchanged = await call<BestsResponse>('GET', `/bests?players=${ME},${RIVAL}&since=${all.body.serverTime}`, { as: 'player@example.com' });
  assert.equal(unchanged.body.bests.length, 0);
  // Counts cover every best result, not only the changed ones.
  assert.deepEqual(unchanged.body.counts, { [ME]: 2, [RIVAL]: 1 });

  await scrapedSession(ME, 'Tue 2', '2026-10-02', [play('Alpha', 905000)]);
  const changed = await call<BestsResponse>('GET', `/bests?players=${ME},${RIVAL}&since=${all.body.serverTime}`, { as: 'player@example.com' });
  assert.equal(changed.body.bests.length, 1);
  assert.equal(changed.body.bests[0]!.score, 905000);
  assert.equal(changed.body.bests[0]!.lastPlayedOn, '2026-10-02');
});


test('admins import players from the old extension', { skip }, async () => {
  const imported = await call('POST', '/admin/players/import', {
    as: 'admin@example.com',
    body: { players: { [OTHER]: { name: 'Other #1234', pumbility: 15000 }, '55555555-5555-4555-8555-555555555555': { name: 'New' } } },
  });

  assert.deepEqual(imported.body, { added: 1, existing: 1 });
  const players = (await call<AdminPlayersResponse>('GET', '/admin/players', { as: 'admin@example.com' })).body.players;
  assert.equal(players.length, 4);
  assert.equal(players.find((p) => p.id === OTHER)?.pumbility, 15000);
  assert.equal(players.find((p) => p.id === ME)?.plays, 3);
});


test('admins queue and cancel scrape runs', { skip }, async () => {
  const run = await call<ScrapeRunResponse>('POST', '/admin/scrape-runs', {
    as: 'admin@example.com', body: { kind: 'register', players: [`https://piuscores.arroweclip.se/Player/${OTHER}/Sessions`] },
  });

  assert.equal(run.status, 200);
  assert.deepEqual(run.body.run.playerIds, [OTHER]);
  assert.equal(run.body.run.status, 'queued');
  assert.equal(run.body.run.startedBy, 'admin@example.com');
  assert.equal((await call('POST', '/admin/scrape-runs', {
    as: 'admin@example.com', body: { kind: 'selected', players: ['66666666-6666-4666-8666-666666666666'] },
  })).status, 404);

  const cancelled = await call<ScrapeRunResponse>('POST', `/admin/scrape-runs/${run.body.run.id}/cancel`, { as: 'admin@example.com' });
  assert.equal(cancelled.body.run.status, 'cancelled');
  assert.equal((await call('POST', `/admin/scrape-runs/${run.body.run.id}/cancel`, { as: 'admin@example.com' })).status, 409);
});


test('the run list pages by limit and always includes queued runs', { skip }, async () => {
  const as = 'admin@example.com';
  const queue = async () => (await call<ScrapeRunResponse>('POST', '/admin/scrape-runs', { as, body: { kind: 'all' } })).body.run.id;
  const list = async (query: string) => {
    const response = await call<ScrapeRunsResponse>('GET', `/admin/scrape-runs${query}`, { as });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body;
  };

  const queued = await queue();
  const newer = [await queue(), await queue()];
  for (const id of newer)
    await call('POST', `/admin/scrape-runs/${id}/cancel`, { as });

  const page = await list('?limit=2');
  assert.deepEqual(page.runs.map((r) => r.id), [newer[1], newer[0], queued]);
  assert.equal(page.hasMore, true);
  assert.deepEqual((await list('?active=true')).runs.map((r) => r.id), [queued]);

  const all = await list('');
  assert.equal(all.hasMore, false);
  assert.equal(all.runs[all.runs.length - 1]!.id < queued, true);
  await call('POST', `/admin/scrape-runs/${queued}/cancel`, { as });
});


test('deleting a player removes their results and unlinks them', { skip }, async () => {
  assert.equal((await call('DELETE', `/admin/players/${RIVAL}`, { as: 'admin@example.com' })).status, 200);
  const me = await call<MeResponse>('GET', '/me', { as: 'player@example.com' });
  assert.deepEqual(me.body.rivals, []);
  const bests = await call<BestsResponse>('GET', `/bests?players=${RIVAL}`, { as: 'player@example.com' });
  assert.equal(bests.body.bests.length, 0);
});


test('signing out ends the session', { skip }, async () => {
  assert.equal((await call('POST', '/auth/logout', { as: 'player@example.com' })).status, 200);
  assert.equal((await call('GET', '/me', { as: 'player@example.com' })).status, 401);
});
