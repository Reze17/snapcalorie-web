import { afterEach, describe, expect, it } from "vitest";
import { getVisionService } from "./factory";
import { MockVisionService } from "./mock-vision-service";

describe("getVisionService", () => {
  const originalProvider = process.env.VISION_PROVIDER;

  afterEach(() => {
    if (originalProvider === undefined) {
      delete process.env.VISION_PROVIDER;
    } else {
      process.env.VISION_PROVIDER = originalProvider;
    }
  });

  it("returns MockVisionService when VISION_PROVIDER=mock", () => {
    process.env.VISION_PROVIDER = "mock";
    expect(getVisionService()).toBeInstanceOf(MockVisionService);
  });

  it("defaults to mock when VISION_PROVIDER is unset", () => {
    delete process.env.VISION_PROVIDER;
    expect(getVisionService()).toBeInstanceOf(MockVisionService);
  });

  it("throws a clear not-implemented error for openai/anthropic/google", () => {
    for (const provider of ["openai", "anthropic", "google"]) {
      process.env.VISION_PROVIDER = provider;
      expect(() => getVisionService()).toThrow(/not implemented/i);
    }
  });

  it("throws a clear error for an unknown provider value", () => {
    process.env.VISION_PROVIDER = "bogus";
    expect(() => getVisionService()).toThrow(/unknown/i);
  });
});
