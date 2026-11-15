// replaceChildren() would print the word "null" for empty slots; skip them instead.
const nativeReplace = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function (...nodes) {
  return nativeReplace.apply(this, nodes.filter((n) => n != null && n !== false));
};
// Tiny DOM helper. Text is always inserted with createTextNode, never innerHTML,
// so user-supplied strings (medicine names, notes) can never become markup.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const svg = (markup) => {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
};

export const $ = (sel, root = document) => root.querySelector(sel);
export function clear(el) { el.replaceChildren(); return el; }

// ---- formatting ----
export function prettyTime(hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number);
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
}
const utc = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const prettyDate = (ymd, opts = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  utc(ymd).toLocaleDateString('en-IN', { ...opts, timeZone: 'UTC' });
export const prettyDateTime = (local) => `${prettyDate(local.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' })}, ${prettyTime(local.slice(11))}`;
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
export const toMin = (hhmm) => { const [a, b] = hhmm.split(':').map(Number); return a * 60 + b; };
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function relativeDay(today, ymd) {
  const n = daysBetween(today, ymd);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} ago`;
  return `In ${n} days`;
}
