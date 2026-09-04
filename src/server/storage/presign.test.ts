// @vitest-environment node
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { s3Client } from "./s3-client";
import {
  buildMealImageKey,
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  PRESIGNED_URL_EXPIRY_SECONDS,
} from "./presign";

describe("buildMealImageKey", () => {
  it("matches users/{userId}/meals/{uuid}.jpg", () => {
    const key = buildMealImageKey("abc-123");
    expect(key).toMatch(
      /^users\/abc-123\/meals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
    );
  });

  it("generates a different key on every call", () => {
    expect(buildMealImageKey("u1")).not.toBe(buildMealImageKey("u1"));
  });
});

describe("presigned URLs against the local object store", () => {
  it("uploads via the presigned PUT URL and reads it back via a presigned GET", async () => {
    const { key, uploadUrl } = await createPresignedUploadUrl("test-user");

    const body = new Uint8Array([1, 2, 3, 4]);
    const putResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body,
    });
    expect(putResponse.ok).toBe(true);

    // Confirms the object actually landed at the expected key.
    await s3Client.send(
      new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );

    const downloadUrl = await createPresignedDownloadUrl(key);
    const getResponse = await fetch(downloadUrl);
    expect(getResponse.ok).toBe(true);
    const bytes = new Uint8Array(await getResponse.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it("a GET without the presigned query string is rejected (object is private)", async () => {
    const { key } = await createPresignedUploadUrl("test-user-2");
    const baseUrl = new URL(process.env.S3_ENDPOINT ?? "");
    const plainUrl = `${baseUrl.origin}/${process.env.S3_BUCKET}/${key}`;

    const response = await fetch(plainUrl);
    expect(response.ok).toBe(false);
  });

  it("the presigned upload URL expires in exactly 15 minutes", async () => {
    expect(PRESIGNED_URL_EXPIRY_SECONDS).toBe(15 * 60);

    const { uploadUrl } = await createPresignedUploadUrl("test-user");
    const url = new URL(uploadUrl);
    expect(url.searchParams.get("X-Amz-Expires")).toBe(
      String(PRESIGNED_URL_EXPIRY_SECONDS),
    );
  });
});
