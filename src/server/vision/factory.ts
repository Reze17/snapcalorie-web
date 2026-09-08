import { AnthropicVisionService } from "./anthropic-vision-service";
import { VisionServiceNotImplementedError } from "./errors";
import { MockVisionService } from "./mock-vision-service";
import { OllamaVisionService } from "./ollama-vision-service";
import type { INutritionVisionService } from "./types";

export type VisionProvider =
  "mock" | "openai" | "anthropic" | "google" | "ollama";

const KNOWN_PROVIDERS: VisionProvider[] = [
  "mock",
  "openai",
  "anthropic",
  "google",
  "ollama",
];

function isKnownProvider(value: string): value is VisionProvider {
  return (KNOWN_PROVIDERS as string[]).includes(value);
}

/**
 * Selects the INutritionVisionService implementation by the
 * VISION_PROVIDER env var. Call sites depend only on the interface, so
 * switching providers (once implemented) never touches call sites.
 */
export function getVisionService(): INutritionVisionService {
  const provider = process.env.VISION_PROVIDER ?? "mock";

  if (!isKnownProvider(provider)) {
    throw new Error(
      `Unknown VISION_PROVIDER "${provider}". Expected one of: ${KNOWN_PROVIDERS.join(", ")}.`,
    );
  }

  switch (provider) {
    case "mock":
      return new MockVisionService();
    case "anthropic":
      return new AnthropicVisionService();
    case "ollama":
      return new OllamaVisionService();
    case "openai":
    case "google":
      throw new VisionServiceNotImplementedError(provider);
  }
}
