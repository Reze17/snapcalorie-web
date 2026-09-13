import { S3Client } from "@aws-sdk/client-s3";

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID !== "mock",
  );
}

const endpoint = process.env.S3_ENDPOINT || undefined;

export const s3Client = isStorageConfigured()
  ? new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint,
      forcePathStyle: Boolean(endpoint),
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "mock",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "mock",
      },
    })
  : (null as unknown as S3Client);

export const S3_BUCKET = process.env.S3_BUCKET || "snapcalorie-meals";

