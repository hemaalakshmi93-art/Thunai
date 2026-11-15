// Reminder engine. Runs on every "tick" (Cloud Scheduler hits POST /api/cron/tick every
// few minutes, or an in-process timer does). Three steps keep it safe to run twice:
//   1. plan   (pure)        - what *should* be sent right now?
//   2. claim  (transaction) - atomically mark those as notified; only winners proceed
//   3. send   (network)     - email, then record results in the Outbox
import { config } from '../config.js';
import { dosesForDate } from '../lib/schedule.js';
import { addDays, localMinutes, nowLocalMinutes, prettyDateTime, prettyTime, zonedParts } from '../lib/time.js';
import { sendMail } from './mailer.js';

const withEmail = (members, roles) => members.filter((m) => m.email && (!roles || roles.includes(m.role)));

/** Pure: decide which reminders are due at `now`. */
export function planReminders(circle, now = new Date(), cfg = config.reminders) {
  const tz = circle.timezone;
  const today = zonedParts(tz, now).date;
  const nowMin = nowLocalMinutes(tz, now);
  const plans = [];
  const seen = circle.notified || {};
  const elder = circle.elderName;
  const link = { label: 'Open Thunai', url: config.appUrl };

  // Look at yesterday too so a 23:50 dose can still escalate after midnight.
  for (const date of [addDays(today, -1), today]) {
    for (const d of dosesForDate(circle, date)) {
      if (d.status !== 'pending') continue;
      const at = localMinutes(date, d.time);
      const label = `${d.name}${d.dose ? ` ${d.dose}` : ''}`;
      const dueKey = `due|${d.key}`;
      const missKey = `missed|${d.key}`;
      if (!seen[dueKey] && nowMin >= at - cfg.leadMinutes && nowMin < at + cfg.missedAfterMinutes) {
        plans.push({
          key: dueKey, kind: 'due', to: withEmail(circle.members, ['elder']),
          subject: `Time for ${label} at ${prettyTime(d.time)}`, heading: `${elder}, it's almost time for your medicine`,
          lines: [`${label} — ${prettyTime(d.time)}.`, d.instructions || 'Take it with a glass of water.', 'Tap the button in Thunai once you have taken it so your family knows you are doing well.'],
          tone: 'info', cta: link,
        });
      }
      if (!seen[missKey] && nowMin >= at + cfg.missedAfterMinutes && nowMin < at + cfg.giveUpAfterMinutes) {
        plans.push({
          key: missKey, kind: 'missed', to: withEmail(circle.members),
          subject: `${elder} has not logged ${label} (${prettyTime(d.time)})`, heading: `A dose may have been missed`,
          lines: [`${elder} has not marked ${label} as taken. It was due at ${prettyTime(d.time)}.`, 'A quick phone call or message is probably all that is needed. They may simply have forgotten to tap the button.'],
          tone: 'alert', cta: link,
        });
      }
    }
  }

  for (const a of circle.appointments || []) {
    const at = localMinutes(a.datetime.slice(0, 10), a.datetime.slice(11));
    if (nowMin >= at) continue;
    const k2 = `appt2|${a.id}`; const k24 = `appt24|${a.id}`;
    const base = {
      to: withEmail(circle.members),
      lines: [`${a.title}${a.doctor ? ` with ${a.doctor}` : ''}`, prettyDateTime(a.datetime), a.location ? `Where: ${a.location}` : 'Location not added yet.', a.notes || ''].filter(Boolean),
      cta: link,
    };
    if (nowMin >= at - 120) {
      if (!seen[k2]) plans.push({ ...base, key: k2, kind: 'appointment', subject: `Appointment in about 2 hours: ${a.title}`, heading: `${elder}'s appointment is today, soon`, tone: 'alert' });
      if (!seen[k24]) plans.push({ ...base, key: k24, kind: 'silent', to: [] }); // skip the 24h mail, 2h one is enough
    } else if (nowMin >= at - 1440 && !seen[k24]) {
      plans.push({ ...base, key: k24, kind: 'appointment', subject: `Appointment tomorrow: ${a.title}`, heading: `${elder} has an appointment coming up`, tone: 'info' });
    }
  }
  return plans;
}

function pruneNotified(circle, today) {
  const cutoff = addDays(today, -3);
  for (const k of Object.keys(circle.notified)) {
    const m = k.match(/\|(\d{4}-\d{2}-\d{2})\|/);
    if (m && m[1] < cutoff) delete circle.notified[k];
  }
}

export async function runCircleTick(store, id, now = new Date()) {
  // Step 2: claim. Only reminders we newly marked are ours to send.
  let claimed = [];
  await store.update(id, (circle) => {
    circle.notified ||= {};
    const plans = planReminders(circle, now);
    for (const p of plans) circle.notified[p.key] = now.toISOString();
    pruneNotified(circle, zonedParts(circle.timezone, now).date);
    claimed = plans.filter((p) => p.to.length);
  });
  if (!claimed.length) return 0;

  // Step 3: send, then log to the outbox.
  const records = [];
  for (const plan of claimed) {
    for (const m of plan.to) {
      const rec = await sendMail({ to: m.email, subject: plan.subject, heading: plan.heading, lines: plan.lines, tone: plan.tone, cta: plan.cta });
      records.push({ ...rec, kind: plan.kind, toName: m.name });
    }
  }
  await recordOutbox(store, id, records);
  return records.length;
}

export async function recordOutbox(store, id, records) {
  if (!records.length) return;
  await store.update(id, (circle) => {
    circle.outbox = [...records, ...(circle.outbox || [])].slice(0, 40);
  });
}

export async function runTick(store, now = new Date()) {
  const ids = await store.list();
  let sent = 0;
  for (const id of ids) {
    try { sent += await runCircleTick(store, id, now); } catch (err) { console.error(`tick failed for ${id}:`, err.message); }
  }
  return { circles: ids.length, emails: sent };
}
