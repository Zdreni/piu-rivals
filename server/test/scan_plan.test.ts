import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type CardStep, type Checkpoint, planScan, stepCard } from '../src/scraper/scan_plan.ts';
import type { SessionCard } from '../src/scraper/session_page.ts';

const card = (timestamp: string, mix = 'Phoenix 2'): SessionCard => ({ mix, title: 'Official Import', timestamp, isOpen: false });
const stored = (timestamp: string) => ({ title: 'Official Import', timestamp });


// Pages through `cards` (newest first) like the scraper does, and plans the scan.
function plan(checkpoint: Checkpoint, cards: SessionCard[]) {
  const collected: SessionCard[] = [];
  let stop: CardStep | null = null;
  for (const c of cards) {
    const step = stepCard(checkpoint, c);
    if (step.kind !== 'continue') {
      stop = step;
      break;
    }

    if (c.mix === 'Phoenix 2')
      collected.push(c);
  }

  const result = planScan(checkpoint, collected, stop);
  return { grown: result.grown?.timestamp  ??  null, fresh: result.fresh.map((c) => c.timestamp) };
}


test('a player without a checkpoint gets their whole Phoenix 2 history, oldest first', () => {
  const cards = [card('Wed 3'), card('Tue 2'), card('Mon 1'), card('Sun 0', 'Phoenix'), card('Sat -1')];
  assert.deepEqual(plan({ latest: null, anchor: null }, cards), { grown: null, fresh: ['Mon 1', 'Tue 2', 'Wed 3'] });
});


test('nothing new when the latest stored session is first and unchanged', () => {
  const checkpoint = { latest: stored('Wed 3'), anchor: stored('Tue 2') };
  assert.deepEqual(plan(checkpoint, [card('Wed 3'), card('Tue 2')]), { grown: null, fresh: [] });
});


test('sessions above the unchanged latest one are all new', () => {
  const checkpoint = { latest: stored('Wed 3'), anchor: stored('Tue 2') };
  assert.deepEqual(plan(checkpoint, [card('Fri 5'), card('Thu 4'), card('Wed 3'), card('Tue 2')]),
    { grown: null, fresh: ['Thu 4', 'Fri 5'] });
});


test('when the latest session moved, the one above the anchor is the grown session', () => {
  const checkpoint = { latest: stored('Wed 3 · 7:00 PM'), anchor: stored('Tue 2') };
  assert.deepEqual(plan(checkpoint, [card('Thu 4'), card('Wed 3 · 9:30 PM'), card('Tue 2')]),
    { grown: 'Wed 3 · 9:30 PM', fresh: ['Thu 4'] });
});


test('a player with one stored session: the oldest Phoenix 2 session is the grown one', () => {
  const checkpoint = { latest: stored('Mon 1 · 7:00 PM'), anchor: null };
  assert.deepEqual(plan(checkpoint, [card('Tue 2'), card('Mon 1 · 8:00 PM'), card('Sun 0', 'Phoenix')]),
    { grown: 'Mon 1 · 8:00 PM', fresh: ['Tue 2'] });
});


test('a broken checkpoint asks for a rescan', () => {
  const checkpoint = { latest: stored('Wed 3'), anchor: stored('Tue 2') };
  assert.throws(() => plan(checkpoint, [card('Thu 4'), card('Mon 1')]), /needs a rescan/);
  assert.throws(() => plan({ latest: stored('Wed 3'), anchor: stored('Tue 2') }, [card('Tue 2')]), /needs a rescan/);
});
