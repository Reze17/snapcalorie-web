// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { AnthropicVisionService } from "./anthropic-vision-service";
import { getVisionService } from "./factory";
import { MockVisionService } from "./mock-vision-service";

describe("getVisionService", () => {
  const originalProvider = process.env.VISION_PROVIDER;
  const originalKey = process.env.VISION_API_KEY;

  afterEach(() => {
    if (originalProvider === undefined) {
      delete process.env.VISION_PROVIDER;
    } else {
      process.env.VISION_PROVIDER = originalProvider;
    }
    if (originalKey === undefined) {
      delete process.env.VISION_API_KEY;
    } else {
      process.env.VISION_API_KEY = originalKey;
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

  it("returns AnthropicVisionService when VISION_PROVIDER=anthropic and a key is set — same call site as mock", () => {
    process.env.VISION_PROVIDER = "anthropic";
    process.env.VISION_API_KEY = "test-key";
    expect(getVisionService()).toBeInstanceOf(AnthropicVisionService);
  });

  it("throws a clear not-implemented error for openai/google", () => {
    for (const provider of ["openai", "google"]) {
      process.env.VISION_PROVIDER = provider;
      expect(() => getVisionService()).toThrow(/not implemented/i);
    }
  });

  it("throws a clear error for an unknown provider value", () => {
    process.env.VISION_PROVIDER = "bogus";
    expect(() => getVisionService()).toThrow(/unknown/i);
  });
});
