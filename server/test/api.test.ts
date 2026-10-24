import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type {
  AdminPlayersResponse, AdminTracksResponse, BestsResponse, ChartPreferencesResponse, LoginResponse, MeResponse, PreferencesResponse, RivalsResponse, ScrapeRunResponse,
  ScrapeRunsResponse,
} from '@piu-rivals/shared';
import { sql } from 'kysely';
import { buildApp } from '../src/api/app.ts';
import { HttpError } from '../src/api/errors.ts';
import { createDatabase } from '../src/db/database.ts';
import { migrateToLatest } from '../src/db/migrations/index.ts';
import { ensurePlayers, playerIdsByGuid } from '../src/db/players.ts';
import type { ParsedPlay } from '../src/scraper/session_page.ts';
import { takePlayer } from '../src/scraper/runs.ts';
import { savePlayerInfo, storeSession } from '../src/scraper/store.ts';

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


const playerIdOf = async (guid: string) => (await playerIdsByGuid(db, [guid])).get(guid);


async function scrapedSession(guid: string, timestamp: string, date: string, plays: ParsedPlay[]) {
  const [playerId] = await ensurePlayers(db, [guid]);
  await storeSession(db, {
    playerId: playerId!,
    card: { mix: 'Phoenix 2', title: 'Official Import', timestamp, isOpen: false },
    date,
    plays,
    grown: false,
  });
}


before(async () => {
  if (! url)
    return;

  const { error } = await migrateToLatest(db);
  if (error)
    throw error;

  await sql`SET FOREIGN_KEY_CHECKS = 0`.execute(db);
  for (const table of ['auth_sessions', 'user_chart_preferences', 'user_preferences', 'user_rivals', 'best_results', 'plays', 'scrape_failures',
    'scrape_runs', 'charts', 'tracks', 'users', 'players'])
    await sql`TRUNCATE TABLE ${sql.table(table)}`.execute(db);

  await sql`SET FOREIGN_KEY_CHECKS = 1`.execute(db);
  await scrapedSession(ME, 'Mon 1', '2026-10-01', [play('Alpha', 900000), play('Beta', 950000)]);
  await scrapedSession(RIVAL, 'Mon 1', '2026-10-01', [play('Alpha', 910000), play('Alpha', 920000, false)]);
  await ensurePlayers(db, [OTHER]);
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


test('charts are snoozed for a fixed time and woken; expired snoozes are left out and cleared', { skip }, async () => {
  const as = 'player@example.com';
  const { charts } = (await call<BestsResponse>('GET', `/bests?players=${ME}`, { as })).body;
  const [alpha, beta] = ['Alpha', 'Beta'].map((key) => charts.find((chart) => chart.songKey === key)!.id);
  const snooze = (chartId: number, snoozeDays: unknown) =>
    call<ChartPreferencesResponse>('PATCH', `/me/chart-preferences/${chartId}`, { as, body: { snoozeDays } });

  const before = Date.now();
  const snoozed = await snooze(alpha!, 3);
  assert.equal(snoozed.status, 200);
  assert.deepEqual(snoozed.body.chartPreferences.map((pref) => pref.chartId), [alpha]);
  // 3 days are 2 days and 12 hours.
  const hours = (Date.parse(snoozed.body.chartPreferences[0]!.snoozedUntil!) - before) / 3600_000;
  assert.ok(Math.abs(hours - 60) < 0.1, `snoozed for ${hours}h`);
  assert.deepEqual((await call<MeResponse>('GET', '/me', { as })).body.chartPreferences, snoozed.body.chartPreferences);

  assert.equal((await snooze(alpha!, 2)).status, 400);
  assert.equal((await snooze(999999, 1)).status, 404);

  // An expired snooze is no snooze, and the next change clears it.
  await db.updateTable('user_chart_preferences').set({ snoozed_until: '2020-01-01 00:00:00' }).where('chart_id', '=', alpha!).execute();
  assert.deepEqual((await call<MeResponse>('GET', '/me', { as })).body.chartPreferences, []);
  assert.deepEqual((await snooze(beta!, 1)).body.chartPreferences.map((pref) => pref.chartId), [beta]);
  const rows = await db.selectFrom('user_chart_preferences').select('chart_id').execute();
  assert.deepEqual(rows.map((row) => row.chart_id), [beta]);

  assert.deepEqual((await snooze(beta!, null)).body.chartPreferences, []);
  assert.equal((await db.selectFrom('user_chart_preferences').select('chart_id').execute()).length, 0);
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


test('admins give tracks short names that no other track uses as a name', { skip }, async () => {
  const as = 'admin@example.com';
  const list = await call<AdminTracksResponse>('GET', '/admin/tracks', { as });
  assert.deepEqual(list.body.tracks.map((t) => [t.title, t.shortTitle]), [['Alpha', 'Alpha'], ['Beta', 'Beta']]);
  const [alpha, beta] = list.body.tracks;
  const patch = (id: number, shortTitle: string) => call('PATCH', `/admin/tracks/${id}`, { as, body: { shortTitle } });

  const bests = (since?: string) =>
    call<BestsResponse>('GET', `/bests?players=${ME}${since ? `&since=${since}` : ''}`, { as: 'player@example.com' });

  const { serverTime } = (await bests()).body;
  assert.equal((await patch(alpha!.id, ' A ')).body.track.shortTitle, 'A');
  // The renamed track's charts come again, though no best result changed.
  const renamed = (await bests(serverTime)).body;
  assert.deepEqual(renamed.charts.map((c) => [c.songTitle, c.songShortTitle]), [['Alpha', 'A']]);
  assert.equal(renamed.bests.length, 0);

  assert.equal((await patch(beta!.id, 'alpha')).status, 409);
  assert.equal((await patch(beta!.id, 'a')).status, 409);
  assert.equal((await patch(beta!.id, 'B')).status, 200);
  // Empty puts the name back; a track's own name is fine.
  assert.equal((await patch(alpha!.id, '')).body.track.shortTitle, 'Alpha');
  assert.equal((await patch(beta!.id, 'Beta')).status, 200);
  assert.equal((await call('PATCH', '/admin/tracks/999999', { as, body: { shortTitle: 'X' } })).status, 404);
  assert.equal((await call('GET', '/admin/tracks', { as: 'player@example.com' })).status, 403);
});


test('admins give players a display name, shown instead of the scraped one', { skip }, async () => {
  const as = 'admin@example.com';
  const NAMED = '77777777-7777-4777-8777-777777777777';
  const [namedId] = await ensurePlayers(db, [NAMED]);
  await savePlayerInfo(db, namedId!, 'Other', null);
  const rename = (displayName: string | null) => call('PATCH', `/admin/players/${NAMED}`, { as, body: { displayName } });
  const listed = async () =>
    (await call<AdminPlayersResponse>('GET', '/admin/players', { as })).body.players.find((p) => p.id === NAMED)!;

  assert.equal((await rename(' Someone ')).body.player.name, 'Someone');
  assert.deepEqual([(await listed()).name, (await listed()).scrapedName], ['Someone', 'Other']);

  // Empty, or the scraped name, follows the scraped name.
  assert.equal((await rename('')).body.player.name, 'Other');
  await rename('Other');
  await savePlayerInfo(db, namedId!, 'Renamed', null);
  assert.equal((await listed()).name, 'Renamed');

  assert.equal((await call('PATCH', '/admin/players/66666666-6666-4666-8666-666666666666', { as, body: { displayName: 'X' } })).status, 404);
  assert.equal((await call('PATCH', `/admin/players/${NAMED}`, { as: 'player@example.com', body: { displayName: 'X' } })).status, 403);
  await call('DELETE', `/admin/players/${NAMED}`, { as });
});


test('admins queue and cancel scrape runs', { skip }, async () => {
  const run = await call<ScrapeRunResponse>('POST', '/admin/scrape-runs', {
    as: 'admin@example.com', body: { kind: 'register', players: [`https://piuscores.arroweclip.se/Player/${OTHER}/Sessions`] },
  });

  assert.equal(run.status, 200);
  assert.deepEqual(run.body.run.playerIds, [OTHER]);
  assert.equal(run.body.run.status, 'queued');
  assert.equal(run.body.run.startedBy, 'admin@example.com');
  assert.deepEqual(run.body.players, [{ id: OTHER, name: null, state: 'waiting' }]);
  assert.equal((await call('POST', '/admin/scrape-runs', {
    as: 'admin@example.com', body: { kind: 'selected', players: ['66666666-6666-4666-8666-666666666666'] },
  })).status, 404);

  const cancelled = await call<ScrapeRunResponse>('POST', `/admin/scrape-runs/${run.body.run.id}/cancel`, { as: 'admin@example.com' });
  assert.equal(cancelled.body.run.status, 'cancelled');
  assert.deepEqual(cancelled.body.players.map((p) => p.state), ['skipped']);
  assert.equal((await call('POST', `/admin/scrape-runs/${run.body.run.id}/cancel`, { as: 'admin@example.com' })).status, 409);
});


test('the run list has current runs in queue order and previous ones newest first', { skip }, async () => {
  const as = 'admin@example.com';
  const queue = async () => (await call<ScrapeRunResponse>('POST', '/admin/scrape-runs', { as, body: { kind: 'all' } })).body.run.id;
  const list = async (query: string) => {
    const response = await call<ScrapeRunsResponse>('GET', `/admin/scrape-runs${query}`, { as });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body;
  };

  const queued = [await queue(), await queue()];
  const finished = [await queue(), await queue()];
  for (const id of finished)
    await call('POST', `/admin/scrape-runs/${id}/cancel`, { as });

  const current = await list('?state=current');
  assert.deepEqual(current.runs.map((r) => r.id), queued);
  assert.equal(current.hasMore, false);

  const page = await list('?state=previous&limit=2');
  assert.deepEqual(page.runs.map((r) => r.id), [finished[1], finished[0]]);
  assert.equal(page.hasMore, true);
  const all = await list('?state=previous');
  assert.equal(all.hasMore, false);
  assert.equal(page.total, all.runs.length);
  assert.equal(current.total, queued.length);
  assert.equal(all.runs.every((r) => r.status === 'cancelled'), true);
  assert.equal((await call('GET', '/admin/scrape-runs', { as })).status, 400);

  const run = (await call<ScrapeRunResponse>('GET', `/admin/scrape-runs/${queued[1]}`, { as })).body;
  assert.equal(run.previousRunId, queued[0]);
  assert.equal(run.nextRunId, finished[0]);
  assert.equal((await call<ScrapeRunResponse>('GET', `/admin/scrape-runs/${finished[1]}`, { as })).body.nextRunId, null);

  for (const id of queued)
    await call('POST', `/admin/scrape-runs/${id}/cancel`, { as });
});


test('added players join an active run, which takes them while it runs', { skip }, async () => {
  const as = 'admin@example.com';
  const NEW_1 = '44444444-4444-4444-8444-444444444444';
  const NEW_2 = '55555555-5555-4555-8555-555555555555';
  const add = async (playerId: string, kind = 'register') => {
    const response = await call<ScrapeRunResponse>('POST', '/admin/scrape-runs', { as, body: { kind, players: [playerId] } });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body;
  };

  const first = await add(NEW_1);
  const runId = first.run.id;
  // A registered player is stored right away, with only their GUID, before the run gets to them.
  const stored = await db.selectFrom('players').select(['name', 'last_scraped_at']).where('piuscores_guid', '=', NEW_1).executeTakeFirst();
  assert.deepEqual(stored, { name: null, last_scraped_at: null });
  const joined = await add(NEW_2);
  assert.equal(joined.run.id, runId);
  assert.deepEqual(joined.players.map((p) => p.id), [NEW_1, NEW_2]);
  assert.equal(joined.run.playersTotal, 2);
  // A player still waiting isn't added twice; a stored player selected for scraping joins too.
  assert.equal((await add(NEW_1)).players.length, 2);
  assert.deepEqual((await add(RIVAL, 'selected')).players.map((p) => p.id), [NEW_1, NEW_2, RIVAL]);

  // The worker takes a player added after it got through the list; with no more players, the run is done.
  await db.updateTable('scrape_runs').set({ status: 'running' }).where('id', '=', runId).execute();
  assert.deepEqual(await takePlayer(db, runId, 0), { playerId: await playerIdOf(NEW_1) });
  await db.updateTable('scrape_runs').set({ players_done: 3 }).where('id', '=', runId).execute();
  assert.equal((await add(OTHER)).run.id, runId);
  assert.deepEqual(await takePlayer(db, runId, 3), { playerId: await playerIdOf(OTHER) });
  assert.deepEqual(await takePlayer(db, runId, 4), { finished: 'done' });

  // The run is finished, so the next player gets a new one.
  const next = await add(NEW_1);
  assert.notEqual(next.run.id, runId);
  assert.deepEqual(next.players.map((p) => p.id), [NEW_1]);
  await call('POST', `/admin/scrape-runs/${next.run.id}/cancel`, { as });
});


test('deleting a player removes their results and unlinks them', { skip }, async () => {
  const as = 'admin@example.com';
  const run = await call<ScrapeRunResponse>('POST', '/admin/scrape-runs', { as, body: { kind: 'rescan', players: [RIVAL, OTHER] } });
  assert.equal((await call('DELETE', `/admin/players/${RIVAL}`, { as })).status, 200);
  const me = await call<MeResponse>('GET', '/me', { as: 'player@example.com' });
  assert.deepEqual(me.body.rivals, []);
  const bests = await call<BestsResponse>('GET', `/bests?players=${RIVAL}`, { as: 'player@example.com' });
  assert.equal(bests.body.bests.length, 0);

  // Runs leave the player out.
  const after = await call<ScrapeRunResponse>('GET', `/admin/scrape-runs/${run.body.run.id}`, { as });
  assert.deepEqual(after.body.run.playerIds, [OTHER]);
  assert.deepEqual(after.body.players.map((p) => p.id), [OTHER]);
  await call('POST', `/admin/scrape-runs/${run.body.run.id}/cancel`, { as });
});


test('signing out ends the session', { skip }, async () => {
  assert.equal((await call('POST', '/auth/logout', { as: 'player@example.com' })).status, 200);
  assert.equal((await call('GET', '/me', { as: 'player@example.com' })).status, 401);
});
