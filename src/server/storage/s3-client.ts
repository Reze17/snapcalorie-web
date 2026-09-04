import { S3Client } from "@aws-sdk/client-s3";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

// S3_ENDPOINT is unset against real AWS S3; set it (e.g.
// http://localhost:9000) to point at a local MinIO instead — forcePathStyle
// is required for MinIO, harmless against AWS.
const endpoint = process.env.S3_ENDPOINT || undefined;

export const s3Client = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint,
  forcePathStyle: Boolean(endpoint),
  credentials: {
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
  },
});

export const S3_BUCKET = requiredEnv("S3_BUCKET");
