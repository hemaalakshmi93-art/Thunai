import { announce } from './a11y.js';
import { h } from './dom.js';

export function toast(message, kind = 'ok') {
  announce(message);
  const t = h('div', { class: `toast toast-${kind}`, role: 'status' }, message);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 4500);
}

/** Accessible modal built on <dialog>: focus trap, Esc to close and focus restore come for free. */
export function openDialog({ title, body, actions = [], wide = false }) {
  const previous = document.activeElement;
  const dlg = h('dialog', { class: `dialog${wide ? ' wide' : ''}`, 'aria-labelledby': 'dlg-title' },
    h('h2', { id: 'dlg-title' }, title),
    body,
    h('div', { class: 'dialog-actions' }, actions.map((a) => h('button', {
      type: 'button', class: `btn ${a.kind || 'btn-ghost'}`,
      onclick: async (e) => {
        e.currentTarget.disabled = true;
        try { const keep = await a.onClick?.(dlg); if (keep !== false) dlg.close(); } finally { e.currentTarget.disabled = false; }
      },
    }, a.label))),
  );
  dlg.addEventListener('close', () => { dlg.remove(); previous?.focus?.(); });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export function confirmDialog(message, confirmLabel = 'Yes, remove') {
  return new Promise((resolve) => {
    let done = false;
    const dlg = openDialog({
      title: 'Are you sure?', body: h('p', { class: 'lead' }, message),
      actions: [
        { label: 'No, keep it', onClick: () => { done = true; resolve(false); } },
        { label: confirmLabel, kind: 'btn-danger', onClick: () => { done = true; resolve(true); } },
      ],
    });
    dlg.addEventListener('close', () => { if (!done) resolve(false); });
  });
}

export const field = (label, input, hint) => h('label', { class: 'field' },
  h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);

export const emptyState = (icon, title, sub) => h('div', { class: 'empty' },
  h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, icon), h('h3', {}, title), sub ? h('p', {}, sub) : null);
