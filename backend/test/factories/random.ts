/**
 * Deterministic pseudo-random generators for test factory data.
 * Using a fixed seed keeps the generated dataset reproducible across runs.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const generator = mulberry32(20260912);

export const rand = generator;

export function int(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

export function pick<T>(items: readonly T[]): T {
  return items[int(0, items.length - 1)] as T;
}

export function alphaNum(length: number): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(int(0, chars.length - 1));
  }
  return result;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Random decimal value with 2 decimal places inside [min, max]. */
export function amount2(min: number, max: number): number {
  return round2(min + rand() * (max - min));
}

/** Random positive unit price, optionally negative when allowNegative is true. */
export function unitPrice(allowNegative = false): number {
  const price = amount2(1, 500);
  return allowNegative && rand() < 0.03 ? -price : price;
}

/** Random integer quantity inside [min, max]. */
export function quantity(min = 1, max = 500): number {
  return int(min, max);
}

/** Random ISO date string (YYYY-MM-DD) inside [from, to]. */
export function dateIso(from: Date, to: Date): string {
  const ms = from.getTime() + rand() * (to.getTime() - from.getTime());
  return new Date(ms).toISOString().slice(0, 10);
}

/** Random ISO datetime string for DateTime columns. */
export function datetimeIso(from: Date, to: Date): string {
  const ms = from.getTime() + rand() * (to.getTime() - from.getTime());
  return new Date(ms).toISOString();
}

export function twoYearsAgo(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d;
}
