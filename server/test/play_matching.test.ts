import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newTries, type TryStats } from '../src/scraper/play_matching.ts';

const attempt = (chartId: number, score: number, miss = 0): TryStats => ({
  chartId, score, passed: true, perfect: 100, great: 1, good: 0, bad: 0, miss, maxCombo: 101,
});


test('a grown session adds only the tries not stored from it before', () => {
  const stored = [attempt(1, 990000), attempt(2, 950000)];
  const scanned = [attempt(1, 990000), attempt(2, 950000), attempt(2, 960000), attempt(3, 900000)];
  assert.deepEqual(newTries(stored, scanned), [attempt(2, 960000), attempt(3, 900000)]);
});


test('identical tries are counted', () => {
  const perfect = attempt(1, 1000000);
  assert.deepEqual(newTries([perfect, perfect], [perfect, perfect, perfect]), [perfect]);
  assert.deepEqual(newTries([perfect], [perfect]), []);
});


test('tries differing in any stat are different', () => {
  assert.deepEqual(newTries([attempt(1, 990000, 0)], [attempt(1, 990000, 1)]), [attempt(1, 990000, 1)]);
});
