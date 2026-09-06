import { describe, expect, it } from "vitest";
import { percentile } from "./percentile";

describe("percentile", () => {
  it("returns 0 for an empty array", () => {
    expect(percentile([], 75)).toBe(0);
  });

  it("returns the only value for a single-element array at any percentile", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 99)).toBe(42);
  });

  it("computes p50 (median) for an odd-length array", () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it("computes p75 for a simple 4-element array", () => {
    // Sorted: [1,2,3,4]. rank = ceil(0.75*4) = 3 -> index 2 -> value 3.
    expect(percentile([4, 1, 3, 2], 75)).toBe(3);
  });

  it("computes p95 correctly on a larger dataset", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(values, 95)).toBe(95);
  });

  it("does not mutate the input array", () => {
    const values = [5, 3, 1, 4, 2];
    percentile(values, 50);
    expect(values).toEqual([5, 3, 1, 4, 2]);
  });
});
