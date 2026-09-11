import { describe, expect, it } from "vitest";
import { distributeMealBudget } from "./meal-budget";

describe("distributeMealBudget", () => {
  it("splits 25/30/35/10 and always sums back to the target", () => {
    const budget = distributeMealBudget(1850);
    expect(budget).toEqual({
      breakfast: 463,
      lunch: 555,
      dinner: 648,
      snacks: 184,
    });
    expect(
      budget.breakfast + budget.lunch + budget.dinner + budget.snacks,
    ).toBe(1850);
  });

  it("still sums exactly for a target that doesn't divide evenly", () => {
    const budget = distributeMealBudget(2001);
    expect(
      budget.breakfast + budget.lunch + budget.dinner + budget.snacks,
    ).toBe(2001);
  });
});
