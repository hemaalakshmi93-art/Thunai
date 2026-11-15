import { api } from '../api.js';
import { h, prettyDate, prettyTime } from '../dom.js';
import { confirmDialog, field, openDialog, toast } from '../ui.js';

const ROLE_TEXT = { elder: 'Elder · full control', caretaker: 'Caretaker · manages medicines & visits', family: 'Family · views, adds visits, sends notes' };

function memberDialog(ctx) {
  const name = h('input', { required: true, maxlength: 60, autocomplete: 'off' });
  const email = h('input', { type: 'email', maxlength: 120, placeholder: 'name@example.com', autocomplete: 'off' });
  const relation = h('input', { maxlength: 40, placeholder: 'Daughter, neighbour, nurse…' });
  const role = h('select', {}, h('option', { value: 'family' }, 'Family'), h('option', { value: 'caretaker' }, 'Caretaker'));
  openDialog({
    title: 'Add someone to the circle', wide: true,
    body: h('div', { class: 'form' }, field('Name', name), field('Email (for reminders)', email, 'They get missed-dose and appointment emails.'), field('Relationship', relation), field('Their role', role)),
    actions: [{ label: 'Cancel' }, { label: 'Add to circle', kind: 'btn-primary', onClick: async () => {
      if (!name.value.trim()) { toast('Please enter a name.', 'error'); return false; }
      try { ctx.update(await api('/members', { method: 'POST', body: { name: name.value, email: email.value, role: role.value, relation: relation.value } })); toast(`${name.value} added.`); } catch (e) { toast(e.message, 'error'); return false; }
      return true;
    } }],
  });
}

function rotate(ctx, role) {
  return async () => {
    if (!(await confirmDialog(`Create a new ${role} passcode? The old one stops working right away.`, 'Yes, change it'))) return;
    try {
      const { passcode } = await api('/passcodes/rotate', { method: 'POST', body: { role } });
      openDialog({ title: `New ${role} passcode`, body: h('div', {}, h('p', { class: 'lead' }, 'Share this with the right person. It is shown only once.'), h('p', { class: 'passcode-big' }, passcode)), actions: [{ label: 'I have noted it', kind: 'btn-primary' }] });
    } catch (e) { toast(e.message, 'error'); }
  };
}

export function renderCircle(root, c, ctx) {
  const canManage = ctx.can('members');
  const members = h('ul', { class: 'cards' }, c.members.map((m) => h('li', { class: 'card member' },
    h('div', { class: 'avatar', 'aria-hidden': 'true' }, m.name[0].toUpperCase()),
    h('div', { class: 'member-main' }, h('h2', {}, m.name), h('p', {}, ROLE_TEXT[m.role]), h('p', { class: 'dose-note' }, [m.relation, m.email || 'No email — won’t get reminders'].filter(Boolean).join(' · '))),
    canManage && m.role !== 'elder' ? h('button', { class: 'btn btn-ghost btn-danger-text', 'aria-label': `Remove ${m.name}`, onclick: async () => {
      if (!(await confirmDialog(`Remove ${m.name} from the circle?`))) return;
      try { ctx.update(await api(`/members/${m.id}`, { method: 'DELETE' })); } catch (e) { toast(e.message, 'error'); }
    } }, 'Remove') : null)));

  const passcodes = c.role === 'elder' ? h('section', { class: 'card' },
    h('h2', {}, 'Passcodes'), h('p', {}, `Circle ID: `, h('strong', { class: 'mono' }, c.id), '. Passcodes are stored scrambled — even we cannot read them. Change one if a carer leaves.'),
    h('div', { class: 'row-actions wrap' }, ['caretaker', 'family', 'elder'].map((r) => h('button', { class: 'btn btn-ghost', onclick: rotate(ctx, r) }, `New ${r} passcode`)))) : null;

  const outbox = ctx.can('reminders') ? h('section', { class: 'card' },
    h('div', { class: 'page-head tight' }, h('h2', {}, 'Reminder outbox'),
      h('button', { class: 'btn btn-soft', onclick: async (e) => {
        e.currentTarget.disabled = true;
        try { const r = await api('/reminders/test', { method: 'POST' }); toast(r.simulated ? 'Test reminder simulated (email is not configured yet).' : `Test email sent to ${r.sent} people.`); ctx.refresh(); }
        catch (err) { toast(err.message, 'error'); } finally { e.currentTarget.disabled = false; }
      } }, 'Send test reminder')),
    c.outbox.length ? h('ul', { class: 'log' }, c.outbox.map((o) => h('li', {}, h('span', { class: `chip chip-${o.status === 'sent' ? 'ok' : o.status === 'failed' ? 'alert' : 'muted'}` }, o.status), ' ', h('strong', {}, o.subject), h('span', { class: 'dose-note' }, ` → ${o.toName}, ${new Date(o.at).toLocaleString('en-IN')}`))))
      : h('p', { class: 'dose-note' }, 'Nothing sent yet. Reminders go out ~10 minutes before a dose, to everyone if it is missed, and before appointments.')) : null;

  const activity = h('section', { class: 'card' }, h('h2', {}, 'Who did what'),
    c.activity.length ? h('ul', { class: 'log' }, c.activity.map((a) => h('li', {}, h('strong', {}, a.by), ` ${a.text} `, h('span', { class: 'dose-note' }, `· ${new Date(a.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`)))) : h('p', {}, 'Nothing yet.'),
    h('p', { class: 'fineprint' }, `${c.elderName} can always see every change made to their care.`));

  root.replaceChildren(
    h('div', { class: 'page-head' }, h('h1', {}, 'Care circle'), canManage ? h('button', { class: 'btn btn-primary', onclick: () => memberDialog(ctx) }, '+ Add person') : null),
    members, passcodes, outbox, activity);
}
