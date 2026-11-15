import { api } from '../api.js';
import { canSpeak, speak } from '../a11y.js';
import { dayArc } from '../arc.js';
import { h, prettyDateTime, prettyTime, relativeDay, svg, toMin } from '../dom.js';
import { emptyState, field, toast } from '../ui.js';

const PARTS = [['Morning', 'Sunrise hours', 0, 12], ['Afternoon', 'Midday', 12, 17], ['Evening', 'Golden hour', 17, 21], ['Night', 'Winding down', 21, 24]];

function greeting(nowMin) {
  const hr = Math.floor(nowMin / 60);
  return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
}

function ring(taken, total) {
  const c = 2 * Math.PI * 42; const f = total ? taken / total : 0;
  return svg(`<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" class="ring-bg"/>
    <circle cx="50" cy="50" r="42" class="ring-fg" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/>
    <text x="50" y="57" text-anchor="middle" class="ring-text">${taken}/${total}</text></svg>`);
}

function doseCard(c, d, isNext, ctx) {
  const overdue = d.status === 'pending' && toMin(d.time) < c.nowMinutes - 30;
  const canAct = ctx.can('doses');
  const set = async (status) => {
    try { ctx.update(await api('/doses', { method: 'POST', body: { medId: d.medId, date: d.date, time: d.time, status } })); if (status === 'taken') toast(`${d.name} marked as taken. Well done!`); }
    catch (e) { toast(e.message, 'error'); }
  };
  const chip = d.status === 'taken' ? h('span', { class: 'chip chip-ok' }, '✓ Taken')
    : d.status === 'skipped' ? h('span', { class: 'chip chip-muted' }, 'Skipped')
      : overdue ? h('span', { class: 'chip chip-alert' }, '! Overdue') : isNext ? h('span', { class: 'chip chip-next' }, 'Up next') : null;
  return h('li', { class: `dose dose-${d.status}${overdue ? ' dose-overdue' : ''}${isNext ? ' dose-next' : ''}` },
    h('div', { class: 'dose-time' }, prettyTime(d.time)),
    h('div', { class: 'dose-main' },
      h('div', { class: 'dose-name' }, d.name, d.dose ? h('span', { class: 'dose-qty' }, ` · ${d.dose}`) : null),
      d.instructions ? h('div', { class: 'dose-note' }, d.instructions) : null,
      d.status !== 'pending' && d.by ? h('div', { class: 'dose-note' }, `Marked by ${d.by}`) : null,
      chip),
    canAct ? h('div', { class: 'dose-actions' },
      d.status === 'pending'
        ? [h('button', { class: 'btn btn-go', onclick: () => set('taken'), 'aria-label': `${c.role === 'elder' ? 'I took' : 'Mark as taken:'} ${d.name} at ${prettyTime(d.time)}` }, c.role === 'elder' ? 'I took it' : 'Mark taken'),
          h('button', { class: 'btn btn-ghost btn-sm', onclick: () => set('skipped'), 'aria-label': `Skip ${d.name} at ${prettyTime(d.time)}` }, 'Skip')]
        : h('button', { class: 'btn btn-ghost btn-sm', onclick: () => set('pending'), 'aria-label': `Undo ${d.name} at ${prettyTime(d.time)}` }, 'Undo'))
      : null);
}

export function renderToday(root, c, ctx) {
  const taken = c.doses.filter((d) => d.status === 'taken').length;
  const pending = c.doses.filter((d) => d.status === 'pending');
  const next = pending.find((d) => toMin(d.time) >= c.nowMinutes - 30);
  const appt = c.appointments[0];
  const lastNote = c.notes[0];

  const spoken = () => {
    const parts = [`${greeting(c.nowMinutes)}, ${c.elderName}.`];
    parts.push(pending.length ? `You have ${pending.length} medicine${pending.length > 1 ? 's' : ''} left today.` : c.doses.length ? 'You have taken everything for today. Well done!' : 'No medicines are scheduled today.');
    if (next) parts.push(`Next is ${next.name} at ${prettyTime(next.time)}.`);
    if (appt) parts.push(`Your next visit is ${appt.title}, ${relativeDay(c.today, appt.datetime.slice(0, 10))}, at ${prettyTime(appt.datetime.slice(11))}.`);
    if (lastNote) parts.push(`${lastNote.by} says: ${lastNote.text}`);
    return parts.join(' ');
  };

  const hero = h('section', { class: 'card hero', 'aria-labelledby': 'hello' },
    h('div', { class: 'hero-text' },
      h('p', { class: 'eyebrow' }, 'வணக்கம் · Vanakkam'),
      h('h1', { id: 'hello' }, `${greeting(c.nowMinutes)}, ${c.elderName}`),
      h('p', { class: 'lead' }, c.doses.length ? (pending.length ? `${pending.length} to go today.` : 'All done for today. 🌼') : 'Nothing scheduled today.'),
      canSpeak ? h('button', { class: 'btn btn-soft', onclick: () => speak(spoken()) }, '🔊 Read my day aloud') : null),
    c.doses.length ? h('div', { class: 'hero-ring' }, ring(taken, c.doses.length), h('span', { class: 'sr-only' }, `${taken} of ${c.doses.length} doses taken today`)) : null,
    dayArc(c.doses, c.nowMinutes));

  const note = lastNote ? h('aside', { class: 'warm-note', 'aria-label': 'Note from the family' },
    h('span', { class: 'warm-heart', 'aria-hidden': 'true' }, '💛'),
    h('div', {}, h('p', { class: 'warm-text' }, `“${lastNote.text}”`), h('p', { class: 'warm-by' }, `— ${lastNote.by}`))) : null;

  const timeline = c.doses.length
    ? PARTS.map(([label, sub, from, to]) => {
      const ds = c.doses.filter((d) => { const hr = toMin(d.time) / 60; return hr >= from && hr < to; });
      if (!ds.length) return null;
      return h('section', { class: 'part', 'aria-labelledby': `part-${label}` },
        h('h2', { id: `part-${label}`, class: 'part-title' }, label, h('small', {}, sub)),
        h('ul', { class: 'doses' }, ds.map((d) => doseCard(c, d, d === next, ctx))));
    })
    : emptyState('🌿', 'No medicines scheduled for today', ctx.can('meds') ? 'Add one from the Medicines tab — you can even just say it out loud.' : 'The care team has not added any yet.');

  const apptCard = appt ? h('section', { class: 'card appt-peek', 'aria-labelledby': 'nextvisit' },
    h('p', { class: 'eyebrow' }, 'Next doctor visit'),
    h('h2', { id: 'nextvisit' }, appt.title),
    h('p', { class: 'lead' }, `${relativeDay(c.today, appt.datetime.slice(0, 10))} · ${prettyDateTime(appt.datetime)}`),
    appt.doctor || appt.location ? h('p', {}, [appt.doctor, appt.location].filter(Boolean).join(' · ')) : null,
    h('button', { class: 'btn btn-ghost', onclick: () => ctx.go('visits') }, 'See all visits')) : null;

  const noteForm = h('form', { class: 'card note-form', onsubmit: async (e) => {
    e.preventDefault();
    const input = e.currentTarget.elements.text;
    if (!input.value.trim()) return;
    try { ctx.update(await api('/notes', { method: 'POST', body: { text: input.value } })); toast('Your warm note was sent.'); }
    catch (err) { toast(err.message, 'error'); }
  } },
  field(c.role === 'elder' ? 'Leave a note for your family' : `Send ${c.elderName} a warm note`, h('input', { name: 'text', maxlength: 200, placeholder: c.role === 'elder' ? 'I am feeling good today' : 'Thinking of you, Paati! Call you at 7.', autocomplete: 'off' })),
  h('button', { class: 'btn btn-primary', type: 'submit' }, 'Send note'));

  root.replaceChildren(hero, note, h('div', { class: 'today-grid' }, h('div', { class: 'timeline' }, timeline), h('div', { class: 'side' }, apptCard, noteForm)));
}
