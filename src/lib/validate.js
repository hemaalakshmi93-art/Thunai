import { z } from 'zod';
import { isValidTimezone } from './time.js';

const text = (max) => z.string().trim().min(1).max(max);
const optText = (max) => z.string().trim().max(max).optional().default('');
const email = z.string().trim().toLowerCase().email().max(120);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/);

export const roles = ['elder', 'caretaker', 'family'];

export const createCircleSchema = z.object({
  elderName: text(60),
  elderEmail: email.optional().or(z.literal('')).default(''),
  creatorName: text(60).optional(),
  timezone: z.string().refine(isValidTimezone, 'Unknown time zone').default('Asia/Kolkata'),
});

export const authSchema = z.object({
  circleId: z.string().trim().toUpperCase().regex(/^THN-[A-Z0-9]{6}$/),
  passcode: z.string().trim().min(4).max(40),
  name: text(60),
});

export const medSchema = z.object({
  name: text(80),
  dose: optText(60),
  instructions: optText(160),
  times: z.array(hhmm).min(1).max(8).transform((t) => [...new Set(t)].sort()),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7)
    .transform((d) => [...new Set(d)].sort()).default([0, 1, 2, 3, 4, 5, 6]),
  startDate: ymd.optional(),
  endDate: ymd.optional(),
  active: z.boolean().default(true),
});

export const doseSchema = z.object({
  medId: text(40), date: ymd, time: hhmm,
  status: z.enum(['taken', 'skipped', 'pending']),
});

export const apptSchema = z.object({
  title: text(100),
  doctor: optText(80),
  location: optText(120),
  datetime: localDateTime,
  notes: optText(300),
});

export const memberSchema = z.object({
  name: text(60),
  email: email.optional().or(z.literal('')).default(''),
  role: z.enum(roles),
  relation: optText(40),
});

export const noteSchema = z.object({ text: text(200) });
export const parseMedSchema = z.object({ text: text(300) });
export const rotateSchema = z.object({ role: z.enum(roles) });
