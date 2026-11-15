import { api } from '../api.js';
import { canListen, listen } from '../a11y.js';
import { DAY_NAMES, h, prettyTime } from '../dom.js';
import { confirmDialog, emptyState, field, openDialog, toast } from '../ui.js';

const SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function daysLabel(days) {
  if (days.length === 7) return 'Every day';
  return days.map((d) => DAY_NAMES[d].slice(0, 3)).join(', ');
}

/** Add/edit form. `med` may be a saved medicine or a Gemini/rule-based proposal (no id). */
export function medDialog(ctx, med = null, banner = null) {
  const times = [...(med?.times || ['08:00'])];
  const days = new Set(med?.days || [0, 1, 2, 3, 4, 5, 6]);
  const name = h('input', { name: 'name', required: true, maxlength: 80, value: med?.name || '', autocomplete: 'off' });
  const dose = h('input', { name: 'dose', maxlength: 60, value: med?.dose || '', placeholder: 'e.g. 500 mg' });
  const instr = h('input', { name: 'instructions', maxlength: 160, value: med?.instructions || '', placeholder: 'e.g. After breakfast' });
  const timeList = h('div', { class: 'time-list' });
  const renderTimes = () => {
    timeList.replaceChildren(...times.map((t, i) => h('div', { class: 'time-row' },
      h('input', { type: 'time', value: t, required: true, 'aria-label': `Dose time ${i + 1}`, onchange: (e) => { times[i] = e.target.value; } }),
      times.length > 1 ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': `Remove time ${prettyTime(t)}`, onclick: () => { times.splice(i, 1); renderTimes(); } }, 'Remove') : null)));
  };
  renderTimes();
  const dayRow = h('div', { class: 'day-row', role: 'group', 'aria-label': 'Days of the week' }, DAY_NAMES.map((n, i) => h('label', { class: 'day-pick' },
    h('input', { type: 'checkbox', checked: days.has(i), onchange: (e) => (e.target.checked ? days.add(i) : days.delete(i)) }),
    h('span', { 'aria-hidden': 'true' }, SHORT[i]), h('span', { class: 'sr-only' }, n))));

  const body = h('div', { class: 'form' },
    banner ? h('p', { class: 'callout' }, banner) : null,
    field('Medicine name', name), field('Dose', dose), field('Instructions', instr),
    h('fieldset', { class: 'field' }, h('legend', { class: 'field-label' }, 'What time(s) each day?'), timeList,
      h('button', { type: 'button', class: 'btn btn-soft btn-sm', onclick: () => { times.push('20:00'); renderTimes(); } }, '+ Add another time')),
    h('fieldset', { class: 'field' }, h('legend', { class: 'field-label' }, 'Which days?'), dayRow));

  openDialog({
    title: med?.id ? `Edit ${med.name}` : 'New medicine', body, wide: true,
    actions: [
      { label: 'Cancel' },
      { label: 'Save medicine', kind: 'btn-primary', onClick: async () => {
        if (!name.value.trim() || !days.size) { toast('Please add a name and at least one day.', 'error'); return false; }
        const payload = { name: name.value, dose: dose.value, instructions: instr.value, times, days: [...days] };
        try {
          ctx.update(await api(med?.id ? `/meds/${med.id}` : '/meds', { method: med?.id ? 'PUT' : 'POST', body: payload }));
          toast('Medicine saved.');
        } catch (e) { toast(e.message, 'error'); return false; }
        return true;
      } },
    ],
  });
}

function smartAdd(ctx) {
  const input = h('input', { id: 'smart', maxlength: 300, placeholder: 'Say or type: “Metformin 500 mg twice a day after food”', autocomplete: 'off' });
  const go = async (btn) => {
    if (!input.value.trim()) return;
    btn.disabled = true;
    try {
      const p = await api('/ai/parse-med', { method: 'POST', body: { text: input.value } });
      medDialog(ctx, p, `Understood by ${p.source === 'gemini' ? 'Gemini' : 'simple rules'}. Please double-check the name, dose and times — you are the final judge.`);
      input.value = '';
    } catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; }
  };
  const goBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, '✨ Understand');
  let mic = null;
  if (canListen) {
    mic = h('button', { type: 'button', class: 'btn btn-soft', 'aria-label': 'Speak the medicine details', onclick: (e) => {
      const b = e.currentTarget; b.classList.add('listening'); b.textContent = '● Listening…';
      listen({ onResult: (t) => { input.value = t; }, onEnd: () => { b.classList.remove('listening'); b.textContent = '🎤 Speak'; } });
    } }, '🎤 Speak');
  }
  return h('form', { class: 'card smart', onsubmit: (e) => { e.preventDefault(); go(goBtn); } },
    h('label', { for: 'smart', class: 'field-label' }, 'Smart Add — describe it in your own words'),
    h('div', { class: 'smart-row' }, input, mic, goBtn));
}

export function renderMeds(root, c, ctx) {
  const editable = ctx.can('meds');
  const list = c.meds.length ? h('ul', { class: 'cards' }, c.meds.map((m) => h('li', { class: 'card med' },
    h('div', {},
      h('h2', {}, m.name, m.dose ? h('span', { class: 'dose-qty' }, ` · ${m.dose}`) : null),
      m.instructions ? h('p', {}, m.instructions) : null,
      h('p', { class: 'chips' }, m.times.map((t) => h('span', { class: 'chip chip-time' }, prettyTime(t))), h('span', { class: 'chip chip-muted' }, daysLabel(m.days)))),
    editable ? h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-ghost', onclick: () => medDialog(ctx, m), 'aria-label': `Edit ${m.name}` }, 'Edit'),
      h('button', { class: 'btn btn-ghost btn-danger-text', 'aria-label': `Remove ${m.name}`, onclick: async () => {
        if (!(await confirmDialog(`Remove ${m.name} from the schedule? Past records stay in the history.`))) return;
        try { ctx.update(await api(`/meds/${m.id}`, { method: 'DELETE' })); toast(`${m.name} removed.`); } catch (e) { toast(e.message, 'error'); }
      } }, 'Remove')) : null)))
    : emptyState('💊', 'No medicines yet', editable ? 'Use Smart Add above or the button below.' : 'A caretaker or the elder can add medicines.');

  root.replaceChildren(
    h('div', { class: 'page-head' }, h('h1', {}, 'Medicines'),
      editable ? h('button', { class: 'btn btn-primary', onclick: () => medDialog(ctx) }, '+ Add medicine') : null),
    editable ? smartAdd(ctx) : h('p', { class: 'callout' }, 'You can view the schedule. Only the elder or a caretaker can change it.'),
    list,
    h('p', { class: 'fineprint' }, 'Thunai is a reminder companion, not a medical device. Always follow your doctor’s and pharmacist’s instructions.'));
}
