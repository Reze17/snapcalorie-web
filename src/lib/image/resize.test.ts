import { describe, expect, it } from "vitest";
import { computeDownsampleDimensions } from "./resize";

describe("computeDownsampleDimensions", () => {
  it("downsamples a huge landscape photo (12MP, 4:3) to 1920 on the longest edge", () => {
    expect(computeDownsampleDimensions(4032, 3024)).toEqual({
      width: 1920,
      height: 1440,
    });
  });

  it("downsamples a huge portrait photo (12MP, 4:3) to 1920 on the longest edge", () => {
    expect(computeDownsampleDimensions(3024, 4032)).toEqual({
      width: 1440,
      height: 1920,
    });
  });

  it("leaves an already-small image untouched", () => {
    expect(computeDownsampleDimensions(800, 600)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("leaves an image exactly at the max edge untouched", () => {
    expect(computeDownsampleDimensions(1920, 1080)).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("downsamples a square image", () => {
    expect(computeDownsampleDimensions(3000, 3000)).toEqual({
      width: 1920,
      height: 1920,
    });
  });

  it("respects a custom maxEdge", () => {
    expect(computeDownsampleDimensions(2000, 1000, 1000)).toEqual({
      width: 1000,
      height: 500,
    });
  });

  it("rejects non-positive dimensions", () => {
    expect(() => computeDownsampleDimensions(0, 100)).toThrow();
    expect(() => computeDownsampleDimensions(100, -1)).toThrow();
  });
});
