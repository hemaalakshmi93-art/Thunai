import { api } from '../api.js';
import { h, prettyDateTime, relativeDay } from '../dom.js';
import { confirmDialog, emptyState, field, openDialog, toast } from '../ui.js';

function apptDialog(ctx, a = null) {
  const f = {
    title: h('input', { required: true, maxlength: 100, value: a?.title || '', placeholder: 'e.g. Diabetes check-up' }),
    doctor: h('input', { maxlength: 80, value: a?.doctor || '', placeholder: 'Dr. Meenakshi' }),
    when: h('input', { type: 'datetime-local', required: true, value: a?.datetime || '' }),
    where: h('input', { maxlength: 120, value: a?.location || '', placeholder: 'Hospital / clinic' }),
    notes: h('textarea', { maxlength: 300, rows: 3, placeholder: 'Bring reports, fasting needed…' }, a?.notes || ''),
  };
  openDialog({
    title: a ? 'Edit visit' : 'New doctor visit', wide: true,
    body: h('div', { class: 'form' }, field('What is it for?', f.title), field('Doctor', f.doctor), field('Date and time', f.when), field('Where', f.where), field('Notes', f.notes)),
    actions: [{ label: 'Cancel' }, { label: 'Save visit', kind: 'btn-primary', onClick: async () => {
      if (!f.title.value.trim() || !f.when.value) { toast('Please add what it is for and when.', 'error'); return false; }
      try {
        ctx.update(await api(a ? `/appointments/${a.id}` : '/appointments', { method: a ? 'PUT' : 'POST', body: { title: f.title.value, doctor: f.doctor.value, datetime: f.when.value, location: f.where.value, notes: f.notes.value } }));
        toast('Visit saved. Email reminders are scheduled.');
      } catch (e) { toast(e.message, 'error'); return false; }
      return true;
    } }],
  });
}

export function renderVisits(root, c, ctx) {
  const editable = ctx.can('appointments');
  const card = (a) => h('li', { class: 'card visit' },
    h('div', { class: 'visit-date' }, h('strong', {}, relativeDay(c.today, a.datetime.slice(0, 10))), h('span', {}, prettyDateTime(a.datetime))),
    h('div', { class: 'visit-main' }, h('h2', {}, a.title),
      a.doctor ? h('p', {}, `👩‍⚕️ ${a.doctor}`) : null, a.location ? h('p', {}, `📍 ${a.location}`) : null, a.notes ? h('p', { class: 'dose-note' }, a.notes) : null),
    editable ? h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-ghost', onclick: () => apptDialog(ctx, a), 'aria-label': `Edit ${a.title}` }, 'Edit'),
      h('button', { class: 'btn btn-ghost btn-danger-text', 'aria-label': `Cancel ${a.title}`, onclick: async () => {
        if (!(await confirmDialog(`Cancel “${a.title}”?`, 'Yes, cancel it'))) return;
        try { ctx.update(await api(`/appointments/${a.id}`, { method: 'DELETE' })); toast('Visit cancelled.'); } catch (e) { toast(e.message, 'error'); }
      } }, 'Cancel visit')) : null);

  root.replaceChildren(
    h('div', { class: 'page-head' }, h('h1', {}, 'Doctor visits'), editable ? h('button', { class: 'btn btn-primary', onclick: () => apptDialog(ctx) }, '+ Add visit') : null),
    c.appointments.length ? h('ul', { class: 'cards' }, c.appointments.map(card)) : emptyState('🩺', 'No upcoming visits', 'Add one and the whole circle gets an email 24 hours and 2 hours before.'),
    c.pastAppointments.length ? h('details', { class: 'past' }, h('summary', {}, `Past visits (${c.pastAppointments.length})`), h('ul', { class: 'cards' }, c.pastAppointments.map((a) => h('li', { class: 'card visit past-card' }, h('div', { class: 'visit-date' }, h('span', {}, prettyDateTime(a.datetime))), h('div', { class: 'visit-main' }, h('h2', {}, a.title), a.doctor ? h('p', {}, a.doctor) : null))))) : null);
}
