// Time helpers. The whole app works in the *circle's own time zone* (an elder in
// Coimbatore thinks in IST, whatever the server clock says). We map every instant
// into "local minutes" so comparisons are simple integer maths.

const fmtCache = new Map();
function formatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(
      tz,
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', weekday: 'short',
      }),
    );
  }
  return fmtCache.get(tz);
}

const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTimezone(tz) {
  try { formatter(tz); return true; } catch { return false; }
}

/** Break an instant into the wall-clock parts of a time zone. */
export function zonedParts(tz, date = new Date()) {
  const p = Object.fromEntries(formatter(tz).formatToParts(date).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour), minute: Number(p.minute),
    dow: DOW[p.weekday],
  };
}

/** "YYYY-MM-DD" + "HH:MM" -> minutes on a continuous local-time axis. */
export function localMinutes(dateStr, timeStr = '00:00') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) / 60000;
}

export function nowLocalMinutes(tz, date = new Date()) {
  const p = zonedParts(tz, date);
  return localMinutes(p.date, `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`);
}

/** Shift a YYYY-MM-DD date by n days (pure calendar maths, no zone issues). */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function dowOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function prettyTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
}

export function prettyDateTime(local) {
  const [d, t] = local.split('T');
  const dt = new Date(`${d}T00:00:00Z`);
  const day = dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day}, ${prettyTime(t)}`;
}
