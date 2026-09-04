import "dotenv/config";
import { DateTime } from "luxon";
import { db } from "./client";
import { users } from "./schema";
import { createMealEntryWithItems } from "@/server/repositories/meal-entries";

const DEMO_EMAIL = "demo@snapcalorie.dev";
const DEMO_TIMEZONE = "America/Los_Angeles";
const DEMO_TARGET = 2000;

async function seedDemoUser() {
  const [user] = await db
    .insert(users)
    .values({
      email: DEMO_EMAIL,
      timezone: DEMO_TIMEZONE,
      dailyCalorieTarget: DEMO_TARGET,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { timezone: DEMO_TIMEZONE, dailyCalorieTarget: DEMO_TARGET },
    })
    .returning();

  const today = DateTime.now().setZone(DEMO_TIMEZONE).startOf("day");

  for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
    const day = today.minus({ days: dayOffset });

    // One deliberately empty day, to exercise the "no entries" case.
    if (dayOffset === 5) {
      continue;
    }

    // One deliberately over-target day.
    const overTarget = dayOffset === 2;

    const meals = overTarget
      ? [
          { hour: 8, calories: 700, protein: 30, carbs: 80, fat: 25 },
          { hour: 13, calories: 900, protein: 40, carbs: 100, fat: 35 },
          { hour: 19, calories: 950, protein: 45, carbs: 90, fat: 40 },
        ]
      : [
          { hour: 8, calories: 450, protein: 25, carbs: 50, fat: 15 },
          { hour: 13, calories: 650, protein: 35, carbs: 70, fat: 20 },
          { hour: 19, calories: 600, protein: 30, carbs: 60, fat: 22 },
        ];

    for (const meal of meals) {
      await createMealEntryWithItems({
        userId: user.id,
        imageStoragePath: `seed/${day.toISODate()}-${meal.hour}.jpg`,
        totalCalories: meal.calories.toFixed(2),
        totalProtein: meal.protein.toFixed(2),
        totalCarbs: meal.carbs.toFixed(2),
        totalFat: meal.fat.toFixed(2),
        loggedAt: day.set({ hour: meal.hour }).toJSDate(),
        items: [
          {
            foodName: "Seed meal",
            portionGrams: "300.00",
            calories: meal.calories.toFixed(2),
            protein: meal.protein.toFixed(2),
            carbs: meal.carbs.toFixed(2),
            fat: meal.fat.toFixed(2),
            aiConfidence: "0.90",
          },
        ],
      });
    }
  }

  console.log(`Seeded demo user ${user.email} (${user.id})`);
}

seedDemoUser()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
