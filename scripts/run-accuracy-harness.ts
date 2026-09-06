import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { buildAccuracyReport } from "@/lib/accuracy-scoring";
import { getVisionService } from "@/server/vision/factory";

const REPO_ROOT = path.join(__dirname, "..");
const FIXTURES_PATH = path.join(
  REPO_ROOT,
  "fixtures",
  "accuracy",
  "cases.json",
);
const ACCURACY_TARGET_PERCENT = 85;

interface FixtureCase {
  id: string;
  imagePath: string;
  expectedFoods: string[];
  note?: string;
}

async function main() {
  const raw = await fs.readFile(FIXTURES_PATH, "utf-8");
  const fixtures: FixtureCase[] = JSON.parse(raw);

  const vision = getVisionService();
  const provider = process.env.VISION_PROVIDER ?? "mock";

  const cases = await Promise.all(
    fixtures.map(async (fixture) => {
      const imageBuffer = await fs.readFile(
        path.join(REPO_ROOT, fixture.imagePath),
      );
      const result = await vision.analyzeMealImage({
        imageBuffer,
        mimeType: "image/jpeg",
      });
      return {
        id: fixture.id,
        expectedFoods: fixture.expectedFoods,
        detectedFoods: result.items.map((item) => item.foodName),
      };
    }),
  );

  const report = buildAccuracyReport(cases);

  console.log(`\nAccuracy harness — provider: ${provider}\n`);
  for (const c of report.cases) {
    const fixture = fixtures.find((f) => f.id === c.id);
    console.log(
      `${c.id}: ${c.matchedCount}/${c.totalExpected} expected foods matched top-3`,
    );
    console.log(`  expected: ${c.expectedFoods.join(", ")}`);
    console.log(`  detected (top-3): ${c.topDetected.join(", ")}`);
    if (fixture?.note) console.log(`  note: ${fixture.note}`);
    console.log("");
  }

  console.log(
    `Overall top-3 accuracy: ${report.accuracyPercentage}% (${report.totalMatched}/${report.totalExpected}) — FRD §7 target: >=${ACCURACY_TARGET_PERCENT}%`,
  );

  if (provider !== "anthropic") {
    console.log(
      "\nNote: this ran against the MOCK provider, which always returns the same\n" +
        "fixed 3-item output regardless of the input photo. This run proves the\n" +
        "harness itself works end to end (it correctly scores both the matching\n" +
        "and the deliberately-wrong fixture case) — it is NOT a real accuracy\n" +
        "measurement. To measure real accuracy: set VISION_PROVIDER=anthropic and\n" +
        "VISION_API_KEY in .env, then replace fixtures/accuracy/cases.json with a\n" +
        "labeled set of real, varied meal photos and their true contents.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
