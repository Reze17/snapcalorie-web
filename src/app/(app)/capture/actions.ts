"use server";

import { auth } from "@/auth";
import { createPresignedUploadUrl } from "@/server/storage/presign";

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

/** userId always comes from the session — never trust a client-supplied id. */
export async function requestUploadUrl(): Promise<PresignedUpload> {
  const session = await auth();
  if (!session?.user) {
    throw new Error("You must be signed in to upload a photo.");
  }
  return createPresignedUploadUrl(session.user.id);
}
