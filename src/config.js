// Central, validated configuration. Everything comes from the environment.
const env = process.env;

export const config = {
  port: Number(env.PORT) || 8080,
  appUrl: env.APP_URL || `http://localhost:${Number(env.PORT) || 8080}`,
  isProd: env.NODE_ENV === 'production',
  sessionSecret: env.SESSION_SECRET || 'dev-only-secret-change-me',
  cronSecret: env.CRON_SECRET || '',
  store: env.STORE || 'file',
  dataDir: env.DATA_DIR || './data',
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 465,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'Thunai Care <no-reply@thunai.local>',
  },
  gemini: {
    key: env.GEMINI_API_KEY || '',
    model: env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  reminders: {
    leadMinutes: 10, // "time for your tablet" nudge, sent this long before the dose
    missedAfterMinutes: 30, // escalate to the whole circle after this long
    giveUpAfterMinutes: 360, // never send stale "missed" mails after server downtime
    internalTick: env.INTERNAL_TICK === 'true',
  },
};

if (config.isProd && config.sessionSecret === 'dev-only-secret-change-me') {
  throw new Error('SESSION_SECRET must be set in production');
}
