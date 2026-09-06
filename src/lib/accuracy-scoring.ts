// FRD §7 release metric: top-3 food identification accuracy (target >=85%).
// Pure scoring logic, deliberately separate from anything that calls a real
// vision provider — see scripts/run-accuracy-harness.ts for the part that
// actually loads fixtures and calls getVisionService().

export interface AccuracyCase {
  id: string;
  expectedFoods: string[];
  detectedFoods: string[];
}

export interface AccuracyCaseResult extends AccuracyCase {
  topDetected: string[];
  matchedCount: number;
  totalExpected: number;
}

export interface AccuracyReport {
  cases: AccuracyCaseResult[];
  totalExpected: number;
  totalMatched: number;
  accuracyPercentage: number;
}

const TOP_N = 3;

function normalize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "");
}

function tokenize(name: string): Set<string> {
  return new Set(normalize(name).split(/\s+/).filter(Boolean));
}

/**
 * Loose, word-order-independent match: a plain substring check first
 * ("chicken" in "grilled chicken breast"), then falling back to "every
 * word of the shorter phrase appears in the longer phrase" so a labeled
 * "chicken, grilled" still matches a detected "grilled chicken" — food
 * names legitimately vary in word order between a human label and a
 * model's output.
 */
function isMatch(expected: string, detected: string): boolean {
  const e = normalize(expected);
  const d = normalize(detected);
  if (!e || !d) return false;
  if (d.includes(e) || e.includes(d)) return true;

  const eTokens = tokenize(expected);
  const dTokens = tokenize(detected);
  const [shorter, longer] =
    eTokens.size <= dTokens.size ? [eTokens, dTokens] : [dTokens, eTokens];
  if (shorter.size === 0) return false;
  return Array.from(shorter).every((word) => longer.has(word));
}

export function scoreCase(caseInput: AccuracyCase): AccuracyCaseResult {
  const topDetected = caseInput.detectedFoods.slice(0, TOP_N);
  const matchedCount = caseInput.expectedFoods.filter((expected) =>
    topDetected.some((detected) => isMatch(expected, detected)),
  ).length;

  return {
    ...caseInput,
    topDetected,
    matchedCount,
    totalExpected: caseInput.expectedFoods.length,
  };
}

export function buildAccuracyReport(cases: AccuracyCase[]): AccuracyReport {
  const caseResults = cases.map(scoreCase);
  const totalExpected = caseResults.reduce(
    (sum, c) => sum + c.totalExpected,
    0,
  );
  const totalMatched = caseResults.reduce((sum, c) => sum + c.matchedCount, 0);
  const accuracyPercentage =
    totalExpected === 0
      ? 0
      : Math.round((totalMatched / totalExpected) * 10000) / 100;

  return {
    cases: caseResults,
    totalExpected,
    totalMatched,
    accuracyPercentage,
  };
}
