// The "day arc": a sun travelling across the sky with today's doses as beads along it.
// Decorative (aria-hidden): the same information is in the list right below it.
import { svg } from './dom.js';

const START = 5 * 60; const END = 23 * 60; // 5 AM -> 11 PM
const CX = 200; const CY = 185; const R = 165;
const pos = (min) => {
  const f = Math.min(1, Math.max(0, (min - START) / (END - START)));
  return { x: CX - R * Math.cos(Math.PI * f), y: CY - R * Math.sin(Math.PI * f) };
};

export function dayArc(doses, nowMin) {
  const arcPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  const beads = doses.map((d) => {
    const [hh, mm] = d.time.split(':').map(Number);
    const p = pos(hh * 60 + mm);
    const overdue = d.status === 'pending' && hh * 60 + mm < nowMin - 30;
    const cls = d.status === 'taken' ? 'bead-taken' : d.status === 'skipped' ? 'bead-skipped' : overdue ? 'bead-overdue' : 'bead-pending';
    return `<circle class="${cls}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="11"/>`
      + (d.status === 'taken' ? `<path class="bead-tick" d="M ${(p.x - 5).toFixed(1)} ${p.y.toFixed(1)} l 3.5 4 l 6.5 -8"/>` : '');
  }).join('');
  const sun = pos(nowMin);
  const night = nowMin < START || nowMin > END;
  return svg(`<svg class="day-arc" viewBox="0 0 400 210" aria-hidden="true" focusable="false">
    <defs><linearGradient id="skyg" x1="0" x2="1"><stop offset="0" stop-color="#f6b25a"/><stop offset=".5" stop-color="#f4d58b"/><stop offset="1" stop-color="#8d7fb8"/></linearGradient></defs>
    <path d="${arcPath}" class="arc-track"/><path d="${arcPath}" class="arc-glow" stroke="url(#skyg)"/>
    ${beads}
    <g class="${night ? 'moon' : 'sun'}"><circle cx="${sun.x.toFixed(1)}" cy="${sun.y.toFixed(1)}" r="15"/>${night ? '' : `<circle class="sun-halo" cx="${sun.x.toFixed(1)}" cy="${sun.y.toFixed(1)}" r="24"/>`}</g>
    <text x="30" y="205" class="arc-label">5 AM</text><text x="200" y="14" class="arc-label mid">2 PM</text><text x="370" y="205" class="arc-label end">11 PM</text>
  </svg>`);
}
