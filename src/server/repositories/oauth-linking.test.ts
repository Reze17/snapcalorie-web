// @vitest-environment node
//
// FR-01 requires that a Google sign-in with the same email as an existing
// credentials account reuses that user record. Auth.js's OAuth login flow
// (see node_modules/@auth/core/lib/actions/callback/handle-login.js) makes
// that decision using getUserByEmail + linkAccount from the adapter, gated
// by allowDangerousEmailAccountLinking (set on the Google provider in
// src/auth.ts). A real end-to-end Google consent screen can't run in this
// environment, so this test instead proves the adapter/schema wiring that
// mechanism depends on: an OAuth account linked to an existing user by
// email resolves back to that same user id.
import { randomUUID } from "node:crypto";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

const adapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

describe("OAuth account linking (adapter wiring)", () => {
  const email = `oauth-test-${randomUUID()}@snapcalorie.dev`;
  let userId: string;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash: "irrelevant-for-this-test" })
      .returning();
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it("links a Google account to the existing user found by email", async () => {
    const byEmail = await adapter.getUserByEmail?.(email);
    expect(byEmail?.id).toBe(userId);

    await adapter.linkAccount?.({
      userId,
      type: "oauth",
      provider: "google",
      providerAccountId: "google-subject-123",
    });

    const byAccount = await adapter.getUserByAccount?.({
      provider: "google",
      providerAccountId: "google-subject-123",
    });

    expect(byAccount?.id).toBe(userId);
    expect(byAccount?.email).toBe(email);
  });
});
