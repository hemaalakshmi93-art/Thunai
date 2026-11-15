// Gemini integration via the public REST API (no SDK = tiny image, easy to audit).
// Every call has a deterministic fallback so the app works with no API key at all.
import { z } from 'zod';
import { config } from '../config.js';

const ENDPOINT = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

async function callGemini(prompt, { json = false } = {}) {
  if (!config.gemini.key) return null;
  const res = await fetch(ENDPOINT(config.gemini.model), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.gemini.key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) },
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? null;
}

// ---------------- Smart Add: free text -> structured medicine ----------------
const parsedSchema = z.object({
  name: z.string().min(1).max(80),
  dose: z.string().max(60).default(''),
  instructions: z.string().max(160).default(''),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(8),
});

const TIME_WORDS = { morning: '08:00', breakfast: '08:00', noon: '13:00', afternoon: '14:00', lunch: '13:00', evening: '18:00', night: '21:00', bedtime: '21:30', dinner: '20:00' };

/** Rule-based fallback — handles "Metformin 500mg twice a day after food", "Amlodipine at 8am and 8pm". */
export function ruleBasedParse(text) {
  const t = text.trim();
  const nameMatch = t.match(/^(?:take\s+|tab(?:let)?\.?\s+|cap(?:sule)?\.?\s+)?([A-Za-z][A-Za-z-]{2,30})/i);
  const doseMatch = t.match(/(\d+(?:\.\d+)?\s?(?:mg|mcg|ml|g|iu|units?|tablets?|tabs?|caps?|drops?))/i);
  const times = new Set();
  for (const m of t.matchAll(/(\d{1,2})(?::(\d{2}))?\s?(am|pm)/gi)) {
    let h = Number(m[1]) % 12; if (m[3].toLowerCase() === 'pm') h += 12;
    times.add(`${String(h).padStart(2, '0')}:${m[2] || '00'}`);
  }
  for (const [w, v] of Object.entries(TIME_WORDS)) if (new RegExp(`\\b${w}\\b`, 'i').test(t)) times.add(v);
  if (!times.size) {
    if (/thrice|three times|3 times|\btds\b/i.test(t)) ['08:00', '14:00', '20:00'].forEach((x) => times.add(x));
    else if (/twice|two times|2 times|\bbd\b|\bbid\b/i.test(t)) ['08:00', '20:00'].forEach((x) => times.add(x));
    else times.add('08:00');
  }
  const instr = /(before|after|with)\s+(food|meals?|breakfast|lunch|dinner)|empty stomach/i.exec(t);
  return {
    name: nameMatch ? nameMatch[1][0].toUpperCase() + nameMatch[1].slice(1) : t.slice(0, 40),
    dose: doseMatch ? doseMatch[1] : '',
    instructions: instr ? instr[0][0].toUpperCase() + instr[0].slice(1) : '',
    times: [...times].sort(),
  };
}

export async function parseMedication(text) {
  try {
    const raw = await callGemini(
      `You extract a medication reminder from a sentence typed or spoken by an elderly person or their carer.
Return ONLY JSON: {"name": string, "dose": string, "instructions": string, "times": ["HH:MM" 24h]}.
Rules: never invent a dose or drug name that is not in the text; if no clock time is given use sensible defaults
(morning 08:00, afternoon 14:00, evening 18:00, night 21:00); "twice a day" = 08:00 and 20:00; "thrice a day" = 08:00, 14:00, 20:00.
Sentence: """${text.replace(/"""/g, '"')}"""`,
      { json: true },
    );
    if (raw) {
      const parsed = parsedSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return { ...parsed.data, source: 'gemini' };
    }
  } catch { /* fall through to the rule-based parser */ }
  return { ...ruleBasedParse(text), source: 'rules' };
}

// ---------------- Weekly story: numbers -> kind, plain language ----------------
export function templateSummary({ elderName, report }) {
  if (report.percent === null) return `No doses have been scheduled yet for ${elderName}. Add a medicine to start the story.`;
  const worst = [...report.perMed].filter((m) => m.due).sort((a, b) => a.taken / a.due - b.taken / b.due)[0];
  const opener = report.percent >= 90 ? `A steady week for ${elderName}` : report.percent >= 70 ? `A mostly good week for ${elderName}` : `A tougher week for ${elderName}`;
  const tail = worst && worst.taken < worst.due ? ` ${worst.name} was missed ${worst.due - worst.taken} time${worst.due - worst.taken > 1 ? 's' : ''} — worth a gentle chat or a new reminder time.` : ' Every medicine was taken on time.';
  return `${opener}: ${report.taken} of ${report.due} doses taken (${report.percent}%).${tail}${report.streak > 1 ? ` Current streak: ${report.streak} perfect days.` : ''}`;
}

export async function weeklyStory({ elderName, report, appointments }) {
  const fallback = templateSummary({ elderName, report });
  try {
    const facts = JSON.stringify({
      elder: elderName, percent: report.percent, taken: report.taken, due: report.due, streakDays: report.streak,
      medicines: report.perMed.map((m) => ({ name: m.name, taken: m.taken, due: m.due })),
      upcomingAppointments: appointments.slice(0, 3).map((a) => ({ title: a.title, when: a.datetime })),
    });
    const out = await callGemini(
      `Write a warm 3-4 sentence weekly update for the family of an elderly person, in plain English a 10-year-old could read.
Use ONLY these facts, add no medical advice, no diagnosis, no new numbers. Mention one gentle suggestion if any dose was missed.
Facts: ${facts}`,
    );
    return { text: (out || fallback).trim().slice(0, 900), source: out ? 'gemini' : 'rules' };
  } catch {
    return { text: fallback, source: 'rules' };
  }
}
