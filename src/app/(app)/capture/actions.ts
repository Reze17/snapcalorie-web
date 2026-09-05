"use server";

import { getEffectiveUser } from "@/server/dev-bypass";
import { createPresignedUploadUrl } from "@/server/storage/presign";

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

/** userId always comes from the effective (session or dev-bypass) user — never trust a client-supplied id. */
export async function requestUploadUrl(): Promise<PresignedUpload> {
  const user = await getEffectiveUser();
  if (!user) {
    throw new Error("You must be signed in to upload a photo.");
  }
  return createPresignedUploadUrl(user.id);
}
