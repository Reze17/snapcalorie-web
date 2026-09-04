"use client";

import { useActionState } from "react";
import { signupAction, type SignupState } from "./actions";

const initialState: SignupState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(
    signupAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded border border-white/20 bg-transparent px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded border border-white/20 bg-transparent px-3 py-2"
        />
      </label>
      {state.error && (
        <p className="text-sm text-[var(--foreground)]/70">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
