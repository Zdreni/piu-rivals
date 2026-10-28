import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type CardStep, cardDates, type Checkpoint, planScan, stepCard } from '../src/scraper/scan_plan.ts';
import type { SessionCard } from '../src/scraper/session_page.ts';

const card = (timestamp: string, mix = 'Phoenix 2'): SessionCard  =>  ({ mix, title: 'Official Import', timestamp, isOpen: false });

const stored = (timestamp: string)  =>  ({ title: 'Official Import', timestamp });


// Pages through `cards` (newest first) like the scraper does, and plans the scan. Cards are dated
// as of `now` when given; otherwise their made-up timestamps are left undated.
function plan(checkpoint: Checkpoint, cards: SessionCard[], now?: number) {
  const dateOf = (now === undefined  ?  ()  =>  null  :  cardDates(now));
  const collected: SessionCard[] = [];
  let stop: CardStep | null = null;
  for (const c of cards) {
    const step = stepCard(checkpoint, c, dateOf(c.timestamp));
    if (step.kind !== 'continue') {
      stop = step;
      break;
    }

    collected.push(c);
  }

  // Sessions of other mixes are marked: the scraper only moves the checkpoint past them.
  const label = (c: SessionCard)  =>  (c.mix === 'Phoenix 2'  ?  c.timestamp  :  `${c.timestamp} (${c.mix})`);
  const result = planScan(checkpoint, collected, stop);
  return { grown: (result.grown  ?  label(result.grown)  :  null), fresh: result.fresh.map(label) };
}


test('a player without a checkpoint gets their whole history, oldest first', ()  => {
  const cards = [card('Wed 3'), card('Tue 2', 'Phoenix'), card('Mon 1')];
  assert.deepEqual(plan({ latest: null, anchor: null }, cards), { grown: null, fresh: ['Mon 1', 'Tue 2 (Phoenix)', 'Wed 3'] });
});


test('nothing new when the latest stored session is first and unchanged', ()  => {
  const checkpoint = { latest: stored('Wed 3'), anchor: stored('Tue 2') };
  assert.deepEqual(plan(checkpoint, [card('Wed 3'), card('Tue 2')]), { grown: null, fresh: [] });
});


test('sessions above the unchanged latest one are all new', ()  => {
  const checkpoint = { latest: stored('Wed 3'), anchor: stored('Tue 2') };
  assert.deepEqual(plan(checkpoint, [card('Fri 5'), card('Thu 4', 'Phoenix'), card('Wed 3'), card('Tue 2')]),
    { grown: null, fresh: ['Thu 4 (Phoenix)', 'Fri 5'] });
});


test('the latest stored session can be of another mix', ()  => {
  const checkpoint = { latest: stored('Wed 3'), anchor: stored('Tue 2') };
  assert.deepEqual(plan(checkpoint, [card('Thu 4'), card('Wed 3', 'Phoenix'), card('Tue 2')]), { grown: null, fresh: ['Thu 4'] });
  assert.deepEqual(plan(checkpoint, [card('Wed 3 · 9:30 PM', 'Phoenix'), card('Tue 2')]),
    { grown: 'Wed 3 · 9:30 PM (Phoenix)', fresh: [] });
  // A Phoenix 2 session above the grown Phoenix one is taken as grown; its plays are stored all the same.
  assert.deepEqual(plan(checkpoint, [card('Thu 4'), card('Wed 3 · 9:30 PM', 'Phoenix'), card('Tue 2')]),
    { grown: 'Thu 4', fresh: [] });
});


test('when the latest session moved, the one above the anchor is the grown session', ()  => {
  const checkpoint = { latest: stored('Wed 3 · 7:00 PM'), anchor: stored('Tue 2') };
  assert.deepEqual(plan(checkpoint, [card('Thu 4'), card('Wed 3 · 9:30 PM'), card('Tue 2')]),
    { grown: 'Wed 3 · 9:30 PM', fresh: ['Thu 4'] });
});


test('checkpoints stored before other mixes were tracked: Phoenix sessions above the anchor are passed over', ()  => {
  // The anchor and the latest session were the last two Phoenix 2 ones, with a Phoenix one between.
  const checkpoint = { latest: stored('Wed 3 · 7:00 PM'), anchor: stored('Mon 1') };
  assert.deepEqual(plan(checkpoint, [card('Thu 4', 'Phoenix'), card('Wed 3 · 9:30 PM'), card('Tue 2', 'Phoenix'), card('Mon 1')]),
    { grown: 'Wed 3 · 9:30 PM', fresh: ['Thu 4 (Phoenix)'] });
});


test('a player with one stored session: the oldest Phoenix 2 session is the grown one', ()  => {
  const checkpoint = { latest: stored('Mon 1 · 7:00 PM'), anchor: null };
  assert.deepEqual(plan(checkpoint, [card('Tue 2'), card('Mon 1 · 8:00 PM'), card('Sun 0', 'Phoenix')]),
    { grown: 'Mon 1 · 8:00 PM', fresh: ['Tue 2'] });
});


test('a broken checkpoint asks for a rescan', ()  => {
  const checkpoint = { latest: stored('Wed 3'), anchor: stored('Tue 2') };
  assert.throws(()  =>  plan(checkpoint, [card('Thu 4'), card('Mon 1')]), /needs a rescan/);
  assert.throws(()  =>  plan(checkpoint, [card('Tue 2')]), /needs a rescan/);
  assert.throws(()  =>  plan({ latest: stored('Wed 3'), anchor: null }, []), /needs a rescan/);
});


test('card dates get their year from the weekday, going back from now', ()  => {
  const dateOf = cardDates(Date.UTC(2026, 9, 21, 12));
  const iso = (timestamp: string)  =>  new Date(dateOf(timestamp)!).toISOString().slice(0, 10);
  assert.equal(iso('Wed 21 Oct · 4:28 PM'), '2026-10-21');
  assert.equal(iso('Fri 18 Sep · 7:03 PM'), '2026-09-18');
  assert.equal(iso('Tue 21 Oct · 12:13 AM'), '2025-10-21');
  // More than a year without sessions.
  assert.equal(iso('Tue 16 Apr · 8:31 PM'), '2024-04-16');
  assert.equal(dateOf('Official Import'), null);
});


test('paging stops at the first session from before Phoenix 2 came out', ()  => {
  const now = Date.UTC(2026, 9, 21, 12);
  const cards = [card('Wed 21 Oct · 4:28 PM', 'Phoenix'), card('Fri 18 Sep · 7:03 PM'), card('Thu 9 Jul · 10:00 PM', 'Phoenix'),
    card('Wed 8 Jul · 11:07 PM', 'Phoenix'), card('Tue 7 Jul · 11:55 PM')];
  assert.deepEqual(plan({ latest: null, anchor: null }, cards, now),
    { grown: null, fresh: ['Thu 9 Jul · 10:00 PM (Phoenix)', 'Fri 18 Sep · 7:03 PM', 'Wed 21 Oct · 4:28 PM (Phoenix)'] });
  // AEOLINA's case: a Phoenix session above the only stored one.
  assert.deepEqual(plan({ latest: stored('Fri 18 Sep · 7:03 PM'), anchor: null }, cards, now),
    { grown: null, fresh: ['Wed 21 Oct · 4:28 PM (Phoenix)'] });
});
