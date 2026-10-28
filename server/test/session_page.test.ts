import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  openSessionMismatches, parseChartLabel, parseOpenSession, parseSessionPlays, parseSessionsPage, sameCard,
  sameSessionTime,
} from '../src/scraper/session_page.ts';

// Fixtures are rendered piuscores Sessions pages (trimmed to <main>), saved on 2026-10-20 with
// "Show all plays" expanded. sessions_broken is merepoohunk's page with an older session open.
const fixture = (name: string)  =>  readFileSync(new URL(`fixtures/${name}.html`, import.meta.url), 'utf8');


test('reads the player name, session cards and pagination', ()  => {
  const page = parseSessionsPage(fixture('sessions_paged'));
  assert.equal(page.playerName, 'Dino');
  assert.equal(page.cards.length, 8);
  assert.deepEqual(page.cards[0], {
    mix: 'Phoenix 2', title: 'Official Import · DINO #3869', timestamp: 'Wed 14 Oct · 8:02 PM', isOpen: true,
  });
  assert.equal(page.cards.filter((card)  =>  card.isOpen).length, 1);
  assert.equal(page.hasOlderPage, true);
  assert.equal(page.hasNewerPage, false);
});


test('tells Phoenix 2 cards from older-mix cards', ()  => {
  const { cards, hasOlderPage } = parseSessionsPage(fixture('sessions_plates'));
  assert.deepEqual(cards.map((card)  =>  card.mix), ['Phoenix 2', 'Phoenix', 'Phoenix']);
  assert.equal(cards[1]!.title, 'Backfill');
  assert.equal(hasOlderPage, false);
});


test('reads the open session header without the import tag', ()  => {
  assert.deepEqual(parseOpenSession(fixture('sessions_single')), {
    title: 'Official Import',
    summary: 'Phoenix 2 · 10/11/2026 7:43 PM · 37 min',
    mix: 'Phoenix 2',
    date: '2026-10-11',
    playsTotal: 10,
    pumbility: 5407,
  });
});


test('matches the open session with its card', ()  => {
  const html = fixture('sessions_single');
  const { cards } = parseSessionsPage(html);
  const open = parseOpenSession(html);
  assert.deepEqual(openSessionMismatches(open, cards[0]!), []);
  assert.equal(openSessionMismatches(open, cards[1]!).length, 1);
  assert.equal(sameSessionTime('Sun 11 Oct · 7:43 PM', 'Phoenix 2 · 10/11/2026 7:43 PM'), true);
  assert.equal(sameSessionTime('Sun 11 Oct · 7:43 PM', 'Phoenix 2 · 10/11/2026 7:44 PM'), false);
});


test('reads plays with grade and judgments, skipping stage breaks', ()  => {
  const { plays, rows, unreadable } = parseSessionPlays(fixture('sessions_single'));
  assert.equal(rows, 10);
  assert.equal(unreadable, 0);
  // One of the ten rows is a stage break without a score.
  assert.equal(plays.length, 9);
  assert.deepEqual(plays[0], {
    songKey: 'BLAZOR-p2',
    songTitle: 'BLAZOR',
    chartType: 'D',
    level: 24,
    score: 919339,
    grade: 'aplus',
    passed: true,
    plate: null,
    perfect: 1070,
    great: 98,
    good: 42,
    bad: 17,
    miss: 7,
    maxCombo: 252,
  });
});


test('reads plates, and plays imported without judgments', ()  => {
  const { plays } = parseSessionPlays(fixture('sessions_plates'));
  assert.equal(plays.length, 92);
  assert.ok(plays.some((play)  =>  play.plate === 'pg'));

  const bare = plays.find((play)  =>  play.perfect === null);
  assert.ok(bare);
  assert.equal(bare.maxCombo, null);
  assert.ok(bare.score > 0);
});


test('reads a broken play as its grade, not passed', ()  => {
  const { plays } = parseSessionPlays(fixture('sessions_broken'));
  const broken = plays.filter((play)  =>  ! play.passed);
  assert.equal(broken.length, 1);
  assert.equal(broken[0]!.songTitle, 'Nyarlathotep');
  assert.equal(broken[0]!.grade, 'aa');
  assert.equal(broken[0]!.score, 932938);
  assert.ok(plays.every((play)  =>  ! play.grade?.includes('broken')));
});


test('reads chart labels', ()  => {
  assert.deepEqual(parseChartLabel('D24'), { chartType: 'D', level: 24 });
  assert.deepEqual(parseChartLabel('S4'), { chartType: 'S', level: 4 });
  assert.deepEqual(parseChartLabel('CO-OP 2'), { chartType: 'CO-OP', level: 2 });
  assert.equal(parseChartLabel('???'), null);
});


test('tells sessions apart by name and start time, not by how long they ran', ()  => {
  const card = (title: string, timestamp = 'Wed 21 Oct · 10:00 PM')  =>  ({ mix: 'Phoenix 2', title, timestamp, isOpen: false });
  assert.ok(sameCard(card('Play Session · 77 min'), card('Play Session · 87 min')));
  assert.ok(! sameCard(card('Play Session · 77 min'), card('Play Session · 77 min', 'Wed 21 Oct · 11:00 PM')));
  assert.ok(! sameCard(card('Play Session · 77 min'), card('Official Import · DINO #3869')));
  assert.ok(! sameCard(card('Play Session'), { ...card('Play Session'), mix: 'Phoenix' }));
});
