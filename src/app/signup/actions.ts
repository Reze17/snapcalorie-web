"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn } from "@/auth";
import { checkRateLimit } from "@/server/lib/rate-limit";
import {
  createUserWithPassword,
  getUserByEmail,
} from "@/server/repositories/users";
import { signupSchema } from "@/server/validation/auth";

export interface SignupState {
  error?: string;
}

// FRD §6: rate-limit auth endpoints. Per-IP here (not per-email, since a
// new email is created on every legitimate signup) — bounds mass account
// creation from one source. Every local request (dev server, e2e suite,
// this file's own manual testing) collapses onto one shared loopback-IP
// bucket, so this needs real headroom for many e2e runs across a day of
// iteration, not just a single run — set from hitting exactly this limit
// firsthand during Phase 10 testing (30/hour was already too tight).
// Without a captcha/email-verification layer, 30 vs. 200 barely changes
// what a determined scripted attacker could do anyway; either number is
// really only a speed bump.
const SIGNUP_RATE_LIMIT = 200;
const SIGNUP_RATE_WINDOW_SECONDS = 60 * 60;

async function getClientIp(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function signupAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const ip = await getClientIp();
  const rateLimit = await checkRateLimit(
    `signup:${ip}`,
    SIGNUP_RATE_LIMIT,
    SIGNUP_RATE_WINDOW_SECONDS,
  );
  if (!rateLimit.allowed) {
    return { error: "Too many signup attempts. Please try again later." };
  }

  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, password } = parsed.data;

  const existing = await getUserByEmail(email);
  if (existing) {
    return { error: "An account with this email already exists" };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await createUserWithPassword(email, passwordHash);

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Try logging in." };
    }
    throw err;
  }

  return {};
}
