import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3_BUCKET, s3Client } from "./s3-client";

// Exactly 15 minutes, per FRD §6 Data Privacy — objects are private, and
// both the upload and any later read must go through short-lived
// presigned URLs, never a public bucket policy.
export const PRESIGNED_URL_EXPIRY_SECONDS = 15 * 60;

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

/** userId must come from the authenticated session, never client input. */
export function buildMealImageKey(userId: string): string {
  return `users/${userId}/meals/${randomUUID()}.jpg`;
}

export async function createPresignedUploadUrl(
  userId: string,
): Promise<PresignedUpload> {
  const key = buildMealImageKey(userId);
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: "image/jpeg",
  });
  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  });
  return { key, uploadUrl, expiresInSeconds: PRESIGNED_URL_EXPIRY_SECONDS };
}

/**
 * Only ever hand out a scoped read URL for a key — never make the bucket
 * or individual objects publicly readable.
 */
export async function createPresignedDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  return getSignedUrl(s3Client, command, {
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  });
}
