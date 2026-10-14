/** Numeric primitives shared by every calculation. Null always means "not available" (rendered as N/A). */

export type N = number | null;

export function safeDiv(a: N, b: N): N {
  if (a === null || b === null || b === 0 || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a / b;
}

/**
 * Growth = current / comparable prior − 1. Undefined (null) when either side is
 * missing or the base is zero/negative (growth on a negative base is not meaningful).
 */
export function growth(cur: N, prev: N): N {
  if (cur === null || prev === null || prev <= 0) return null;
  return cur / prev - 1;
}

/** Difference between two ratios, expressed as a fraction (×100 = percentage points). */
export function ppChange(cur: N, prev: N): N {
  if (cur === null || prev === null) return null;
  return cur - prev;
}

export function sumOrNull(values: N[]): N {
  if (values.length === 0 || values.some((v) => v === null)) return null;
  return (values as number[]).reduce((a, b) => a + b, 0);
}

export function mean(values: N[]): N {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length === 0) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function median(values: N[]): N {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function quantile(values: N[], q: number): N {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/** Share of values strictly below x (0..1). */
export function percentRank(values: N[], x: N): N {
  const v = values.filter((y): y is number => y !== null);
  if (x === null || v.length === 0) return null;
  return v.filter((y) => y < x).length / v.length;
}
