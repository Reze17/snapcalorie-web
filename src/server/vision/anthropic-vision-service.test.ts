// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class MockAnthropicClient {
    messages = { create: mockCreate };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- matches the real constructor's signature so `new Anthropic({...})` type-checks
    constructor(opts: unknown) {}
  }
  return { ...actual, default: MockAnthropicClient };
});

import { APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import { AnthropicVisionService } from "./anthropic-vision-service";
import { runVisionServiceContractTests } from "./contract";
import { VisionAnalysisFailedError, VisionServiceTimeoutError } from "./errors";

function toolUseResponse(input: unknown, name: string) {
  return {
    content: [{ type: "tool_use", id: "toolu_1", name, input }],
  };
}

const VALID_ITEM = {
  foodName: "Grilled chicken breast",
  portionGrams: 180,
  confidence: 0.91,
  per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  alternatives: [],
};

const BANANA_SEARCH_RESULT = {
  foodName: "Banana",
  per100g: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3 },
};

// Fallback used by the shared contract suite (which doesn't know or care
// about Anthropic-specific request/response shapes) — it just needs any
// well-formed response for whichever tool got requested. Individual tests
// below layer mockResolvedValueOnce/mockRejectedValueOnce on top of this to
// exercise specific scenarios.
function defaultMockCreate(params: { tool_choice?: { name?: string } }) {
  const toolName = params.tool_choice?.name;
  if (toolName === "report_meal_analysis") {
    return Promise.resolve(toolUseResponse({ items: [VALID_ITEM] }, toolName));
  }
  if (toolName === "report_food_search_results") {
    return Promise.resolve(
      toolUseResponse({ results: [BANANA_SEARCH_RESULT] }, toolName),
    );
  }
  return Promise.reject(new Error(`Unexpected tool: ${String(toolName)}`));
}

const originalKey = process.env.VISION_API_KEY;

beforeEach(() => {
  process.env.VISION_API_KEY = "test-key";
  mockCreate.mockReset();
  mockCreate.mockImplementation(defaultMockCreate);
});

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.VISION_API_KEY;
  } else {
    process.env.VISION_API_KEY = originalKey;
  }
});

runVisionServiceContractTests(
  "AnthropicVisionService (mocked)",
  () => new AnthropicVisionService(),
);

describe("AnthropicVisionService", () => {
  it("throws if no API key is configured", () => {
    delete process.env.VISION_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => new AnthropicVisionService()).toThrow(/VISION_API_KEY/);
  });

  it("computes absolute macros from per100g x portionGrams, ignoring model arithmetic", async () => {
    mockCreate.mockResolvedValueOnce(
      toolUseResponse({ items: [VALID_ITEM] }, "report_meal_analysis"),
    );

    const service = new AnthropicVisionService();
    const result = await service.analyzeMealImage({
      imageBuffer: Buffer.from("fake"),
      mimeType: "image/jpeg",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      foodName: "Grilled chicken breast",
      portionGrams: 180,
      calories: 297, // 165 * 1.8
      protein: 55.8,
      carbs: 0,
      fat: 6.48,
      confidence: 0.91,
      alternatives: [],
      per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("retries once with a repair prompt when the tool input fails schema validation, then succeeds", async () => {
    mockCreate
      .mockResolvedValueOnce(
        toolUseResponse(
          { items: [{ ...VALID_ITEM, confidence: 1.5 }] }, // invalid: out of range
          "report_meal_analysis",
        ),
      )
      .mockResolvedValueOnce(
        toolUseResponse({ items: [VALID_ITEM] }, "report_meal_analysis"),
      );

    const service = new AnthropicVisionService();
    const result = await service.analyzeMealImage({
      imageBuffer: Buffer.from("fake"),
      mimeType: "image/jpeg",
    });

    expect(result.items).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);

    const secondCallArgs = mockCreate.mock.calls[1][0];
    const lastMessage =
      secondCallArgs.messages[secondCallArgs.messages.length - 1];
    expect(lastMessage.role).toBe("user");
    expect(lastMessage.content[0].type).toBe("tool_result");
    expect(lastMessage.content[0].is_error).toBe(true);
  });

  it("throws VisionAnalysisFailedError if schema validation fails twice", async () => {
    mockCreate.mockResolvedValue(
      toolUseResponse(
        { items: [{ ...VALID_ITEM, confidence: 1.5 }] },
        "report_meal_analysis",
      ),
    );

    const service = new AnthropicVisionService();
    await expect(
      service.analyzeMealImage({
        imageBuffer: Buffer.from("fake"),
        mimeType: "image/jpeg",
      }),
    ).rejects.toBeInstanceOf(VisionAnalysisFailedError);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("throws VisionAnalysisFailedError if the model never calls the tool", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "I cannot help with that." }],
    });

    const service = new AnthropicVisionService();
    await expect(
      service.analyzeMealImage({
        imageBuffer: Buffer.from("fake"),
        mimeType: "image/jpeg",
      }),
    ).rejects.toBeInstanceOf(VisionAnalysisFailedError);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("preserves exactly 3 alternatives for a low-confidence item", async () => {
    const macro = { calories: 100, protein: 1, carbs: 1, fat: 1 };
    const lowConfItem = {
      ...VALID_ITEM,
      confidence: 0.4,
      alternatives: [
        { foodName: "A", confidence: 0.3, per100g: macro },
        { foodName: "B", confidence: 0.2, per100g: macro },
        { foodName: "C", confidence: 0.1, per100g: macro },
      ],
    };
    mockCreate.mockResolvedValueOnce(
      toolUseResponse({ items: [lowConfItem] }, "report_meal_analysis"),
    );

    const service = new AnthropicVisionService();
    const result = await service.analyzeMealImage({
      imageBuffer: Buffer.from("fake"),
      mimeType: "image/jpeg",
    });

    expect(result.items[0].confidence).toBeLessThan(0.7);
    expect(result.items[0].alternatives).toHaveLength(3);
  });

  it("rethrows a network timeout as VisionServiceTimeoutError", async () => {
    mockCreate.mockRejectedValueOnce(new APIConnectionTimeoutError());

    const service = new AnthropicVisionService();
    await expect(
      service.analyzeMealImage({
        imageBuffer: Buffer.from("fake"),
        mimeType: "image/jpeg",
      }),
    ).rejects.toBeInstanceOf(VisionServiceTimeoutError);
  });

  it("returns an empty array for an empty search query without calling the model", async () => {
    const service = new AnthropicVisionService();
    const results = await service.searchFoods("   ");
    expect(results).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("searchFoods returns validated results from the model", async () => {
    mockCreate.mockResolvedValueOnce(
      toolUseResponse(
        { results: [BANANA_SEARCH_RESULT] },
        "report_food_search_results",
      ),
    );

    const service = new AnthropicVisionService();
    const results = await service.searchFoods("banana");
    expect(results).toEqual([BANANA_SEARCH_RESULT]);
  });

  it("getFoodByName finds an exact case-insensitive match among search results", async () => {
    mockCreate.mockResolvedValueOnce(
      toolUseResponse(
        {
          results: [
            {
              foodName: "Brown rice, cooked",
              per100g: { calories: 123, protein: 2.7, carbs: 26, fat: 1 },
            },
            {
              foodName: "White rice, cooked",
              per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
            },
          ],
        },
        "report_food_search_results",
      ),
    );

    const service = new AnthropicVisionService();
    const result = await service.getFoodByName("white rice, cooked");
    expect(result?.foodName).toBe("White rice, cooked");
  });

  it("getFoodByName returns null when there is no exact match", async () => {
    mockCreate.mockResolvedValueOnce(
      toolUseResponse(
        {
          results: [
            {
              foodName: "Something else entirely",
              per100g: { calories: 1, protein: 1, carbs: 1, fat: 1 },
            },
          ],
        },
        "report_food_search_results",
      ),
    );

    const service = new AnthropicVisionService();
    const result = await service.getFoodByName("not a match");
    expect(result).toBeNull();
  });
});
