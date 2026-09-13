import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { isStorageConfigured, S3_BUCKET, s3Client } from "./s3-client";

export interface StoredObject {
  buffer: Buffer;
  contentType: string;
}

declare global {
  var __memoryStorage:
    | Map<string, { buffer: Buffer; contentType: string }>
    | undefined;
}

function getMemoryStorage() {
  if (!globalThis.__memoryStorage) {
    globalThis.__memoryStorage = new Map();
  }
  return globalThis.__memoryStorage;
}

export function saveInMemoryStorage(
  key: string,
  buffer: Buffer,
  contentType: string,
) {
  getMemoryStorage().set(key, { buffer, contentType });
}

export function getFromMemoryStorage(key: string): StoredObject | undefined {
  return getMemoryStorage().get(key);
}

export async function getObjectBuffer(key: string): Promise<StoredObject> {
  const memoryObj = getFromMemoryStorage(key);
  if (memoryObj) {
    return memoryObj;
  }

  if (!isStorageConfigured()) {
    // Fallback minimal 1x1 JPEG buffer if nothing was stored
    const fallbackBuffer = Buffer.from(
      "ffffd8ffe000104a46494600010101006000600000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f00370000000001",
      "hex",
    );
    return { buffer: fallbackBuffer, contentType: "image/jpeg" };
  }

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
  saveInMemoryStorage(key, buffer, contentType);
  if (isStorageConfigured()) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }
}

