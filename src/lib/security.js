import crypto from 'node:crypto';
import { config } from '../config.js';

const WORDS = ['mango','jasmine','coconut','banyan','lotus','turmeric','tulsi','pepper','cardamom','neem',
  'marigold','papaya','sandal','ginger','cinnamon','peacock','monsoon','sunrise','river','temple',
  'kolam','pongal','payasam','vetrilai','mullai','rose','amla','lemon','clove','saffron'];

const pick = (arr) => arr[crypto.randomInt(arr.length)];

/** Easy to say aloud and type on a phone: "jasmine-4821". ~30*9000 combos + rate limiting + lockout. */
export function generatePasscode() {
  return `${pick(WORDS)}-${crypto.randomInt(1000, 10000)}`;
}

export function generateCircleId() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return `THN-${s}`;
}

export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

/** Passcodes are stored only as salted scrypt hashes. */
export function hashPasscode(passcode) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(normalise(passcode), salt, 32).toString('hex');
  return { salt, hash };
}

export function verifyPasscode(passcode, record) {
  if (!record) return false;
  const candidate = crypto.scryptSync(normalise(passcode), record.salt, 32);
  const expected = Buffer.from(record.hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

const normalise = (p) => String(p).trim().toLowerCase();

// ---- Stateless signed session tokens (HMAC-SHA256, 12h) ----
const b64 = (buf) => Buffer.from(buf).toString('base64url');

export function signToken(payload, ttlSeconds = 12 * 3600) {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return data.exp > Date.now() / 1000 ? data : null;
  } catch { return null; }
}

export function safeEqual(a = '', b = '') {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
