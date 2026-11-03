// Money arrives as integer paise from the API.
export function inr(paise) {
  const r = paise / 100;
  return `₹${r.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const utc = (s) => new Date(`${s}T00:00:00Z`);
export const addDays = (s, n) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const nightsBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export const fmtDate = (s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  utc(s).toLocaleDateString('en-IN', { ...opts, timeZone: 'UTC' });
export const fmtShort = (s) => fmtDate(s, { day: 'numeric', month: 'short' });
export const fmtWeekday = (s) => utc(s).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
export const fmtMonthYear = (s) => utc(s).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const fmtRange = (a, b) => `${fmtShort(a)} to ${fmtDate(b)}`;
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

export function timeAgo(iso, now = Date.now()) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Validates a search/stay. Returns an error string or null. */
export function stayError(checkIn, checkOut, today = todayISO()) {
  if (!checkIn || !checkOut) return 'Choose your check-in and check-out dates';
  if (checkIn < today) return 'Check-in cannot be in the past';
  if (checkOut <= checkIn) return 'Check-out must be after check-in';
  if (nightsBetween(checkIn, checkOut) > 14) return 'Online stays are limited to 14 nights. Send us an enquiry for longer stays';
  return null;
}

export const CATEGORY_LABEL = {
  room_booking: 'Room booking',
  wedding: 'Wedding',
  corporate_offsite: 'Corporate offsite',
  complaint: 'Complaint',
  other: 'Unclear',
};
export const LANE_LABEL = { unsorted: 'Unsorted', reservations: 'Reservations', sales: 'Sales', gm: 'GM' };
export const SOURCE_LABEL = { web_form: 'Web form', email: 'Email', whatsapp: 'WhatsApp' };
