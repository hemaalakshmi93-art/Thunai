// Accessibility preferences + voice. Everything degrades gracefully if the browser lacks support.
const root = document.documentElement;
const SIZES = [100, 118, 136, 160];

const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function initPrefs() {
  applySize(Number(read('thunai.size', 1)));
  root.dataset.contrast = read('thunai.contrast', 'normal');
}
function applySize(i) {
  const idx = Math.min(SIZES.length - 1, Math.max(0, i));
  root.style.fontSize = `${SIZES[idx]}%`;
  write('thunai.size', idx);
  return idx;
}
export const bumpSize = (d) => applySize(Number(read('thunai.size', 1)) + d);
export function toggleContrast() {
  root.dataset.contrast = root.dataset.contrast === 'high' ? 'normal' : 'high';
  write('thunai.contrast', root.dataset.contrast);
  return root.dataset.contrast === 'high';
}

// ---- polite announcements for screen readers ----
export function announce(msg) {
  const live = document.getElementById('live');
  live.textContent = '';
  setTimeout(() => { live.textContent = msg; }, 30);
}

// ---- speech ----
export const canSpeak = 'speechSynthesis' in window;
export function speak(text) {
  if (!canSpeak) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-IN'; u.rate = 0.9;
  speechSynthesis.speak(u);
}

const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = Boolean(Rec);
export function listen({ onResult, onEnd }) {
  const rec = new Rec();
  rec.lang = 'en-IN'; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = (e) => onResult(e.results[0][0].transcript);
  rec.onend = onEnd; rec.onerror = onEnd;
  rec.start();
  return rec;
}
