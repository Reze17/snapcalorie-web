import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/server/repositories/users";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const user = await getUserById(session.user.id);
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
