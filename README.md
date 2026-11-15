# Thunai (துணை) — a care circle for every elder

> PromptWars · Challenge: **Elderly Care & Medication Management Platform**

Thunai ("companion" in Tamil) is a shared healthcare space where an **elder**, their **caretakers** and **family** manage medicines and doctor visits together — with the elder always at the centre. It goes beyond a reminder app:

| Idea | What it does |
|---|---|
| **Passcode circles** | No accounts or passwords. A circle ID + an easy passcode (`jasmine-4821`) gives one of three roles: *elder*, *caretaker*, *family*. |
| **Escalating reminders** | Email to the elder ~10 min before a dose → if still not logged after 30 min, the **whole circle** is emailed → appointment mails 24 h and 2 h ahead. |
| **Smart Add (Gemini)** | Say or type *"Metformin 500 mg twice a day after food"* — Gemini fills the form. A human always confirms before saving. Works offline with a rule-based fallback. |
| **Day Arc** | A sun travels across the day; every dose is a bead that fills in when taken. Plus read-aloud of the day. |
| **Elder-first transparency** | A "Who did what" feed: the elder sees every change anyone makes to their care. Only the elder can rotate passcodes or can't be removed. |
| **Warm notes** | Family leaves short notes that appear on the elder's Today screen. |
| **The week in words** | Gemini turns adherence numbers into a kind 3-line summary + a printable doctor-visit brief. |

## Roles
| | Elder | Caretaker | Family |
|---|:-:|:-:|:-:|
| View everything | ✅ | ✅ | ✅ (no outbox) |
| Medicines & dose check-ins | ✅ | ✅ | — |
| Appointments | ✅ | ✅ | ✅ |
| Add/remove members | ✅ | ✅ | — |
| Warm notes | ✅ | ✅ | ✅ |
| Rotate passcodes | ✅ | — | — |

## Google services
Cloud Run (hosting) · Firestore (storage, transactional updates) · Gemini API (Smart Add, weekly story) · Cloud Scheduler (reminder ticks) · Cloud Build (source deploys). SMTP mail works with a Gmail App Password.

## Quality, security, accessibility
- **Security**: passcodes stored as salted `scrypt` hashes; HMAC-signed 12 h session tokens; role checks on every route; zod input validation; Helmet + strict CSP (no inline script/style); rate limits on auth/AI/test-mail; identical error for unknown circle vs wrong passcode; DOM built with `textContent` (no `innerHTML` with user data); HTML emails escaped; non-root Docker user.
- **Efficiency**: tiny dependency set, no frontend build, no Gemini SDK, one Firestore doc per circle, logs pruned at 60 days, ETag/caching for static files, polling pauses when the tab is hidden.
- **Reliability**: reminder engine is *plan → claim (transaction) → send*, so double ticks never double-email; stale "missed" mails are suppressed after downtime.
- **Accessibility**: Atkinson Hyperlegible font, A−/A+ text size, high-contrast mode, skip link, landmarks, `aria-live` announcements, native `<dialog>`, 44 px+ targets, status shown with text/symbols (never colour alone), reduced-motion support, read-aloud and voice input.
- **Testing**: `npm test` (Node's built-in runner) — schedule maths, time zones, reminder planning/idempotency, API permissions, auth, validation, security headers.

## Run locally
```bash
cp .env.example .env     # optional; works with no keys (simulated emails, rule-based Smart Add)
npm install
npm start                # http://localhost:8080
npm test
```
Without SMTP credentials emails are *simulated* and shown in **Circle → Reminder outbox** so the flow is demoable. Click **Send test reminder** to try it.

## Deploy
See [DEPLOY.md](DEPLOY.md).

## Disclaimer
Thunai is a reminder companion, not a medical device or medical advice.
