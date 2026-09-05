import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";

// Local-only escape hatch: set DEV_BYPASS_AUTH=true in .env to hit
// /dashboard, /capture, /analyze, /profile etc. without signing in. Never
// set this outside a local .env — it is not read anywhere in CI or by
// default. See CLAUDE.md.
const DEV_BYPASS_ENABLED = process.env.DEV_BYPASS_AUTH === "true";
const DEV_USER_EMAIL = "dev-bypass@snapcalorie.local";

export interface EffectiveUser {
  id: string;
  email: string;
}

let devUserPromise: Promise<EffectiveUser> | null = null;

async function getOrCreateDevUser(): Promise<EffectiveUser> {
  if (!devUserPromise) {
    devUserPromise = (async () => {
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, DEV_USER_EMAIL));
      if (existing) {
        return { id: existing.id, email: existing.email };
      }
      const [created] = await db
        .insert(users)
        .values({ email: DEV_USER_EMAIL })
        .returning();
      return { id: created.id, email: created.email };
    })();
  }
  return devUserPromise;
}

/**
 * The signed-in user, or — only when DEV_BYPASS_AUTH=true and there's no
 * real session — a fixed auto-provisioned local dev user. Use this instead
 * of raw auth() anywhere a user id is needed to gate or scope an action.
 */
export async function getEffectiveUser(): Promise<EffectiveUser | null> {
  const session = await auth();
  if (session?.user) {
    return { id: session.user.id, email: session.user.email ?? "" };
  }
  if (DEV_BYPASS_ENABLED) {
    return getOrCreateDevUser();
  }
  return null;
}

export function isDevBypassEnabled(): boolean {
  return DEV_BYPASS_ENABLED;
}
