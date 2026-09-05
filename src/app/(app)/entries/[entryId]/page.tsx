import { notFound, redirect } from "next/navigation";
import { getEffectiveUser } from "@/server/dev-bypass";
import { getEntryWithItems } from "@/server/repositories/meal-entries";
import { createPresignedDownloadUrl } from "@/server/storage/presign";
import type { DetectedFood } from "@/server/vision/types";
import { EntryDetailView, type EditableItem } from "./EntryDetailView";

function toDetectedFood(item: {
  foodName: string;
  portionGrams: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  aiConfidence: string | null;
}): DetectedFood {
  const grams = Number(item.portionGrams);
  const factor = grams > 0 ? 100 / grams : 0;
  const calories = Number(item.calories);
  const protein = Number(item.protein);
  const carbs = Number(item.carbs);
  const fat = Number(item.fat);

  return {
    foodName: item.foodName,
    portionGrams: grams,
    calories,
    protein,
    carbs,
    fat,
    confidence: item.aiConfidence ? Number(item.aiConfidence) : 1,
    alternatives: [],
    // meal_items doesn't persist per100g, so it's reconstructed from the
    // stored absolute values — exact modulo the 2-decimal rounding already
    // baked into those values.
    per100g: {
      calories: calories * factor,
      protein: protein * factor,
      carbs: carbs * factor,
      fat: fat * factor,
    },
  };
}

export default async function EntryDetailPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const user = await getEffectiveUser();
  if (!user) {
    redirect("/login");
  }

  const { entryId } = await params;
  const entryWithItems = await getEntryWithItems(entryId);
  if (!entryWithItems || entryWithItems.entry.userId !== user.id) {
    notFound();
  }

  const photoUrl = await createPresignedDownloadUrl(
    entryWithItems.entry.imageStoragePath,
  );
  const initialItems: EditableItem[] = entryWithItems.items.map((item) => ({
    localId: item.itemId,
    item: toDetectedFood(item),
    isUserEdited: item.isUserEdited ?? false,
  }));

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Meal detail</h1>
      {/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, not something next/image can optimize */}
      <img
        src={photoUrl}
        alt=""
        className="w-full rounded-lg border border-white/10 object-cover"
      />
      <EntryDetailView entryId={entryId} initialItems={initialItems} />
    </main>
  );
}
