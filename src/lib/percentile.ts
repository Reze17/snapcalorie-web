/**
 * Nearest-rank percentile over a numeric array (0-100). Not
 * interpolated — simplest correct definition, and matches how "p75
 * latency" is commonly reported. Returns 0 for an empty array rather than
 * NaN, since /admin/metrics needs to render something before any data
 * exists.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
}
