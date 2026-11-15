import { api, setToken } from '../api.js';
import { h } from '../dom.js';
import { field, toast } from '../ui.js';

const TZ = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney'];

function copyBtn(text, label) {
  return h('button', { class: 'btn btn-soft btn-sm', type: 'button', onclick: async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers that block the Clipboard API
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) { toast('Copy is not available. Please note it down.', 'error'); return; }
    }
    btn.textContent = 'Copied ✓';
  }, 'aria-label': `Copy ${label}` }, 'Copy');
}

function passcodeSheet(created, onDone) {
  const roles = [['elder', 'Elder', 'Full control. Keep it with you.'], ['caretaker', 'Caretaker', 'Manages medicines and visits.'], ['family', 'Family', 'Views, adds visits, sends warm notes.']];
  return h('section', { class: 'card sheet', 'aria-labelledby': 'sheet-h' },
    h('p', { class: 'eyebrow' }, 'Your care circle is ready 🌼'),
    h('h1', { id: 'sheet-h' }, 'Save these now'),
    h('p', { class: 'lead' }, 'We store passcodes scrambled, so they are shown only this once. Take a photo or print this page.'),
    h('div', { class: 'sheet-id' }, h('span', {}, 'Circle ID'), h('strong', { class: 'mono' }, created.circleId), copyBtn(created.circleId, 'circle ID')),
    h('ul', { class: 'cards' }, roles.map(([r, name, sub]) => h('li', { class: 'card pass' },
      h('div', {}, h('h2', {}, name), h('p', {}, sub)), h('strong', { class: 'passcode-big' }, created.passcodes[r]), copyBtn(created.passcodes[r], `${name} passcode`)))),
    h('div', { class: 'row-actions wrap' }, h('button', { class: 'btn btn-soft no-print', onclick: () => window.print() }, '🖨 Print'), h('button', { class: 'btn btn-primary no-print', onclick: onDone }, 'Continue to Thunai →')));
}

export function renderAuth(root, onSignedIn) {
  let mode = 'join';
  const body = h('div', { class: 'auth-body' });

  const join = () => {
    const f = { id: h('input', { name: 'circleId', required: true, placeholder: 'THN-XXXXXX', autocapitalize: 'characters', autocomplete: 'off', maxlength: 10 }),
      pass: h('input', { name: 'passcode', required: true, placeholder: 'jasmine-4821', autocomplete: 'off', autocapitalize: 'none', maxlength: 40 }),
      name: h('input', { name: 'name', required: true, placeholder: 'e.g. Priya (daughter)', autocomplete: 'name', maxlength: 60 }) };
    return h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      try { const r = await api('/auth', { method: 'POST', body: { circleId: f.id.value, passcode: f.pass.value, name: f.name.value } }); setToken(r.token); onSignedIn(); }
      catch (err) { toast(err.message, 'error'); }
    } }, field('Circle ID', f.id), field('Passcode', f.pass, 'Your role is decided by the passcode you were given.'), field('Your name', f.name, 'So the circle knows who marked what.'), h('button', { class: 'btn btn-primary btn-wide', type: 'submit' }, 'Enter the circle'));
  };

  const create = () => {
    const f = { elder: h('input', { required: true, maxlength: 60, placeholder: 'e.g. Kamala Paati', autocomplete: 'off' }),
      email: h('input', { type: 'email', maxlength: 120, placeholder: 'Elder’s email for reminders (optional)', autocomplete: 'off' }),
      me: h('input', { maxlength: 60, placeholder: 'Your name (if you are a carer or family)', autocomplete: 'name' }),
      tz: h('select', {}, TZ.map((z) => h('option', { value: z }, z.replace('_', ' ')))) };
    return h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      try {
        const r = await api('/circles', { method: 'POST', body: { elderName: f.elder.value, elderEmail: f.email.value, creatorName: f.me.value || undefined, timezone: f.tz.value } });
        setToken(r.token);
        root.replaceChildren(passcodeSheet(r, onSignedIn));
        window.scrollTo(0, 0);
      } catch (err) { toast(err.message, 'error'); }
    } }, field('Who are we caring for?', f.elder), field('Their email', f.email), field('Your name', f.me), field('Time zone', f.tz), h('button', { class: 'btn btn-primary btn-wide', type: 'submit' }, 'Create the care circle'));
  };

  const tabs = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Join or create' });
  const show = (m) => {
    mode = m;
    tabs.replaceChildren(...[['join', 'I have a passcode'], ['create', 'Start a new circle']].map(([k, label]) => h('button', { role: 'tab', 'aria-selected': String(mode === k), class: `seg-btn${mode === k ? ' on' : ''}`, onclick: () => show(k) }, label)));
    body.replaceChildren(mode === 'join' ? join() : create());
  };
  show('join');

  root.replaceChildren(h('div', { class: 'auth' },
    h('section', { class: 'auth-hero' },
      h('p', { class: 'eyebrow' }, 'துணை · Thunai'),
      h('h1', {}, 'A companion for every dose, and every visit.'),
      h('p', { class: 'lead' }, 'Medicines, doctor visits and gentle email nudges, shared safely between an elder, their carers and their family — with the elder always at the centre.'),
      h('ul', { class: 'perks' }, ['Big, clear screens and read-aloud', 'Say a medicine out loud — Gemini fills the form', 'Missed a dose? The whole circle is told', 'Private passcodes, no passwords to forget'].map((t) => h('li', {}, t)))),
    h('section', { class: 'card auth-card', 'aria-label': 'Sign in' }, tabs, body)));
}
