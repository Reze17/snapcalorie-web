import { redirect } from "next/navigation";
import { getUserById } from "@/server/repositories/users";
import { getEffectiveUser } from "@/server/dev-bypass";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const effectiveUser = await getEffectiveUser();
  if (!effectiveUser) {
    redirect("/login");
  }

  const user = await getUserById(effectiveUser.id);
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Profile</h1>
      <ProfileForm
        dailyCalorieTarget={user.dailyCalorieTarget}
        timezone={user.timezone}
      />
    </main>
  );
}
