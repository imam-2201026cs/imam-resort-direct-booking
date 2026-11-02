import { z } from 'zod';

// All stay dates are calendar dates ("YYYY-MM-DD") in IST. Never timestamps, so no timezone drift.
const RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s) {
  if (typeof s !== 'string' || !RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function todayIST(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

export function addDays(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const nightsBetween = (a, b) =>
  Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

/** Nights of a stay: check-in inclusive, check-out exclusive. */
export function eachNight(checkIn, checkOut) {
  const out = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = Sunday ... 6 = Saturday */
export const weekday = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();

export const dateSchema = z.string().refine(isValidDate, 'Use a valid date (YYYY-MM-DD)');

export const MAX_NIGHTS = 14;
export const MAX_ADVANCE_DAYS = 365;

/** Returns an error message or null. */
export function validateStayDates(checkIn, checkOut, today = todayIST()) {
  if (checkIn < today) return 'Check-in cannot be in the past';
  if (checkOut <= checkIn) return 'Check-out must be after check-in';
  const n = nightsBetween(checkIn, checkOut);
  if (n > MAX_NIGHTS) return `Stays are limited to ${MAX_NIGHTS} nights online. Please send us an enquiry for longer stays`;
  if (nightsBetween(today, checkIn) > MAX_ADVANCE_DAYS) return 'Bookings open up to 12 months ahead';
  return null;
}
