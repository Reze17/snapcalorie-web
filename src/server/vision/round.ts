/** Rounds to 2 decimal places without float noise (165 * 1.8 -> 297, not 297.00000000000006). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
