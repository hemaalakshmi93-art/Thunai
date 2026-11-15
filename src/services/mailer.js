import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport;
const configured = () => Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);

function getTransport() {
  transport ||= nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  return transport;
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Warm, large-type HTML email. All dynamic text is escaped. */
export function renderEmail({ heading, lines, tone = 'info', cta }) {
  const accent = tone === 'alert' ? '#b4372a' : tone === 'soft' ? '#2f6f5e' : '#c9791b';
  const body = lines.map((l) => `<p style="margin:0 0 14px;font-size:18px;line-height:1.5">${escapeHtml(l)}</p>`).join('');
  const button = cta
    ? `<p><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-size:18px;font-weight:700">${escapeHtml(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html lang="en"><body style="margin:0;background:#fbf4e6;font-family:Atkinson Hyperlegible,Verdana,Arial,sans-serif;color:#2a2438">
<div style="max-width:560px;margin:0 auto;padding:24px"><div style="border-top:8px solid ${accent};background:#fff;border-radius:16px;padding:28px">
<p style="margin:0 0 6px;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:${accent}">Thunai · care circle</p>
<h1 style="margin:0 0 18px;font-size:26px;line-height:1.25">${escapeHtml(heading)}</h1>${body}${button}
<p style="margin:22px 0 0;font-size:13px;color:#6b6480">Thunai is a reminder companion, not medical advice. For emergencies call your local emergency number.</p>
</div></div></body></html>`;
}

/**
 * Sends one email. Without SMTP credentials it runs in *simulation mode* so the whole
 * flow (and the in-app Outbox) can be demonstrated without a mail account.
 * Always resolves with an outbox record; never throws.
 */
export async function sendMail({ to, subject, heading, lines, tone, cta }) {
  const record = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), to, subject, preview: lines.join(' ').slice(0, 220), status: 'simulated' };
  if (!configured()) return record;
  try {
    await getTransport().sendMail({
      from: config.smtp.from, to, subject,
      text: `${heading}\n\n${lines.join('\n\n')}${cta ? `\n\n${cta.label}: ${cta.url}` : ''}`,
      html: renderEmail({ heading, lines, tone, cta }),
    });
    record.status = 'sent';
  } catch (err) {
    record.status = 'failed';
    record.error = String(err.message || err).slice(0, 160);
  }
  return record;
}
