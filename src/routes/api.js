import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { adherence } from '../lib/schedule.js';
import { hashPasscode, generatePasscode, newId, safeEqual, signToken, verifyPasscode, verifyToken } from '../lib/security.js';
import { nowLocalMinutes, zonedParts } from '../lib/time.js';
import {
  apptSchema, authSchema, createCircleSchema, doseSchema, medSchema, memberSchema,
  noteSchema, parseMedSchema, rotateSchema,
} from '../lib/validate.js';
import { buildNewCircle, can, logActivity, publicView, trimLogs } from '../services/circles.js';
import { parseMedication, weeklyStory } from '../services/gemini.js';
import { recordOutbox, runTick } from '../services/reminders.js';
import { sendMail } from '../services/mailer.js';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const limiter = (windowMin, max) => rateLimit({
  windowMs: windowMin * 60 * 1000, limit: max, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const parse = (schema, body) => {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
  return r.data;
};

// Express 5 forwards rejected promises to the error handler, so handlers can simply be async.
export function apiRouter(store) {
  const r = Router();

  // ---- auth middleware ----
  const auth = (perm) => async (req, _res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const session = verifyToken(token);
    if (!session) throw new HttpError(401, 'Please sign in again.');
    if (perm && !can(session.role, perm)) throw new HttpError(403, 'Your role can view this but not change it.');
    req.session = session;
    next();
  };
  const mutate = (req, fn) => store.update(req.session.cid, async (circle) => {
    const result = await fn(circle);
    trimLogs(circle, zonedParts(circle.timezone).date);
    return result;
  }).then((circle) => {
    if (!circle) throw new HttpError(404, 'Care circle not found.');
    return circle;
  });
  const actor = (req) => ({ name: req.session.name, role: req.session.role });
  const view = (circle, req) => publicView(circle, req.session.role);

  // ---- public ----
  r.get('/healthz', (_req, res) => res.json({ ok: true, gemini: Boolean(config.gemini.key), store: config.store, smtp: Boolean(config.smtp.host) }));

  r.post('/circles', limiter(60, 10), async (req, res) => {
    const input = parse(createCircleSchema, req.body);
    const { circle, passcodes } = await buildNewCircle(input);
    await store.create(circle);
    const token = signToken({ cid: circle.id, role: 'elder', name: input.creatorName || input.elderName });
    res.status(201).json({ circleId: circle.id, passcodes, token });
  });

  r.post('/auth', limiter(15, 20), async (req, res) => {
    const { circleId, passcode, name } = parse(authSchema, req.body);
    const circle = await store.get(circleId);
    // Same message for "no such circle" and "wrong passcode": don't reveal which circles exist.
    const role = circle && ['elder', 'caretaker', 'family'].find((x) => verifyPasscode(passcode, circle.passcodes[x]));
    if (!role) throw new HttpError(401, 'That circle ID and passcode do not match.');
    res.json({ token: signToken({ cid: circleId, role, name }), role });
  });

  // ---- circle ----
  r.get('/circle', auth(), async (req, res) => {
    const circle = await store.get(req.session.cid);
    if (!circle) throw new HttpError(404, 'Care circle not found.');
    res.json(view(circle, req));
  });

  // ---- medicines ----
  r.post('/meds', auth('meds'), async (req, res) => {
    const input = parse(medSchema, req.body);
    const circle = await mutate(req, (c) => {
      c.meds.push({ id: newId(), ...input });
      logActivity(c, actor(req), `added ${input.name} ${input.dose}`.trim());
    });
    res.status(201).json(view(circle, req));
  });

  r.put('/meds/:id', auth('meds'), async (req, res) => {
    const input = parse(medSchema, req.body);
    const circle = await mutate(req, (c) => {
      const i = c.meds.findIndex((m) => m.id === req.params.id);
      if (i < 0) throw new HttpError(404, 'Medicine not found.');
      c.meds[i] = { id: c.meds[i].id, ...input };
      logActivity(c, actor(req), `updated ${input.name}`);
    });
    res.json(view(circle, req));
  });

  r.delete('/meds/:id', auth('meds'), async (req, res) => {
    const circle = await mutate(req, (c) => {
      const m = c.meds.find((x) => x.id === req.params.id);
      if (!m) throw new HttpError(404, 'Medicine not found.');
      c.meds = c.meds.filter((x) => x.id !== m.id);
      logActivity(c, actor(req), `removed ${m.name}`);
    });
    res.json(view(circle, req));
  });

  // ---- dose check-ins ----
  r.post('/doses', auth('doses'), async (req, res) => {
    const d = parse(doseSchema, req.body);
    const circle = await mutate(req, (c) => {
      const med = c.meds.find((m) => m.id === d.medId);
      if (!med || !med.times.includes(d.time)) throw new HttpError(404, 'That dose is not on the schedule.');
      const key = `${d.medId}|${d.date}|${d.time}`;
      c.logs = c.logs.filter((l) => l.key !== key);
      if (d.status !== 'pending') c.logs.push({ key, medId: d.medId, date: d.date, time: d.time, status: d.status, by: req.session.name, at: new Date().toISOString() });
      logActivity(c, actor(req), d.status === 'pending' ? `undid ${med.name} (${d.time})` : `marked ${med.name} (${d.time}) as ${d.status}`);
    });
    res.json(view(circle, req));
  });

  // ---- appointments ----
  r.post('/appointments', auth('appointments'), async (req, res) => {
    const input = parse(apptSchema, req.body);
    const circle = await mutate(req, (c) => {
      c.appointments.push({ id: newId(), ...input });
      logActivity(c, actor(req), `added appointment "${input.title}"`);
    });
    res.status(201).json(view(circle, req));
  });

  r.put('/appointments/:id', auth('appointments'), async (req, res) => {
    const input = parse(apptSchema, req.body);
    const circle = await mutate(req, (c) => {
      const i = c.appointments.findIndex((a) => a.id === req.params.id);
      if (i < 0) throw new HttpError(404, 'Appointment not found.');
      c.appointments[i] = { id: c.appointments[i].id, ...input };
      for (const k of [`appt24|${req.params.id}`, `appt2|${req.params.id}`]) delete c.notified[k]; // rescheduled -> remind again
      logActivity(c, actor(req), `updated appointment "${input.title}"`);
    });
    res.json(view(circle, req));
  });

  r.delete('/appointments/:id', auth('appointments'), async (req, res) => {
    const circle = await mutate(req, (c) => {
      const a = c.appointments.find((x) => x.id === req.params.id);
      if (!a) throw new HttpError(404, 'Appointment not found.');
      c.appointments = c.appointments.filter((x) => x.id !== a.id);
      logActivity(c, actor(req), `cancelled appointment "${a.title}"`);
    });
    res.json(view(circle, req));
  });

  // ---- members & passcodes ----
  r.post('/members', auth('members'), async (req, res) => {
    const input = parse(memberSchema, req.body);
    if (input.role === 'elder') throw new HttpError(400, 'There is only one elder per circle.');
    const circle = await mutate(req, (c) => {
      c.members.push({ id: newId(), ...input });
      logActivity(c, actor(req), `added ${input.name} to the circle`);
    });
    res.status(201).json(view(circle, req));
  });

  r.delete('/members/:id', auth('members'), async (req, res) => {
    const circle = await mutate(req, (c) => {
      const m = c.members.find((x) => x.id === req.params.id);
      if (!m) throw new HttpError(404, 'Member not found.');
      if (m.role === 'elder') throw new HttpError(400, 'The elder cannot be removed from their own circle.');
      c.members = c.members.filter((x) => x.id !== m.id);
      logActivity(c, actor(req), `removed ${m.name} from the circle`);
    });
    res.json(view(circle, req));
  });

  // Only the elder can rotate passcodes (e.g. when a carer leaves). The new code is shown once.
  r.post('/passcodes/rotate', auth('passcodes'), limiter(15, 10), async (req, res) => {
    const { role } = parse(rotateSchema, req.body);
    const passcode = generatePasscode();
    await mutate(req, (c) => {
      c.passcodes[role] = hashPasscode(passcode);
      logActivity(c, actor(req), `changed the ${role} passcode`);
    });
    res.json({ role, passcode });
  });

  // ---- warm notes (any role) ----
  r.post('/notes', auth('notes'), async (req, res) => {
    const { text } = parse(noteSchema, req.body);
    const circle = await mutate(req, (c) => {
      c.notes.unshift({ id: newId(), text, by: req.session.name, role: req.session.role, at: new Date().toISOString() });
      c.notes.length = Math.min(c.notes.length, 20);
    });
    res.status(201).json(view(circle, req));
  });

  // ---- Gemini ----
  r.post('/ai/parse-med', auth('meds'), limiter(10, 30), async (req, res) => {
    const { text } = parse(parseMedSchema, req.body);
    res.json(await parseMedication(text)); // a *proposal*: the UI always asks the human to confirm
  });

  r.get('/ai/story', auth(), limiter(10, 20), async (req, res) => {
    const circle = await store.get(req.session.cid);
    if (!circle) throw new HttpError(404, 'Care circle not found.');
    const tz = circle.timezone;
    const report = adherence(circle, zonedParts(tz).date, nowLocalMinutes(tz), 7);
    res.json(await weeklyStory({ elderName: circle.elderName, report, appointments: circle.appointments }));
  });

  // ---- reminders ----
  r.post('/reminders/test', auth('reminders'), limiter(15, 5), async (req, res) => {
    const circle = await store.get(req.session.cid);
    const recipients = circle.members.filter((m) => m.email);
    if (!recipients.length) throw new HttpError(400, 'Add an email address to at least one member first.');
    const records = [];
    for (const m of recipients) {
      const rec = await sendMail({ to: m.email, subject: 'Thunai test reminder', heading: 'This is a test reminder', lines: [`Hello ${m.name}, reminders for ${circle.elderName} will arrive here.`], tone: 'soft', cta: { label: 'Open Thunai', url: config.appUrl } });
      records.push({ ...rec, kind: 'test', toName: m.name });
    }
    await recordOutbox(store, circle.id, records);
    res.json({ sent: records.length, simulated: records.every((x) => x.status === 'simulated') });
  });

  // Called by Cloud Scheduler (or any cron). Authenticated by a shared secret, not a user session.
  r.post('/cron/tick', async (req, res) => {
    if (!config.cronSecret || !safeEqual(req.headers['x-cron-secret'], config.cronSecret)) throw new HttpError(401, 'Bad cron secret.');
    res.json(await runTick(store));
  });

  return r;
}

export { HttpError };
