import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isStorageConfigured, S3_BUCKET, s3Client } from "./s3-client";

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

/** userId must come from the authenticated session, never client input. */
export function buildExportKey(
  userId: string,
  jobId: string,
  format: "csv" | "pdf",
): string {
  return `users/${userId}/exports/${jobId}.${format}`;
}

export async function createPresignedUploadUrl(
  userId: string,
): Promise<PresignedUpload> {
  const key = buildMealImageKey(userId);
  if (!isStorageConfigured()) {
    return {
      key,
      uploadUrl: `/api/storage/upload?key=${encodeURIComponent(key)}`,
      expiresInSeconds: PRESIGNED_URL_EXPIRY_SECONDS,
    };
  }

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
  if (!isStorageConfigured()) {
    return `/api/storage/download?key=${encodeURIComponent(key)}`;
  }
  const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  return getSignedUrl(s3Client, command, {
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  });
}

/**
 * Same as createPresignedDownloadUrl, but sets Content-Disposition/-Type on
 * the S3 response itself (ResponseContentDisposition/-Type are standard
 * S3 GetObject params) so the browser downloads with the right filename
 * without our server proxying the file's bytes.
 */
export async function createPresignedExportDownloadUrl(
  key: string,
  filename: string,
  contentType: string,
): Promise<string> {
  if (!isStorageConfigured()) {
    return `/api/storage/download?key=${encodeURIComponent(key)}`;
  }
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
    ResponseContentType: contentType,
  });
  return getSignedUrl(s3Client, command, {
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  });
}

