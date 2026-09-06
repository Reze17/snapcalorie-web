import Anthropic, { APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import type { z } from "zod";
import { logEvent } from "@/server/lib/log";
import { VisionAnalysisFailedError, VisionServiceTimeoutError } from "./errors";
import { round2 } from "./round";
import {
  foodSearchListSchema,
  rawAnalysisSchema,
  type RawDetectedFood,
} from "./schema";
import type {
  AnalysisResult,
  AnalyzeMealImageInput,
  DetectedFood,
  FoodSearchResult,
  INutritionVisionService,
} from "./types";

const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4096;

function getModel(): string {
  return process.env.VISION_ANTHROPIC_MODEL || DEFAULT_MODEL;
}

function getApiKey(): string {
  const key = process.env.VISION_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "VISION_API_KEY (or ANTHROPIC_API_KEY) is not set. Required when VISION_PROVIDER=anthropic.",
    );
  }
  return key;
}

// Shared JSON-schema fragments for the tools below. Kept in lockstep with
// schema.ts's zod schemas by hand — see the comment there for why the
// absolute macros aren't part of what we ask the model for.
const MACRO_JSON_SCHEMA = {
  type: "object",
  properties: {
    calories: { type: "number", description: "kcal per 100g" },
    protein: { type: "number", description: "grams of protein per 100g" },
    carbs: { type: "number", description: "grams of carbohydrate per 100g" },
    fat: { type: "number", description: "grams of fat per 100g" },
  },
  required: ["calories", "protein", "carbs", "fat"],
  additionalProperties: false,
} as const;

const ALTERNATIVE_JSON_SCHEMA = {
  type: "object",
  properties: {
    foodName: { type: "string" },
    confidence: { type: "number", description: "0.0-1.0" },
    per100g: MACRO_JSON_SCHEMA,
  },
  required: ["foodName", "confidence", "per100g"],
  additionalProperties: false,
} as const;

const DETECTED_FOOD_JSON_SCHEMA = {
  type: "object",
  properties: {
    foodName: {
      type: "string",
      description: "Specific, human-readable food name",
    },
    portionGrams: {
      type: "number",
      description:
        "Estimated portion weight in grams, reasoned from plate-relative size cues (plate diameter, utensils, typical servings)",
    },
    confidence: {
      type: "number",
      description:
        "0.0-1.0 confidence in both the identification and the portion estimate",
    },
    per100g: MACRO_JSON_SCHEMA,
    alternatives: {
      type: "array",
      description:
        "Exactly 3 alternative identifications if confidence < 0.70, otherwise an empty array",
      items: ALTERNATIVE_JSON_SCHEMA,
    },
  },
  required: [
    "foodName",
    "portionGrams",
    "confidence",
    "per100g",
    "alternatives",
  ],
  additionalProperties: false,
} as const;

const ANALYSIS_TOOL_NAME = "report_meal_analysis";

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: ANALYSIS_TOOL_NAME,
  description: "Reports the structured result of analyzing a meal photo.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description:
          "One entry per distinct visible food item on the plate. Empty array if no food is visible.",
        items: DETECTED_FOOD_JSON_SCHEMA,
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
  strict: true,
};

const ANALYSIS_SYSTEM_PROMPT = `You are a nutrition estimation assistant for a calorie-tracking app. You will be shown one photo of a plate of food.

For each distinct visible food item on the plate:
1. Give it a specific, human-readable name (e.g. "grilled chicken breast", not "meat" or "protein").
2. Estimate its portion weight in grams. Ground the estimate in plate-relative size cues: compare the item to the plate's diameter, to standard utensil sizes, and to typical serving sizes for that food.
3. Provide standard per-100g macros (calories, protein, carbs, fat) for that food, based on typical nutrition data for how it appears to be prepared (e.g. grilled vs. fried).
4. Give a confidence score from 0.0 to 1.0 reflecting how certain you are of BOTH the identification and the portion estimate.
5. If confidence is below 0.70, provide exactly 3 plausible alternative identifications, each with its own name, confidence, and per-100g macros. If confidence is 0.70 or higher, alternatives must be an empty array.

If the photo shows no food at all, return an empty items array.

Call the ${ANALYSIS_TOOL_NAME} tool exactly once with your complete findings. Do not output any text outside the tool call.`;

const FOOD_SEARCH_RESULT_JSON_SCHEMA = {
  type: "object",
  properties: {
    foodName: { type: "string" },
    per100g: MACRO_JSON_SCHEMA,
  },
  required: ["foodName", "per100g"],
  additionalProperties: false,
} as const;

const SEARCH_TOOL_NAME = "report_food_search_results";

const SEARCH_TOOL: Anthropic.Tool = {
  name: SEARCH_TOOL_NAME,
  description:
    "Reports foods matching a manual search query, with standard per-100g macros.",
  input_schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        description:
          "Up to 5 plausible distinct foods matching the query, most likely match first.",
        items: FOOD_SEARCH_RESULT_JSON_SCHEMA,
      },
    },
    required: ["results"],
    additionalProperties: false,
  },
  strict: true,
};

const SEARCH_SYSTEM_PROMPT = `You are a nutrition lookup assistant. Given a food search query, return up to 5 plausible distinct foods it could refer to, each with standard per-100g macros (calories, protein, carbs, fat) based on typical nutrition data. Order results by how well they match the query. If the query is nonsensical or clearly not food, return an empty results array.

Call the ${SEARCH_TOOL_NAME} tool exactly once. Do not output any text outside the tool call.`;

function toDetectedFood(raw: RawDetectedFood): DetectedFood {
  const factor = raw.portionGrams / 100;
  return {
    foodName: raw.foodName,
    portionGrams: raw.portionGrams,
    calories: round2(raw.per100g.calories * factor),
    protein: round2(raw.per100g.protein * factor),
    carbs: round2(raw.per100g.carbs * factor),
    fat: round2(raw.per100g.fat * factor),
    confidence: raw.confidence,
    alternatives: raw.alternatives,
    per100g: raw.per100g,
  };
}

function logAnalysisEvent(fields: Record<string, unknown>): void {
  logEvent("vision_analysis", fields);
}

/**
 * Calls the model with a forced tool call, validates the tool input against
 * `schema`, and — on validation failure — retries exactly once with a
 * tool_result "repair" turn describing what was wrong. Network-level
 * timeouts/retries are handled by the Anthropic client itself (see
 * REQUEST_TIMEOUT_MS / maxRetries in the constructor below); this only
 * handles the "model responded, but the JSON didn't match" case.
 */
async function callForToolInput<T>(
  client: Anthropic,
  tool: Anthropic.Tool,
  system: string,
  initialMessages: Anthropic.MessageParam[],
  schema: z.ZodType<T>,
): Promise<T> {
  let messages = initialMessages;

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: getModel(),
        max_tokens: MAX_TOKENS,
        system,
        messages,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
      });
    } catch (err) {
      if (err instanceof APIConnectionTimeoutError) {
        throw new VisionServiceTimeoutError();
      }
      throw err;
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (!toolUse) {
      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        {
          role: "user",
          content: `You must call the ${tool.name} tool with your findings. Please try again.`,
        },
      ];
      continue;
    }

    const parsed = schema.safeParse(toolUse.input);
    if (parsed.success) {
      return parsed.data;
    }

    if (attempt === 0) {
      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUse.id,
              is_error: true,
              content: `Your input did not match the required schema: ${parsed.error.message}. Call ${tool.name} again with corrected input that matches the schema exactly.`,
            },
          ],
        },
      ];
      continue;
    }

    throw new VisionAnalysisFailedError(
      `Model output failed schema validation after a retry: ${parsed.error.message}`,
    );
  }

  throw new VisionAnalysisFailedError(
    "Model did not produce a valid tool call.",
  );
}

export class AnthropicVisionService implements INutritionVisionService {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: getApiKey(),
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 1, // one retry with backoff, per CLAUDE.md reliability rule
    });
  }

  async analyzeMealImage(
    input: AnalyzeMealImageInput,
  ): Promise<AnalysisResult> {
    const start = Date.now();
    const mediaType = normalizeImageMediaType(input.mimeType);

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: input.imageBuffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: "Analyze this meal photo.",
          },
        ],
      },
    ];

    try {
      const raw = await callForToolInput(
        this.client,
        ANALYSIS_TOOL,
        ANALYSIS_SYSTEM_PROMPT,
        messages,
        rawAnalysisSchema,
      );
      const processingMs = Date.now() - start;
      logAnalysisEvent({
        provider: "anthropic",
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
        provider: "anthropic",
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

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: `Search query: ${trimmed}` },
    ];
    const raw = await callForToolInput(
      this.client,
      SEARCH_TOOL,
      SEARCH_SYSTEM_PROMPT,
      messages,
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

function normalizeImageMediaType(
  mimeType: string,
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  switch (mimeType) {
    case "image/png":
    case "image/gif":
    case "image/webp":
      return mimeType;
    default:
      return "image/jpeg";
  }
}
