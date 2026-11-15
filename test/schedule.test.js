import test from 'node:test';
import assert from 'node:assert/strict';
import { adherence, dosesForDate, medRunsOn } from '../src/lib/schedule.js';
import { addDays, localMinutes, nowLocalMinutes, zonedParts } from '../src/lib/time.js';

const med = (o = {}) => ({ id: 'm1', name: 'Metformin', dose: '500 mg', instructions: '', times: ['08:00', '20:00'], days: [0, 1, 2, 3, 4, 5, 6], active: true, ...o });
const circle = (meds, logs = []) => ({ meds, logs });

test('timezone: same instant is a different date in IST vs LA', () => {
  const t = new Date('2026-11-15T20:00:00Z');
  assert.equal(zonedParts('Asia/Kolkata', t).date, '2026-11-16');
  assert.equal(zonedParts('America/Los_Angeles', t).date, '2026-11-15');
  assert.equal(nowLocalMinutes('Asia/Kolkata', t) - localMinutes('2026-11-16', '00:00'), 90);
});

test('addDays crosses month boundaries', () => assert.equal(addDays('2026-11-30', 1), '2026-12-01'));

test('medRunsOn honours weekdays, dates and active flag', () => {
  assert.equal(medRunsOn(med({ days: [1] }), '2026-11-16'), true); // Monday
  assert.equal(medRunsOn(med({ days: [1] }), '2026-11-17'), false);
  assert.equal(medRunsOn(med({ endDate: '2026-11-10' }), '2026-11-16'), false);
  assert.equal(medRunsOn(med({ active: false }), '2026-11-16'), false);
});

test('dosesForDate merges logs and sorts by time', () => {
  const logs = [{ key: 'm1|2026-11-16|08:00', status: 'taken', by: 'Priya' }];
  const d = dosesForDate(circle([med()], logs), '2026-11-16');
  assert.deepEqual(d.map((x) => [x.time, x.status]), [['08:00', 'taken'], ['20:00', 'pending']]);
});

test('adherence ignores future doses and counts streak', () => {
  const logs = [];
  for (const date of ['2026-11-14', '2026-11-15']) for (const t of ['08:00', '20:00']) logs.push({ key: `m1|${date}|${t}`, status: 'taken' });
  const now = localMinutes('2026-11-16', '09:00');
  const r = adherence(circle([med()], logs), '2026-11-16', now, 3);
  assert.equal(r.due, 6 - 1 - 0 ); // 3 days x 2 doses, minus today's 20:00 which is still future
  assert.equal(r.taken, 4);
  assert.equal(r.streak, 2);
  assert.equal(r.percent, 80);
});
