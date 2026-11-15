import { api } from '../api.js';
import { h, prettyDate, prettyTime } from '../dom.js';
import { toast } from '../ui.js';

const SYMBOL = { taken: ['✓', 'Taken'], skipped: ['–', 'Skipped'], pending: ['✕', 'Missed'] };

function grid(c) {
  const meds = c.report.perMed;
  if (!meds.length) return h('p', {}, 'The weekly grid appears once there are doses to track.');
  const days = c.report.days;
  return h('div', { class: 'grid-wrap', role: 'region', 'aria-label': 'Seven day adherence grid', tabindex: '0' }, h('table', { class: 'adh' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Medicine'), days.map((d) => h('th', { scope: 'col' }, prettyDate(d.date, { weekday: 'short' }))))),
    h('tbody', {}, meds.map((m) => h('tr', {}, h('th', { scope: 'row' }, m.name), days.map((d) => {
      const ds = d.doses.filter((x) => x.name === m.name);
      return h('td', {}, ds.length ? ds.map((x) => { const [s, label] = SYMBOL[x.status] ?? SYMBOL.pending; return h('span', { class: `cell cell-${x.status}`, title: `${prettyTime(x.time)} · ${label}`, role: 'img', 'aria-label': `${prettyTime(x.time)} ${label}` }, s); }) : h('span', { class: 'cell cell-none', 'aria-label': 'Not scheduled' }, '·'));
    }))))));
}

export function renderInsights(root, c) {
  const r = c.report;
  const story = h('p', { class: 'story', 'aria-live': 'polite' }, 'Writing this week’s story…');
  const badge = h('span', { class: 'chip chip-muted' });
  api('/ai/story').then((s) => { story.textContent = s.text; badge.textContent = s.source === 'gemini' ? 'Written by Gemini' : 'Quick summary'; }).catch((e) => { story.textContent = 'Could not load the summary.'; toast(e.message, 'error'); });

  const brief = h('section', { class: 'card brief', id: 'brief' },
    h('h2', {}, 'Doctor-visit brief'),
    h('p', {}, `Last 7 days for ${c.elderName}: `, h('strong', {}, r.percent === null ? 'no doses scheduled' : `${r.taken} of ${r.due} doses taken (${r.percent}%)`), '.'),
    h('ul', {}, r.perMed.map((m) => h('li', {}, `${m.name}: ${m.taken}/${m.due} taken`))),
    c.appointments[0] ? h('p', {}, `Next visit: ${c.appointments[0].title} on ${prettyDate(c.appointments[0].datetime.slice(0, 10))}.`) : null,
    h('p', { class: 'fineprint' }, 'Self-reported by the elder and care circle via Thunai. Not a clinical record.'),
    h('button', { class: 'btn btn-soft no-print', onclick: () => window.print() }, '🖨 Print for the doctor'));

  root.replaceChildren(
    h('div', { class: 'page-head' }, h('h1', {}, 'This week')),
    h('section', { class: 'stats' },
      h('div', { class: 'card stat' }, h('span', { class: 'stat-num' }, r.percent === null ? '—' : `${r.percent}%`), h('span', {}, 'doses taken')),
      h('div', { class: 'card stat' }, h('span', { class: 'stat-num' }, `${r.streak}`), h('span', {}, r.streak === 1 ? 'perfect day in a row' : 'perfect days in a row')),
      h('div', { class: 'card stat' }, h('span', { class: 'stat-num' }, `${r.taken}/${r.due}`), h('span', {}, 'this week'))),
    h('section', { class: 'card' }, h('div', { class: 'page-head tight' }, h('h2', {}, 'The week in words'), badge), story),
    h('section', { class: 'card' }, h('h2', {}, 'Day by day'), grid(c), h('p', { class: 'fineprint' }, '✓ taken · – skipped · ✕ missed · · not scheduled')),
    brief);
}
