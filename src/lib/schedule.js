// Pure scheduling logic: which doses exist on which day, and what state are they in.
// No I/O here, so it is trivially unit-testable.
import { addDays, dowOf, localMinutes } from './time.js';

export const doseKey = (medId, date, time) => `${medId}|${date}|${time}`;

/** Is this medicine supposed to be taken on `date`? */
export function medRunsOn(med, date) {
  if (!med.active) return false;
  if (med.startDate && date < med.startDate) return false;
  if (med.endDate && date > med.endDate) return false;
  return med.days.includes(dowOf(date));
}

/** All doses scheduled for a date, with their logged status (taken / skipped / pending). */
export function dosesForDate(circle, date) {
  const logs = new Map(circle.logs.map((l) => [l.key, l]));
  const out = [];
  for (const med of circle.meds) {
    if (!medRunsOn(med, date)) continue;
    for (const time of med.times) {
      const key = doseKey(med.id, date, time);
      const log = logs.get(key);
      out.push({
        key, medId: med.id, name: med.name, dose: med.dose, instructions: med.instructions,
        date, time, status: log?.status || 'pending', by: log?.by, at: log?.at,
      });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}

/**
 * Adherence over the `days` days ending at `today` (inclusive).
 * Doses later today that are still in the future are not counted against anyone.
 */
export function adherence(circle, today, nowMin, days = 7) {
  const perDay = [];
  const perMed = new Map();
  let due = 0; let taken = 0;
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const doses = dosesForDate(circle, date).filter((d) => localMinutes(date, d.time) <= nowMin);
    const t = doses.filter((d) => d.status === 'taken').length;
    due += doses.length; taken += t;
    for (const d of doses) {
      const m = perMed.get(d.medId) || { medId: d.medId, name: d.name, due: 0, taken: 0 };
      m.due += 1; if (d.status === 'taken') m.taken += 1;
      perMed.set(d.medId, m);
    }
    perDay.push({ date, due: doses.length, taken: t, doses });
  }
  // Streak = consecutive fully-completed days ending yesterday-or-today.
  let streak = 0;
  for (let i = perDay.length - 1; i >= 0; i--) {
    const d = perDay[i];
    if (d.due === 0) { if (i === perDay.length - 1) continue; break; }
    if (d.taken === d.due) streak += 1;
    else if (i === perDay.length - 1) continue; // today still in progress
    else break;
  }
  return {
    days: perDay, due, taken,
    percent: due ? Math.round((taken / due) * 100) : null,
    perMed: [...perMed.values()], streak,
  };
}
