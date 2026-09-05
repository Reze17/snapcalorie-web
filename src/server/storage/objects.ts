import { GetObjectCommand } from "@aws-sdk/client-s3";
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
