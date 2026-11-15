import { api, hasToken, setToken } from './api.js';
import { announce, bumpSize, initPrefs, toggleContrast } from './a11y.js';
import { clear, h } from './dom.js';
import { toast } from './ui.js';
import { renderAuth } from './views/auth.js';
import { renderCircle } from './views/circle.js';
import { renderInsights } from './views/insights.js';
import { renderMeds } from './views/meds.js';
import { renderToday } from './views/today.js';
import { renderVisits } from './views/visits.js';

initPrefs();
const main = document.getElementById('app');
const header = document.getElementById('top');
const nav = document.getElementById('nav');

const TABS = [['today', 'Today', '☀️'], ['meds', 'Medicines', '💊'], ['visits', 'Visits', '🩺'], ['circle', 'Circle', '👪'], ['insights', 'Week', '📈']];
const VIEWS = { today: renderToday, meds: renderMeds, visits: renderVisits, circle: renderCircle, insights: renderInsights };
const PERMS = { elder: ['meds', 'doses', 'appointments', 'members', 'notes', 'passcodes', 'reminders'], caretaker: ['meds', 'doses', 'appointments', 'members', 'notes', 'reminders'], family: ['appointments', 'notes'] };

let circle = null; let tab = 'today'; let lastJson = ''; let pollTimer;

const ctx = {
  can: (p) => PERMS[circle.role].includes(p),
  go: (t) => { location.hash = t; },
  update(next) { circle = next; lastJson = JSON.stringify(next); draw(); },
  async refresh() { try { ctx.update(await api('/circle')); } catch (e) { toast(e.message, 'error'); } },
};

function tabFromHash() {
  const t = location.hash.slice(1);
  return VIEWS[t] ? t : 'today';
}

function drawChrome() {
  header.hidden = false; nav.hidden = false;
  clear(header).append(
    h('a', { class: 'brand', href: '#today', 'aria-label': 'Thunai home' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '❀'), 'Thunai'),
    h('div', { class: 'top-info' }, h('span', { class: 'top-for' }, `For ${circle.elderName}`), h('span', { class: 'chip chip-role' }, circle.role)),
    h('div', { class: 'tools', role: 'group', 'aria-label': 'Display settings' },
      h('button', { class: 'tool', 'aria-label': 'Smaller text', onclick: () => bumpSize(-1) }, 'A−'),
      h('button', { class: 'tool tool-big', 'aria-label': 'Larger text', onclick: () => bumpSize(1) }, 'A+'),
      h('button', { class: 'tool', 'aria-label': 'Toggle high contrast', onclick: (e) => { const on = toggleContrast(); e.currentTarget.setAttribute('aria-pressed', String(on)); } }, '◐'),
      h('button', { class: 'tool', onclick: signOut }, 'Sign out')));
  clear(nav).append(...TABS.map(([k, label, icon]) => h('a', { href: `#${k}`, class: `nav-link${tab === k ? ' on' : ''}`, 'aria-current': tab === k ? 'page' : false },
    h('span', { 'aria-hidden': 'true' }, icon), h('span', {}, label))));
}

function draw() {
  if (!circle) return;
  tab = tabFromHash();
  drawChrome();
  VIEWS[tab](main, circle, ctx);
}

function signOut() {
  setToken(null); circle = null; clearInterval(pollTimer);
  header.hidden = true; nav.hidden = true;
  renderAuth(main, start);
  announce('Signed out');
}

async function start() {
  try {
    circle = await api('/circle'); lastJson = JSON.stringify(circle);
    draw();
    clearInterval(pollTimer);
    // Near-real-time: family sees a dose being ticked off within ~30s. Skip while the user is typing.
    pollTimer = setInterval(async () => {
      if (document.hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.querySelector('dialog[open]')) return;
      try { const next = await api('/circle'); const j = JSON.stringify(next); if (j !== lastJson) { lastJson = j; circle = next; draw(); } } catch { /* offline: try next tick */ }
    }, 30000);
  } catch { signOut(); }
}

window.addEventListener('hashchange', () => { if (circle) { draw(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); } });
window.addEventListener('thunai:signedout', signOut);

if (hasToken()) start(); else signOut();
