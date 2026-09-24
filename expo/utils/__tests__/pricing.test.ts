import { calculatePrice, formatMXN, amountsMatch, PricingError } from '../pricing';

describe('calculatePrice', () => {
  const base = { hourlyRate: 450, duration: 4, vehicleType: 'standard' as const, protectionType: 'unarmed' as const, numberOfProtectors: 1 };

  it('computes a plain booking to the centavo', () => {
    const p = calculatePrice(base);
    expect(p.subtotal).toBe(1800);
    expect(p.processingFee).toBe(67.8); // 1800 × 3.6% + 3
    expect(p.total).toBe(1867.8);
    expect(p.platformCut).toBe(270);
    expect(p.guardPayout).toBe(1530);
    expect(p.totalCents).toBe(186780);
  });

  it('applies armored ×1.5 then armed ×1.3 and exposes each surcharge', () => {
    const p = calculatePrice({ ...base, vehicleType: 'armored', protectionType: 'armed' });
    expect(p.baseSubtotal).toBe(1800);
    expect(p.armoredSurcharge).toBe(900);
    expect(p.armedSurcharge).toBe(810);
    expect(p.subtotal).toBe(3510);
    expect(p.baseSubtotal + p.armoredSurcharge + p.armedSurcharge).toBe(p.subtotal);
  });

  it('never produces more than 2 decimals (old float math gave 255.525)', () => {
    for (const hourlyRate of [99.99, 125, 133.33, 450, 517.5]) {
      for (let duration = 1; duration <= 24; duration++) {
        for (const vehicleType of ['standard', 'armored'] as const) {
          for (const protectionType of ['armed', 'unarmed'] as const) {
            const p = calculatePrice({ hourlyRate, duration, vehicleType, protectionType, numberOfProtectors: 2 });
            for (const v of [p.subtotal, p.processingFee, p.total, p.platformCut, p.guardPayout]) {
              expect(Math.round(v * 100)).toBe(Number((v * 100).toFixed(6)));
            }
            expect(Math.round(p.total * 100)).toBe(p.totalCents);
            expect(p.platformCut + p.guardPayout).toBeCloseTo(p.subtotal, 10);
          }
        }
      }
    }
  });

  it('rejects out-of-range inputs', () => {
    expect(() => calculatePrice({ ...base, duration: 0 })).toThrow(PricingError);
    expect(() => calculatePrice({ ...base, duration: 25 })).toThrow(PricingError);
    expect(() => calculatePrice({ ...base, numberOfProtectors: 6 })).toThrow(PricingError);
    expect(() => calculatePrice({ ...base, hourlyRate: 0 })).toThrow(PricingError);
    expect(() => calculatePrice({ ...base, duration: 2.5 })).toThrow(PricingError);
  });

  it('formats MXN and compares amounts within a centavo', () => {
    expect(formatMXN(1867.8)).toMatch(/1,867\.80/);
    expect(formatMXN(undefined)).toMatch(/0\.00/);
    expect(amountsMatch(1867.8, 1867.8)).toBe(true);
    expect(amountsMatch(1867.79, 1867.8)).toBe(true);
    expect(amountsMatch(1860, 1867.8)).toBe(false);
    expect(amountsMatch(undefined, 1)).toBe(false);
  });
});
