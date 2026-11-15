// Domain helpers around a care-circle document.
import { adherence, dosesForDate } from '../lib/schedule.js';
import { generateCircleId, generatePasscode, hashPasscode, newId } from '../lib/security.js';
import { localMinutes, nowLocalMinutes, zonedParts } from '../lib/time.js';

export const PERMS = {
  elder: ['meds', 'doses', 'appointments', 'members', 'notes', 'passcodes', 'reminders'],
  caretaker: ['meds', 'doses', 'appointments', 'members', 'notes', 'reminders'],
  family: ['appointments', 'notes'],
};
export const can = (role, perm) => PERMS[role]?.includes(perm) ?? false;

export async function buildNewCircle({ elderName, elderEmail, timezone, creatorName }) {
  // The three passcodes must differ, otherwise a family code could resolve to a higher role.
  let passcodes;
  do {
    passcodes = { elder: generatePasscode(), caretaker: generatePasscode(), family: generatePasscode() };
  } while (new Set(Object.values(passcodes)).size < 3);
  const circle = {
    id: generateCircleId(), elderName, timezone, createdAt: new Date().toISOString(),
    passcodes: Object.fromEntries(Object.entries(passcodes).map(([r, p]) => [r, hashPasscode(p)])),
    members: [{ id: newId(), name: elderName, email: elderEmail || '', role: 'elder', relation: 'Me' }],
    meds: [], appointments: [], logs: [], notes: [], notified: {}, outbox: [], activity: [],
  };
  if (creatorName && creatorName.toLowerCase() !== elderName.toLowerCase()) {
    circle.members.push({ id: newId(), name: creatorName, email: '', role: 'caretaker', relation: 'Set up the circle' });
  }
  logActivity(circle, { name: creatorName || elderName, role: 'elder' }, 'created the care circle');
  return { circle, passcodes };
}

export function logActivity(circle, actor, text) {
  circle.activity.unshift({ at: new Date().toISOString(), by: actor.name, role: actor.role, text });
  circle.activity.length = Math.min(circle.activity.length, 60);
}

/** Keep documents small: forget dose logs older than 60 days. */
export function trimLogs(circle, today) {
  const cutoff = new Date(`${today}T00:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate() - 60);
  const c = cutoff.toISOString().slice(0, 10);
  circle.logs = circle.logs.filter((l) => l.date >= c).slice(-1500);
}

/** What the client sees. Never includes passcode hashes or internal reminder state. */
export function publicView(circle, role) {
  const tz = circle.timezone;
  const now = new Date();
  const { date: today } = zonedParts(tz, now);
  const nowMin = nowLocalMinutes(tz, now);
  const upcoming = circle.appointments
    .filter((a) => localMinutes(a.datetime.slice(0, 10), a.datetime.slice(11)) >= nowMin - 120)
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
  const report = adherence(circle, today, nowMin, 7);
  return {
    id: circle.id, elderName: circle.elderName, timezone: tz, role,
    today, nowMinutes: nowMin - localMinutes(today, '00:00'),
    meds: circle.meds, doses: dosesForDate(circle, today),
    appointments: upcoming, pastAppointments: circle.appointments.filter((a) => !upcoming.includes(a)).slice(-5),
    members: circle.members, notes: circle.notes.slice(0, 5), activity: circle.activity.slice(0, 25),
    outbox: role === 'family' ? [] : circle.outbox.slice(0, 15),
    report: { percent: report.percent, taken: report.taken, due: report.due, streak: report.streak, perMed: report.perMed,
      days: report.days.map((d) => ({ date: d.date, doses: d.doses.map((x) => ({ name: x.name, time: x.time, status: x.status })) })) },
  };
}
