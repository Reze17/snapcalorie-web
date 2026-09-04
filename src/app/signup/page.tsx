import Link from "next/link";
import { signIn } from "@/auth";
import { SignupForm } from "./SignupForm";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-screen-sm flex-col justify-center gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <SignupForm />
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
      >
        <button
          type="submit"
          className="w-full rounded border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
        >
          Continue with Google
        </button>
      </form>
      <p className="text-sm text-[var(--foreground)]/70">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
