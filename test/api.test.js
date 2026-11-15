import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { ruleBasedParse } from '../src/services/gemini.js';
import { hashPasscode, signToken, verifyPasscode, verifyToken } from '../src/lib/security.js';

let s; let circle;
before(async () => {
  s = await startServer();
  const r = await s.call('/circles', { method: 'POST', body: { elderName: 'Kamala Paati', elderEmail: 'k@x.com', creatorName: 'Hema' } });
  assert.equal(r.status, 201); circle = r.body;
});
after(() => s.close());

const login = async (role, name = 'Tester') => (await s.call('/auth', { method: 'POST', body: { circleId: circle.circleId, passcode: circle.passcodes[role], name } })).body;
const med = { name: 'Metformin', dose: '500 mg', times: ['08:00', '20:00'], days: [0, 1, 2, 3, 4, 5, 6] };

test('passcode login resolves the right role; wrong passcode is rejected', async () => {
  assert.equal((await login('family')).role, 'family');
  assert.equal((await login('caretaker')).role, 'caretaker');
  const bad = await s.call('/auth', { method: 'POST', body: { circleId: circle.circleId, passcode: 'nope-0000', name: 'x' } });
  assert.equal(bad.status, 401);
});

test('API never leaks passcode hashes', async () => {
  const { token } = await login('elder');
  const { body } = await s.call('/circle', { token });
  assert.ok(!JSON.stringify(body).includes('hash'));
  assert.ok(!('passcodes' in body));
});

test('unauthenticated and tampered tokens are refused', async () => {
  assert.equal((await s.call('/circle')).status, 401);
  const { token } = await login('family');
  assert.equal((await s.call('/circle', { token: token.slice(0, -2) + 'xx' })).status, 401);
});

test('family cannot change medicines but caretaker can', async () => {
  const fam = await login('family'); const care = await login('caretaker', 'Nurse');
  assert.equal((await s.call('/meds', { method: 'POST', token: fam.token, body: med })).status, 403);
  const ok = await s.call('/meds', { method: 'POST', token: care.token, body: med });
  assert.equal(ok.status, 201); assert.equal(ok.body.meds.length, 1);
});

test('dose check-in is recorded, attributed and appears in the activity feed', async () => {
  const { token } = await login('elder', 'Kamala');
  const c = (await s.call('/circle', { token })).body;
  const r = await s.call('/doses', { method: 'POST', token, body: { medId: c.meds[0].id, date: c.today, time: '08:00', status: 'taken' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.doses.find((d) => d.time === '08:00').status, 'taken');
  assert.match(r.body.activity[0].text, /Metformin/);
  const bad = await s.call('/doses', { method: 'POST', token, body: { medId: c.meds[0].id, date: c.today, time: '09:30', status: 'taken' } });
  assert.equal(bad.status, 404);
});

test('validation rejects bad input', async () => {
  const { token } = await login('caretaker');
  assert.equal((await s.call('/meds', { method: 'POST', token, body: { name: '', times: ['25:00'] } })).status, 400);
  assert.equal((await s.call('/appointments', { method: 'POST', token, body: { title: 'x', datetime: 'tomorrow' } })).status, 400);
});

test('family can add appointments and send notes', async () => {
  const { token } = await login('family', 'Priya');
  assert.equal((await s.call('/appointments', { method: 'POST', token, body: { title: 'Eye check', datetime: '2099-01-01T10:00' } })).status, 201);
  const n = await s.call('/notes', { method: 'POST', token, body: { text: 'Love you Paati' } });
  assert.equal(n.body.notes[0].by, 'Priya');
});

test('only the elder can rotate passcodes, and the old one stops working', async () => {
  assert.equal((await s.call('/passcodes/rotate', { method: 'POST', token: (await login('caretaker')).token, body: { role: 'family' } })).status, 403);
  const r = await s.call('/passcodes/rotate', { method: 'POST', token: (await login('elder')).token, body: { role: 'family' } });
  assert.equal(r.status, 200);
  const old = await s.call('/auth', { method: 'POST', body: { circleId: circle.circleId, passcode: circle.passcodes.family, name: 'x' } });
  assert.equal(old.status, 401);
  circle.passcodes.family = r.body.passcode;
  assert.equal((await login('family')).role, 'family');
});

test('the elder cannot be removed from their own circle', async () => {
  const { token } = await login('caretaker');
  const c = (await s.call('/circle', { token })).body;
  const elder = c.members.find((m) => m.role === 'elder');
  assert.equal((await s.call(`/members/${elder.id}`, { method: 'DELETE', token })).status, 400);
});

test('cron endpoint requires the shared secret', async () => {
  assert.equal((await s.call('/cron/tick', { method: 'POST' })).status, 401);
});

test('smart add falls back to rules without a Gemini key', async () => {
  const { token } = await login('elder');
  const r = await s.call('/ai/parse-med', { method: 'POST', token, body: { text: 'Take Amlodipine 5mg at 8am and 8pm after food' } });
  assert.equal(r.body.source, 'rules'); assert.deepEqual(r.body.times, ['08:00', '20:00']); assert.equal(r.body.dose, '5mg');
});

test('security helpers', () => {
  assert.equal(verifyPasscode('Jasmine-1234 ', hashPasscode('jasmine-1234')), true);
  assert.equal(verifyPasscode('jasmine-1235', hashPasscode('jasmine-1234')), false);
  assert.equal(verifyToken(signToken({ a: 1 }, -10)), null);
  assert.deepEqual(ruleBasedParse('Metformin 500 mg twice a day').times, ['08:00', '20:00']);
});

test('security headers are present', async () => {
  const res = await fetch(`http://127.0.0.1:${s.port}/`);
  assert.ok(res.headers.get('content-security-policy'));
  assert.equal(res.headers.get('x-powered-by'), null);
});
