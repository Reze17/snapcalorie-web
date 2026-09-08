import { logEvent } from "@/server/lib/log";
import { toDetectedFood } from "./derive-macros";
import { VisionAnalysisFailedError, VisionServiceTimeoutError } from "./errors";
import {
  foodSearchListSchema,
  rawAnalysisSchema,
  type FoodSearchList,
  type RawAnalysis,
} from "./schema";
import type {
  AnalysisResult,
  AnalyzeMealImageInput,
  FoodSearchResult,
  INutritionVisionService,
} from "./types";
import type { z } from "zod";

// Local inference has no fixed latency budget the way a cloud API does —
// CPU-only inference on a vision model can genuinely take 30-60s+
// depending on hardware, so this defaults much higher than Anthropic's
// 12s. Override with VISION_OLLAMA_TIMEOUT_MS if your hardware needs more.
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_HOST = "http://localhost:11434";
// llava is the most commonly pre-pulled multimodal Ollama model. Any
// vision-capable model works (llama3.2-vision, qwen2.5vl, minicpm-v, ...) —
// override via VISION_OLLAMA_MODEL. `ollama pull <model>` first.
const DEFAULT_MODEL = "llava";

function getHost(): string {
  return (process.env.VISION_OLLAMA_HOST || DEFAULT_HOST).replace(/\/+$/, "");
}

function getModel(): string {
  return process.env.VISION_OLLAMA_MODEL || DEFAULT_MODEL;
}

function getTimeoutMs(): number {
  const raw = process.env.VISION_OLLAMA_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

// Same shape as Anthropic's tool input_schema (both are JSON Schema) — kept
// in lockstep with schema.ts's zod schemas by hand, same as the Anthropic
// provider. Ollama's `format` field constrains the model's output to match
// this exactly (llama.cpp grammar-constrained decoding under the hood).
const MACRO_JSON_SCHEMA = {
  type: "object",
  properties: {
    calories: { type: "number" },
    protein: { type: "number" },
    carbs: { type: "number" },
    fat: { type: "number" },
  },
  required: ["calories", "protein", "carbs", "fat"],
} as const;

const ALTERNATIVE_JSON_SCHEMA = {
  type: "object",
  properties: {
    foodName: { type: "string" },
    confidence: { type: "number" },
    per100g: MACRO_JSON_SCHEMA,
  },
  required: ["foodName", "confidence", "per100g"],
} as const;

const ANALYSIS_FORMAT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          foodName: { type: "string" },
          portionGrams: { type: "number" },
          confidence: { type: "number" },
          per100g: MACRO_JSON_SCHEMA,
          alternatives: { type: "array", items: ALTERNATIVE_JSON_SCHEMA },
        },
        required: [
          "foodName",
          "portionGrams",
          "confidence",
          "per100g",
          "alternatives",
        ],
      },
    },
  },
  required: ["items"],
} as const;

const SEARCH_FORMAT_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          foodName: { type: "string" },
          per100g: MACRO_JSON_SCHEMA,
        },
        required: ["foodName", "per100g"],
      },
    },
  },
  required: ["results"],
} as const;

const ANALYSIS_SYSTEM_PROMPT = `You are a nutrition estimation assistant for a calorie-tracking app. You will be shown one photo of a plate of food.

For each distinct visible food item on the plate:
1. Give it a specific, human-readable name (e.g. "grilled chicken breast", not "meat" or "protein").
2. Estimate its portion weight in grams. Ground the estimate in plate-relative size cues: compare the item to the plate's diameter, to standard utensil sizes, and to typical serving sizes for that food.
3. Provide standard per-100g macros (calories, protein, carbs, fat) for that food, based on typical nutrition data for how it appears to be prepared (e.g. grilled vs. fried).
4. Give a confidence score from 0.0 to 1.0 reflecting how certain you are of BOTH the identification and the portion estimate.
5. If confidence is below 0.70, provide exactly 3 plausible alternative identifications, each with its own name, confidence, and per-100g macros. If confidence is 0.70 or higher, alternatives must be an empty array.

If the photo shows no food at all, return an empty items array.

Respond with ONLY a JSON object matching the required schema. No other text.`;

const SEARCH_SYSTEM_PROMPT = `You are a nutrition lookup assistant. Given a food search query, return up to 5 plausible distinct foods it could refer to, each with standard per-100g macros (calories, protein, carbs, fat) based on typical nutrition data. Order results by how well they match the query. If the query is nonsensical or clearly not food, return an empty results array.

Respond with ONLY a JSON object matching the required schema. No other text.`;

interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
}

interface OllamaChatResponse {
  message?: { role: string; content: string };
}

async function callOllamaChat(
  messages: OllamaChatMessage[],
  format: Record<string, unknown>,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  let response: Response;
  try {
    response = await fetch(`${getHost()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: getModel(),
        messages,
        format,
        stream: false,
        options: { temperature: 0 },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new VisionServiceTimeoutError();
    }
    throw new Error(
      `Could not reach Ollama at ${getHost()}. Is "ollama serve" running? (${err instanceof Error ? err.message : String(err)})`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Ollama request failed (${response.status}): ${body || response.statusText}. ` +
        `If the model isn't pulled yet, run: ollama pull ${getModel()}`,
    );
  }

  const data = (await response.json()) as OllamaChatResponse;
  const content = data.message?.content;
  if (!content) {
    throw new VisionAnalysisFailedError("Ollama returned an empty response.");
  }
  return content;
}

/**
 * Calls the model for structured JSON matching `schema`, retrying exactly
 * once with a repair message if the response isn't valid JSON or fails
 * schema validation — same one-repair-attempt policy as the Anthropic
 * provider's callForToolInput, just adapted to Ollama's plain-JSON (not
 * tool-use) structured output mechanism.
 */
async function callForStructuredJson<T>(
  systemPrompt: string,
  userMessage: OllamaChatMessage,
  format: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const messages: OllamaChatMessage[] = [
    { role: "system", content: systemPrompt },
    userMessage,
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callOllamaChat(messages, format);

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      if (attempt === 0) {
        messages.push(
          { role: "assistant", content: raw },
          {
            role: "user",
            content:
              "That was not valid JSON. Respond again with ONLY a single valid JSON object matching the required schema.",
          },
        );
        continue;
      }
      throw new VisionAnalysisFailedError(
        "Model did not produce valid JSON after a retry.",
      );
    }

    const parsed = schema.safeParse(json);
    if (parsed.success) {
      return parsed.data;
    }

    if (attempt === 0) {
      messages.push(
        { role: "assistant", content: raw },
        {
          role: "user",
          content: `Your response did not match the required schema: ${parsed.error.message}. Respond again with corrected JSON that matches the schema exactly.`,
        },
      );
      continue;
    }

    throw new VisionAnalysisFailedError(
      `Model output failed schema validation after a retry: ${parsed.error.message}`,
    );
  }

  throw new VisionAnalysisFailedError(
    "Model did not produce a valid structured response.",
  );
}

function logAnalysisEvent(fields: Record<string, unknown>): void {
  logEvent("vision_analysis", fields);
}

/**
 * Runs vision analysis locally against an Ollama server instead of a cloud
 * API — same INutritionVisionService contract as AnthropicVisionService,
 * same non-negotiable rule: the model is only ever asked for portionGrams,
 * confidence, and per100g macros, never absolute macros (see
 * derive-macros.ts). Requires a local `ollama serve` with a vision-capable
 * model pulled (`ollama pull llava`, or override VISION_OLLAMA_MODEL).
 */
export class OllamaVisionService implements INutritionVisionService {
  async analyzeMealImage(
    input: AnalyzeMealImageInput,
  ): Promise<AnalysisResult> {
    const start = Date.now();
    try {
      const raw: RawAnalysis = await callForStructuredJson(
        ANALYSIS_SYSTEM_PROMPT,
        {
          role: "user",
          content: "Analyze this meal photo.",
          images: [input.imageBuffer.toString("base64")],
        },
        ANALYSIS_FORMAT_SCHEMA,
        rawAnalysisSchema,
      );
      const processingMs = Date.now() - start;
      logAnalysisEvent({
        provider: "ollama",
        model: getModel(),
        itemCount: raw.items.length,
        processingMs,
      });
      return {
        items: raw.items.map(toDetectedFood),
        modelVersion: getModel(),
        processingMs,
      };
    } catch (err) {
      logAnalysisEvent({
        provider: "ollama",
        model: getModel(),
        processingMs: Date.now() - start,
        failed: true,
        errorName: err instanceof Error ? err.name : "unknown",
      });
      throw err;
    }
  }

  async searchFoods(query: string): Promise<FoodSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const raw: FoodSearchList = await callForStructuredJson(
      SEARCH_SYSTEM_PROMPT,
      { role: "user", content: `Search query: ${trimmed}` },
      SEARCH_FORMAT_SCHEMA,
      foodSearchListSchema,
    );
    return raw.results;
  }

  async getFoodByName(name: string): Promise<FoodSearchResult | null> {
    const results = await this.searchFoods(name);
    const target = name.trim().toLowerCase();
    return (
      results.find((food) => food.foodName.toLowerCase() === target) ?? null
    );
  }
}
