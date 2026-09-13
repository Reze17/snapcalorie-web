import Link from "next/link";
import { signIn } from "@/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="flex flex-col items-center mb-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/20 shadow-sm">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C11.5 2 11 2.5 11 3C11 5.5 9 7.5 9 10C9 12.5 10.5 14.5 12 15C13.5 14.5 15 12.5 15 10C15 7.5 13 5.5 13 3C13 2.5 12.5 2 12 2ZM12 17C9.2 17 7 14.8 7 12C7 9.8 8.4 8 10 7.3C9.4 8.7 9.5 10.5 10.5 11.7C11.5 12.9 13.1 13.5 14.5 13.1C14.1 15.4 12.2 17 12 17Z" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Log in to your SnapCalorie account
        </p>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8 shadow-xl shadow-black/5 backdrop-blur-sm">
        {error && (
          <div className="mb-6 rounded-xl border border-err/30 bg-err-soft p-3.5 text-sm text-err flex items-center gap-3">
            <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              {error === "OAuthCallbackError" || error === "OAuthAccountNotLinked"
                ? "Google authentication failed or was cancelled. Please try again."
                : "Authentication failed. Please try again."}
            </span>
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl || "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="group flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm font-semibold text-text shadow-sm transition-all hover:bg-surface-3 hover:border-text-faint/30 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 cursor-pointer"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>
        </form>

        <div className="relative my-6 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative bg-surface px-3 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
            or continue with email
          </div>
        </div>

        <LoginForm callbackUrl={callbackUrl} />
      </div>

      <p className="mt-8 text-center text-sm text-text-muted">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-semibold text-accent hover:text-accent-strong hover:underline transition-colors"
        >
          Sign up
        </Link>
      </p>
    </main>
  );
}

