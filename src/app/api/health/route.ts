import { NextResponse } from "next/server";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { s3Client, S3_BUCKET } from "@/server/storage/s3-client";

const CHECK_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

async function checkDb(): Promise<boolean> {
  try {
    await withTimeout(db.execute(sql`SELECT 1`), CHECK_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

async function checkStorage(): Promise<boolean> {
  try {
    await withTimeout(
      s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET })),
      CHECK_TIMEOUT_MS,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Ops health check (FRD §6): no auth (standard for infra probes), and
 * deliberately generic on failure — never surface the underlying DB/S3
 * error text, which could include connection strings or internal hosts.
 */
export async function GET() {
  const [dbOk, storageOk] = await Promise.all([checkDb(), checkStorage()]);
  const healthy = dbOk && storageOk;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "unhealthy",
      checks: { db: dbOk, storage: storageOk },
    },
    { status: healthy ? 200 : 503 },
  );
}
