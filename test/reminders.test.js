import test from 'node:test';
import assert from 'node:assert/strict';
import { planReminders, runCircleTick } from '../src/services/reminders.js';
import { FileStore } from '../src/store/fileStore.js';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const cfg = { leadMinutes: 10, missedAfterMinutes: 30, giveUpAfterMinutes: 360 };
const base = () => ({
  id: 'THN-TEST01', elderName: 'Kamala', timezone: 'Asia/Kolkata', notified: {}, outbox: [], logs: [],
  members: [{ id: 'a', name: 'Kamala', email: 'k@x.com', role: 'elder' }, { id: 'b', name: 'Priya', email: 'p@x.com', role: 'family' }, { id: 'c', name: 'NoMail', email: '', role: 'family' }],
  meds: [{ id: 'm1', name: 'Metformin', dose: '500 mg', instructions: '', times: ['08:00'], days: [0, 1, 2, 3, 4, 5, 6], active: true }],
  appointments: [],
});
// 2026-11-16 08:00 IST == 02:30 UTC
const at = (hh, mm) => new Date(Date.UTC(2026, 10, 16, hh, mm) - 5.5 * 3600 * 1000);

test('nothing is sent long before a dose', () => assert.equal(planReminders(base(), at(6, 0), cfg).length, 0));

test('"due" nudge goes only to the elder, 10 minutes before', () => {
  const p = planReminders(base(), at(7, 52), cfg);
  assert.equal(p.length, 1); assert.equal(p[0].kind, 'due');
  assert.deepEqual(p[0].to.map((m) => m.email), ['k@x.com']);
});

test('"missed" escalation goes to everyone with an email, after 30 minutes', () => {
  const p = planReminders(base(), at(8, 31), cfg).find((x) => x.kind === 'missed');
  assert.deepEqual(p.to.map((m) => m.email).sort(), ['k@x.com', 'p@x.com']);
});

test('a logged dose triggers nothing', () => {
  const c = base(); c.logs.push({ key: 'm1|2026-11-16|08:00', status: 'taken' });
  assert.equal(planReminders(c, at(8, 40), cfg).length, 0);
});

test('stale doses (server was down) do not spam', () => assert.equal(planReminders(base(), at(15, 0), cfg).length, 0));

test('appointment gets one 24h reminder, then only a 2h one', () => {
  const c = base(); c.meds = [];
  c.appointments = [{ id: 'ap1', title: 'Check-up', doctor: 'Dr M', location: '', notes: '', datetime: '2026-11-17T10:00' }];
  const day = (hh, mm, d = 16) => new Date(Date.UTC(2026, 10, d, hh, mm) - 5.5 * 3600e3);
  assert.equal(planReminders(c, day(11, 0), cfg).filter((x) => x.kind === 'appointment').length, 1);
  c.notified['appt24|ap1'] = 'sent';
  assert.equal(planReminders(c, day(11, 0), cfg).length, 0);
  const twoHour = planReminders(c, day(8, 30, 17), cfg);
  assert.deepEqual(twoHour.map((x) => x.key), ['appt2|ap1']);
});

test('runCircleTick is idempotent: a second tick sends nothing', async () => {
  const store = new FileStore(fs.mkdtempSync(path.join(os.tmpdir(), 'thunai-r-')));
  await store.create(base());
  assert.equal(await runCircleTick(store, 'THN-TEST01', at(8, 31)), 2); // missed-dose mail to elder + Priya
  assert.equal(await runCircleTick(store, 'THN-TEST01', at(8, 32)), 0);
  assert.equal((await store.get('THN-TEST01')).outbox.length, 2);
});
