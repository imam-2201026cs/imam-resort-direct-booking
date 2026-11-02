import { describe, it, expect } from 'vitest';
import { gstRateFor, priceNights } from '../src/services/pricing.js';
import { validateStayDates, eachNight, nightsBetween } from '../src/lib/dates.js';
import { inr } from '../src/lib/money.js';

const SLABS = [
  { upToPaise: 750000, rate: 5 },
  { upToPaise: null, rate: 18 },
];

describe('GST slabs (declared tariff per room per night)', () => {
  it('applies 5% up to and including ₹7,500 and 18% above it', () => {
    expect(gstRateFor(620000, SLABS)).toBe(5);
    expect(gstRateFor(750000, SLABS)).toBe(5); // boundary is inclusive
    expect(gstRateFor(750100, SLABS)).toBe(18); // one rupee over
    expect(gstRateFor(1950000, SLABS)).toBe(18);
  });

  it('prices each night on its own slab, so a stay can mix rates', () => {
    const q = priceNights(
      [
        { date: '2026-11-20', price: 740000 }, // Fri, under the line
        { date: '2026-11-21', price: 830000 }, // Sat, over the line
      ],
      1,
      SLABS,
    );
    expect(q.nights.map((n) => n.gstRate)).toEqual([5, 18]);
    expect(q.nights.map((n) => n.gst)).toEqual([37000, 149400]);
    expect(q.subtotal).toBe(1570000);
    expect(q.gstTotal).toBe(186400);
    expect(q.total).toBe(1756400);
  });

  it('multiplies by units without changing the per-night slab', () => {
    const q = priceNights([{ date: '2026-11-18', price: 920000 }], 2, SLABS);
    expect(q.subtotal).toBe(1840000);
    expect(q.gstTotal).toBe(331200);
    expect(q.total).toBe(2171200);
  });

  it('always returns integer paise', () => {
    const q = priceNights([{ date: '2026-11-18', price: 619999 }], 3, SLABS);
    for (const v of [q.subtotal, q.gstTotal, q.total, q.nights[0].gst]) expect(Number.isInteger(v)).toBe(true);
  });
});

describe('stay dates', () => {
  const today = '2026-11-02';
  it('accepts a normal stay', () => expect(validateStayDates('2026-11-14', '2026-11-16', today)).toBeNull());
  it('rejects past check-in', () => expect(validateStayDates('2026-11-01', '2026-11-03', today)).toMatch(/past/));
  it('rejects zero or negative nights', () => {
    expect(validateStayDates('2026-11-14', '2026-11-14', today)).toMatch(/after/);
    expect(validateStayDates('2026-11-15', '2026-11-14', today)).toMatch(/after/);
  });
  it('limits online stays to 14 nights', () => expect(validateStayDates('2026-11-14', '2026-12-01', today)).toMatch(/14 nights/));
  it('lists nights with check-out exclusive', () => {
    expect(eachNight('2026-11-14', '2026-11-16')).toEqual(['2026-11-14', '2026-11-15']);
    expect(nightsBetween('2026-11-14', '2026-11-16')).toBe(2);
  });
  it('handles month boundaries', () => expect(eachNight('2026-12-31', '2027-01-02')).toEqual(['2026-12-31', '2027-01-01']));
});

describe('money formatting', () => {
  it('formats paise as rupees with Indian grouping', () => {
    expect(inr(1250000)).toBe('₹12,500');
    expect(inr(10050)).toBe('₹100.50');
  });
});
