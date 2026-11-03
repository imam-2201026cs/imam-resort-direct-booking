import { addDays, isValidDate, todayIST } from '../lib/dates.js';

const W = (words, weight) => words.map((w) => [w, weight]);
const KEYWORDS = {
  complaint: [
    ...W(['complaint', 'complain', 'disappointed', 'terrible', 'worst', 'unacceptable', 'refund', 'rude', 'dirty', 'unhygienic', 'cheated', 'overcharged', 'charged twice', 'poor service', 'bad experience', 'not happy', 'unhappy', 'shikayat', 'kharab', 'not clean', 'no hot water', 'not working'], 2),
  ],
  wedding: [
    ...W(['wedding', 'shaadi', 'shadi', 'marriage', 'sangeet', 'mehendi', 'mehandi', 'haldi', 'baraat', 'bride', 'groom', 'vivah', 'reception'], 2),
    ...W(['venue', 'lawns', 'lawn', 'engagement'], 1),
  ],
  corporate_offsite: [
    ...W(['offsite', 'off-site', 'off site', 'corporate', 'conference', 'team building', 'team outing', 'retreat', 'workshop', 'seminar', 'annual day', 'employees', 'our company', 'my company'], 2),
    ...W(['team of', 'training', 'meeting hall', 'boardroom', 'projector'], 1.5),
  ],
  room_booking: [
    ...W(['villa', 'villas', 'suite', 'room', 'rooms', 'kamra', 'kamre', 'cottage'], 1.5),
    ...W(['available', 'availability', 'vacancy', 'free', 'book', 'booking', 'tariff', 'rate', 'rates', 'price', 'check-in', 'check in', 'checkin', 'stay', 'weekend'], 1),
    ...W(['night', 'nights', 'adults', 'child', 'kids'], 0.5),
  ],
};

const has = (text, word) => new RegExp(`(?<![a-z])${word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?![a-z])`).test(text);

function scoreAll(text) {
  const scores = {};
  for (const [cat, list] of Object.entries(KEYWORDS)) {
    scores[cat] = list.reduce((s, [w, weight]) => s + (has(text, w) ? weight : 0), 0);
  }
  return scores;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const ORD = '(?:st|nd|rd|th)?';
const SEP = '\\s*(?:-|–|to|till|until)\\s*';
const monthNum = (s) => MONTHS[s.slice(0, 3)];
const pad = (n) => String(n).padStart(2, '0');

/** Next occurrence of day/month on or after today, unless a year is given. */
function resolveDate(day, month, year, today) {
  let y = year ? Number(year) : Number(today.slice(0, 4));
  let s = `${y}-${pad(month)}-${pad(day)}`;
  if (!year && s < today) {
    y += 1;
    s = `${y}-${pad(month)}-${pad(day)}`;
  }
  return isValidDate(s) ? s : null;
}

export function extractDates(text, today) {
  let m;
  // "30 Nov to 2 Dec 2026"
  if ((m = text.match(new RegExp(`(\\d{1,2})${ORD}\\s*${MON}${SEP}(\\d{1,2})${ORD}\\s*${MON}(?:\\s*,?\\s*(\\d{4}))?`)))) {
    const a = resolveDate(m[1], monthNum(m[2]), m[5], today);
    let b = resolveDate(m[3], monthNum(m[4]), m[5], today);
    if (a && b && b <= a && !m[5]) b = resolveDate(m[3], monthNum(m[4]), String(Number(a.slice(0, 4)) + 1), today);
    if (a && b) return { checkIn: a, checkOut: b };
  }
  // "14-16 Nov", "14 to 16 November 2026"
  if ((m = text.match(new RegExp(`(\\d{1,2})${ORD}${SEP}(\\d{1,2})${ORD}\\s*(?:of\\s+)?${MON}(?![a-z])(?:\\s*,?\\s*(\\d{4}))?`)))) {
    const a = resolveDate(m[1], monthNum(m[3]), m[4], today);
    const b = resolveDate(m[2], monthNum(m[3]), m[4], today);
    if (a && b && b > a) return { checkIn: a, checkOut: b };
  }
  // "14 Nov", "Nov 14"
  let single = text.match(new RegExp(`(\\d{1,2})${ORD}\\s*(?:of\\s+)?${MON}(?![a-z])(?:\\s*,?\\s*(\\d{4}))?`));
  let parts = single && [single[1], single[2], single[3]];
  if (!single && (single = text.match(new RegExp(`(?<![a-z])${MON}\\s+(\\d{1,2})(?!\\d)${ORD}(?:\\s*,?\\s*(\\d{4}))?`)))) parts = [single[2], single[1], single[3]];
  if (parts) {
    const a = resolveDate(parts[0], monthNum(parts[1]), parts[2], today);
    if (a) return { checkIn: a };
  }
  // Month only: "in Feb 2027", "a January offsite" ("may" needs context so "may I book" is not a month)
  const ctx = '(?:in|on|during|for|of|this|next|by|around|a|an|the|early|late|mid)\\s+';
  const mo = text.match(new RegExp(`(?<![a-z])${MON}(?![a-z])(?:\\s*,?\\s*(\\d{4}))?`, 'g'));
  if (mo) {
    for (const hit of mo) {
      const hm = hit.match(new RegExp(`${MON}(?:\\s*,?\\s*(\\d{4}))?`));
      const month = monthNum(hm[1]);
      const withYear = Boolean(hm[2]);
      if (hm[1] === 'may' && !withYear && !new RegExp(`${ctx}may(?![a-z])`).test(text)) continue;
      let y = hm[2] ? Number(hm[2]) : Number(today.slice(0, 4));
      if (!hm[2] && `${y}-${pad(month)}` < today.slice(0, 7)) y += 1;
      return { monthHint: `${y}-${pad(month)}` };
    }
  }
  return {};
}

function extractGuests(text) {
  let m;
  if ((m = text.match(/(\d{1,2})\s*adults?/))) {
    const kids = text.match(/(?:(\d{1,2})|\ba\b|\bone\b|\ban\b)\s*(?:child|children|kids?)/);
    return Number(m[1]) + (kids ? Number(kids[1] || 1) : 0);
  }
  if ((m = text.match(/team of (\d{1,4})/))) return Number(m[1]);
  if ((m = text.match(/(\d{1,4})\s*\+?\s*(?:guests?|people|persons?|pax|members|attendees|employees|delegates|participants|log)(?![a-z])/))) return Number(m[1]);
  return undefined;
}

const MULT = { k: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };
function extractBudgetPaise(text) {
  const m =
    text.match(/(?:budget(?:\s*(?:is|of|around|about|approx))?|₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr|k|l)?(?![a-z])/) ||
    text.match(/([\d.]+)\s*(lakhs?|lacs?)(?![a-z])/);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!(n > 0)) return undefined;
  return Math.round(n * (MULT[m[2]] || 1) * 100);
}

export function extractDetails(rawText, today = todayIST()) {
  const text = rawText.toLowerCase();
  const out = { ...extractDates(text, today) };
  const guests = extractGuests(text);
  if (guests) out.guests = guests;
  const nights = text.match(/(\d{1,2})\s*nights?/);
  if (nights) out.nights = Number(nights[1]);
  const budget = extractBudgetPaise(text);
  if (budget) out.budgetPaise = budget;
  if (out.checkIn && !out.checkOut && out.nights) out.checkOut = addDays(out.checkIn, out.nights);
  return out;
}

/** Deterministic classifier: transparent, free, and the safety net when the LLM is unavailable. */
export function classifyByRules(rawText, { today = todayIST() } = {}) {
  const text = rawText.toLowerCase();
  const scores = scoreAll(text);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [top, topScore] = ranked[0];
  const second = ranked[1][1];
  const complaintFlag = scores.complaint >= 2;
  const extracted = extractDetails(rawText, today);

  if (topScore < 1) return { category: 'other', confidence: 0.3, extracted, complaintFlag, scores };
  let confidence = Math.min(0.95, +(0.5 + 0.45 * ((topScore - second) / topScore)).toFixed(2));
  if (topScore < 2) confidence = Math.min(confidence, 0.6); // one weak keyword is not enough evidence
  return { category: top, confidence, extracted, complaintFlag, scores };
}
