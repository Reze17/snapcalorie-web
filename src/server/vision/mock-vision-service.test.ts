import { describe, expect, it } from "vitest";
import { runVisionServiceContractTests } from "./contract";
import { VisionServiceTimeoutError } from "./errors";
import { MockVisionService } from "./mock-vision-service";

runVisionServiceContractTests(
  "MockVisionService",
  () => new MockVisionService(),
);

describe("MockVisionService", () => {
  it("returns a deterministic 3-item plate by default", async () => {
    const service = new MockVisionService();
    const result = await service.analyzeMealImage({
      imageBuffer: Buffer.from(""),
      mimeType: "image/jpeg",
    });

    expect(result.items).toHaveLength(3);
    expect(result.items.map((item) => item.foodName)).toEqual([
      "Grilled chicken breast",
      "White rice, cooked",
      "Broccoli, steamed",
    ]);
    expect(result.items.every((item) => item.confidence >= 0.7)).toBe(true);
    expect(result.items.every((item) => item.portionGrams > 0)).toBe(true);
    expect(result.items.every((item) => item.alternatives.length === 0)).toBe(
      true,
    );

    const chicken = result.items[0];
    expect(chicken.portionGrams).toBe(180);
    expect(chicken.calories).toBeCloseTo(297, 5); // 165 kcal/100g * 1.8
    expect(chicken.per100g).toEqual({
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
    });
  });

  it("forces a low-confidence result with 3 alternatives per item", async () => {
    const service = new MockVisionService({ scenario: "lowConfidence" });
    const result = await service.analyzeMealImage({
      imageBuffer: Buffer.from(""),
      mimeType: "image/jpeg",
    });

    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(item.confidence).toBeLessThan(0.7);
      expect(item.alternatives).toHaveLength(3);
    }
  });

  it("forces a single-item plate", async () => {
    const service = new MockVisionService({ scenario: "singleItem" });
    const result = await service.analyzeMealImage({
      imageBuffer: Buffer.from(""),
      mimeType: "image/jpeg",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].foodName).toBe("Grilled chicken breast");
  });

  it("forces an empty (no food detected) result", async () => {
    const service = new MockVisionService({ scenario: "empty" });
    const result = await service.analyzeMealImage({
      imageBuffer: Buffer.from(""),
      mimeType: "image/jpeg",
    });

    expect(result.items).toHaveLength(0);
  });

  it("simulates a provider timeout", async () => {
    const service = new MockVisionService({
      scenario: "timeout",
      latencyMs: 10,
    });

    await expect(
      service.analyzeMealImage({
        imageBuffer: Buffer.from(""),
        mimeType: "image/jpeg",
      }),
    ).rejects.toBeInstanceOf(VisionServiceTimeoutError);
  });

  it("supports an artificial delay to test the latency budget", async () => {
    const service = new MockVisionService({ latencyMs: 50 });
    const start = Date.now();

    const result = await service.analyzeMealImage({
      imageBuffer: Buffer.from(""),
      mimeType: "image/jpeg",
    });

    expect(Date.now() - start).toBeGreaterThanOrEqual(45); // allow timer jitter
    expect(result.processingMs).toBeGreaterThanOrEqual(45);
  });

  it("searchFoods matches case-insensitively by substring", async () => {
    const service = new MockVisionService();
    const results = await service.searchFoods("RICE");
    expect(results.map((r) => r.foodName)).toContain("White rice, cooked");
  });

  it("getFoodByName resolves a known food by exact (case-insensitive) name", async () => {
    const service = new MockVisionService();
    const result = await service.getFoodByName("grilled chicken breast");
    expect(result).toEqual({
      foodName: "Grilled chicken breast",
      per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
    });
  });
});
