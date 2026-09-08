// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runVisionServiceContractTests } from "./contract";
import { VisionAnalysisFailedError, VisionServiceTimeoutError } from "./errors";
import { OllamaVisionService } from "./ollama-vision-service";

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

function chatResponse(content: unknown): Response {
  return new Response(
    JSON.stringify({
      message: { role: "assistant", content: JSON.stringify(content) },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function isAnalysisRequest(body: string): boolean {
  return body.includes("nutrition estimation assistant");
}

const mockFetch = vi.fn();

function defaultMockFetch(_url: string, init?: RequestInit) {
  const body = String(init?.body ?? "");
  if (isAnalysisRequest(body)) {
    return Promise.resolve(chatResponse({ items: [VALID_ITEM] }));
  }
  return Promise.resolve(chatResponse({ results: [BANANA_SEARCH_RESULT] }));
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(defaultMockFetch);
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

runVisionServiceContractTests(
  "OllamaVisionService (mocked)",
  () => new OllamaVisionService(),
);

describe("OllamaVisionService", () => {
  it("computes absolute macros from per100g x portionGrams, ignoring model arithmetic", async () => {
    mockFetch.mockResolvedValueOnce(chatResponse({ items: [VALID_ITEM] }));

    const service = new OllamaVisionService();
    const result = await service.analyzeMealImage({
      imageBuffer: Buffer.from("fake"),
      mimeType: "image/jpeg",
    });

    expect(result.items).toEqual([
      {
        foodName: "Grilled chicken breast",
        portionGrams: 180,
        calories: 297, // 165 * 1.8
        protein: 55.8,
        carbs: 0,
        fat: 6.48,
        confidence: 0.91,
        alternatives: [],
        per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
      },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Sends the image as base64 in the request body, no data: URI prefix.
    const requestBody = JSON.parse(String(mockFetch.mock.calls[0][1].body));
    expect(requestBody.messages[1].images[0]).toBe(
      Buffer.from("fake").toString("base64"),
    );
  });

  it("posts to the configured Ollama host and model", async () => {
    process.env.VISION_OLLAMA_HOST = "http://localhost:9999";
    process.env.VISION_OLLAMA_MODEL = "custom-vision-model";
    mockFetch.mockResolvedValueOnce(chatResponse({ items: [VALID_ITEM] }));

    const service = new OllamaVisionService();
    await service.analyzeMealImage({
      imageBuffer: Buffer.from("fake"),
      mimeType: "image/jpeg",
    });

    const [url] = mockFetch.mock.calls[0];
    const requestBody = JSON.parse(String(mockFetch.mock.calls[0][1].body));
    expect(url).toBe("http://localhost:9999/api/chat");
    expect(requestBody.model).toBe("custom-vision-model");

    delete process.env.VISION_OLLAMA_HOST;
    delete process.env.VISION_OLLAMA_MODEL;
  });

  it("retries once with a repair message when the response isn't valid JSON, then succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: { role: "assistant", content: "not json at all" },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(chatResponse({ items: [VALID_ITEM] }));

    const service = new OllamaVisionService();
    const result = await service.analyzeMealImage({
      imageBuffer: Buffer.from("fake"),
      mimeType: "image/jpeg",
    });

    expect(result.items).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries once with a repair message when the JSON fails schema validation, then succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce(
        chatResponse({ items: [{ ...VALID_ITEM, confidence: 1.5 }] }), // invalid: out of range
      )
      .mockResolvedValueOnce(chatResponse({ items: [VALID_ITEM] }));

    const service = new OllamaVisionService();
    const result = await service.analyzeMealImage({
      imageBuffer: Buffer.from("fake"),
      mimeType: "image/jpeg",
    });

    expect(result.items).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const secondCallBody = JSON.parse(String(mockFetch.mock.calls[1][1].body));
    const lastMessage =
      secondCallBody.messages[secondCallBody.messages.length - 1];
    expect(lastMessage.role).toBe("user");
    expect(lastMessage.content).toContain("did not match the required schema");
  });

  it("throws VisionAnalysisFailedError if schema validation fails twice", async () => {
    // A fresh Response per call — a Response body can only be read once,
    // and the retry loop reads it twice across two separate fetch calls.
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        chatResponse({ items: [{ ...VALID_ITEM, confidence: 1.5 }] }),
      ),
    );

    const service = new OllamaVisionService();
    await expect(
      service.analyzeMealImage({
        imageBuffer: Buffer.from("fake"),
        mimeType: "image/jpeg",
      }),
    ).rejects.toBeInstanceOf(VisionAnalysisFailedError);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws VisionAnalysisFailedError if the response is never valid JSON", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ message: { role: "assistant", content: "nope" } }),
          { status: 200 },
        ),
      ),
    );

    const service = new OllamaVisionService();
    await expect(
      service.analyzeMealImage({
        imageBuffer: Buffer.from("fake"),
        mimeType: "image/jpeg",
      }),
    ).rejects.toBeInstanceOf(VisionAnalysisFailedError);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("rethrows an aborted request (timeout) as VisionServiceTimeoutError", async () => {
    mockFetch.mockImplementationOnce(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });

    const service = new OllamaVisionService();
    await expect(
      service.analyzeMealImage({
        imageBuffer: Buffer.from("fake"),
        mimeType: "image/jpeg",
      }),
    ).rejects.toBeInstanceOf(VisionServiceTimeoutError);
  });

  it("gives a clear, actionable error when Ollama isn't reachable", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.reject(new Error("ECONNREFUSED")),
    );

    const service = new OllamaVisionService();
    await expect(
      service.analyzeMealImage({
        imageBuffer: Buffer.from("fake"),
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow(/ollama serve/i);
  });

  it("surfaces a clear error (mentioning ollama pull) when the model returns a non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("model not found", { status: 404, statusText: "Not Found" }),
    );

    const service = new OllamaVisionService();
    await expect(
      service.analyzeMealImage({
        imageBuffer: Buffer.from("fake"),
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow(/ollama pull/i);
  });

  it("returns an empty array for an empty search query without calling the model", async () => {
    const service = new OllamaVisionService();
    const results = await service.searchFoods("   ");
    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("searchFoods returns validated results from the model", async () => {
    mockFetch.mockResolvedValueOnce(
      chatResponse({ results: [BANANA_SEARCH_RESULT] }),
    );

    const service = new OllamaVisionService();
    const results = await service.searchFoods("banana");
    expect(results).toEqual([BANANA_SEARCH_RESULT]);
  });

  it("getFoodByName finds an exact case-insensitive match among search results", async () => {
    mockFetch.mockResolvedValueOnce(
      chatResponse({
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
      }),
    );

    const service = new OllamaVisionService();
    const result = await service.getFoodByName("white rice, cooked");
    expect(result?.foodName).toBe("White rice, cooked");
  });
});
