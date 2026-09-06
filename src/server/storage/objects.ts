import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { S3_BUCKET, s3Client } from "./s3-client";

export interface StoredObject {
  buffer: Buffer;
  contentType: string;
}

export async function getObjectBuffer(key: string): Promise<StoredObject> {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
  );
  if (!response.Body) {
    throw new Error(`Object "${key}" has no body`);
  }
  const bytes = await response.Body.transformToByteArray();
  return {
    buffer: Buffer.from(bytes),
    contentType: response.ContentType ?? "image/jpeg",
  };
}

/** Used by the export pipeline (Phase 9) to write a generated CSV/PDF once, off the request path. */
export async function putObjectBuffer(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}
