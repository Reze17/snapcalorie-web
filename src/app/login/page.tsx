import Link from "next/link";
import { signIn } from "@/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-screen-sm flex-col justify-center gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold">Log in</h1>
      <LoginForm callbackUrl={callbackUrl} />
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: callbackUrl || "/dashboard" });
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
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
