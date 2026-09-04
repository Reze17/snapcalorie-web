"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { updateUserProfile } from "@/server/repositories/users";
import { profileSchema } from "@/server/validation/profile";

export interface ProfileState {
  error?: string;
  success?: boolean;
}

export async function updateProfileAction(
  _prevState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "You must be signed in" };
  }

  const parsed = profileSchema.safeParse({
    dailyCalorieTarget: formData.get("dailyCalorieTarget"),
    timezone: formData.get("timezone"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await updateUserProfile(session.user.id, parsed.data);
  revalidatePath("/profile");
  return { success: true };
}
