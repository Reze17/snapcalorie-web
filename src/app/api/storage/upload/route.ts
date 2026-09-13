import { NextResponse } from "next/server";
import { saveInMemoryStorage } from "@/server/storage/objects";

export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
  }

  const arrayBuffer = await req.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = req.headers.get("content-type") || "image/jpeg";

  saveInMemoryStorage(key, buffer, contentType);

  return new NextResponse(null, { status: 200 });
}

export async function POST(req: Request) {
  return PUT(req);
}
