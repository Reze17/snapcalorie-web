import { afterEach, describe, expect, it, vi } from "vitest";
import { FileTooLargeError, InvalidFileTypeError } from "./errors";
import { processImageFile, validateImageFile } from "./process";

function makeFile(options: {
  name?: string;
  type?: string;
  sizeBytes?: number;
}): File {
  const size = options.sizeBytes ?? 1024;
  const bytes = new Uint8Array(size);
  return new File([bytes], options.name ?? "photo.jpg", {
    type: options.type ?? "image/jpeg",
  });
}

describe("validateImageFile", () => {
  it("accepts a normal image file", () => {
    expect(() => validateImageFile(makeFile({}))).not.toThrow();
  });

  it("rejects a non-image file", () => {
    expect(() =>
      validateImageFile(makeFile({ type: "application/pdf", name: "doc.pdf" })),
    ).toThrow(InvalidFileTypeError);
  });

  it("rejects a file over 20MB", () => {
    expect(() =>
      validateImageFile(makeFile({ sizeBytes: 21 * 1024 * 1024 })),
    ).toThrow(FileTooLargeError);
  });

  it("accepts a file just at the 20MB limit", () => {
    expect(() =>
      validateImageFile(makeFile({ sizeBytes: 20 * 1024 * 1024 })),
    ).not.toThrow();
  });
});

describe("processImageFile", () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;

  afterEach(() => {
    globalThis.createImageBitmap = originalCreateImageBitmap;
    vi.clearAllMocks();
  });

  it("skips the canvas round-trip for an already-small, upright image", async () => {
    globalThis.createImageBitmap = vi
      .fn()
      .mockResolvedValue({ width: 800, height: 600, close: vi.fn() });

    const file = makeFile({});
    const result = await processImageFile(file);

    // Same reference back out is the signal that no canvas re-encode happened.
    expect(result.blob).toBe(file);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it("rejects an invalid file before ever touching image decoding", async () => {
    globalThis.createImageBitmap = vi.fn();
    const file = makeFile({ type: "text/plain", name: "notes.txt" });

    await expect(processImageFile(file)).rejects.toBeInstanceOf(
      InvalidFileTypeError,
    );
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it("goes through the canvas re-encode path for a huge (12MP) image", async () => {
    globalThis.createImageBitmap = vi
      .fn()
      .mockResolvedValue({ width: 4032, height: 3024, close: vi.fn() });

    const fakeCtx = { drawImage: vi.fn() };
    const fakeBlob = new Blob(["fake-jpeg-bytes"], { type: "image/jpeg" });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      fakeCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      function (this: HTMLCanvasElement, callback) {
        callback(fakeBlob);
      },
    );

    const file = makeFile({});
    const result = await processImageFile(file);

    expect(result.blob).toBe(fakeBlob); // a *new* blob, not the original file
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1440);
    expect(fakeCtx.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      1920,
      1440,
    );
  });
});
