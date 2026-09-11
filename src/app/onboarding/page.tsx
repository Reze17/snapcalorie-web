import { redirect } from "next/navigation";
import { getEffectiveUser } from "@/server/dev-bypass";
import { OnboardingWizard } from "./OnboardingWizard";

// Deliberately its own top-level route, not inside the (app) layout — no
// bottom nav or other chrome to distract from a short, focused flow, and
// no risk of the (app) group's own gating logic looping back here.
export default async function OnboardingPage() {
  const user = await getEffectiveUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-screen-sm flex-col bg-bg px-5 py-6">
      <OnboardingWizard />
    </div>
  );
}
