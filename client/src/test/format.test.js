import { describe, it, expect } from 'vitest';
import { inr, stayError, nightsBetween, addDays, timeAgo, fmtDate } from '../lib/format.js';

describe('format helpers', () => {
  it('formats paise as rupees with Indian grouping', () => {
    expect(inr(1250000)).toBe('₹12,500');
    expect(inr(10050)).toBe('₹100.50');
    expect(inr(0)).toBe('₹0');
  });
  it('counts nights and adds days across month ends', () => {
    expect(nightsBetween('2026-11-14', '2026-11-16')).toBe(2);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('validates stays', () => {
    const t = '2026-11-02';
    expect(stayError('', '', t)).toMatch(/Choose/);
    expect(stayError('2026-11-01', '2026-11-03', t)).toMatch(/past/);
    expect(stayError('2026-11-05', '2026-11-05', t)).toMatch(/after/);
    expect(stayError('2026-11-05', '2026-12-05', t)).toMatch(/14 nights/);
    expect(stayError('2026-11-05', '2026-11-07', t)).toBeNull();
  });
  it('describes elapsed time', () => {
    const now = Date.parse('2026-11-02T10:00:00Z');
    expect(timeAgo('2026-11-02T09:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-11-02T09:15:00Z', now)).toBe('45 min ago');
    expect(timeAgo('2026-11-01T10:00:00Z', now)).toBe('1 d ago');
  });
  it('formats dates in UTC so IST calendar dates never shift', () => {
    expect(fmtDate('2026-11-14')).toBe('14 Nov 2026');
  });
});
