import { JPEG_QUALITY, MAX_UPLOAD_BYTES } from "./constants";
import { FileTooLargeError, InvalidFileTypeError } from "./errors";
import { computeDownsampleDimensions } from "./resize";

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
}

export function validateImageFile(file: File): void {
  const isImage =
    file.type.startsWith("image/") ||
    /\.(jpg|jpeg|png|webp|heic|heif|gif)$/i.test(file.name) ||
    !file.type;
  if (!isImage) {
    throw new InvalidFileTypeError(file.type);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new FileTooLargeError(file.size, MAX_UPLOAD_BYTES);
  }
}


type DrawableImage = ImageBitmap | HTMLImageElement;

async function loadDrawableImage(file: File): Promise<DrawableImage> {
  // No manual EXIF-orientation correction here: every current evergreen
  // browser (verified against Chromium — see CLAUDE.md) already decodes
  // JPEGs pre-rotated according to their EXIF orientation tag for both
  // createImageBitmap and <img>/naturalWidth-naturalHeight, with no way to
  // opt out (imageOrientation: "none" is not honored). bitmap.width/height
  // below are therefore already display-correct; do not add a transform
  // on top of them, or portrait photos will rotate twice.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> based loader below (older/odd browsers,
      // or a format createImageBitmap can't decode but <img> can).
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("This file could not be read as an image."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function closeIfBitmap(image: DrawableImage): void {
  if ("close" in image) {
    image.close();
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to encode the processed image."));
        }
      },
      type,
      quality,
    );
  });
}

/**
 * Validates and downsamples an image file for upload. Skips the canvas
 * round-trip entirely when the image is already within the size budget,
 * to avoid needless re-encoding.
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  validateImageFile(file);

  const image = await loadDrawableImage(file);

  try {
    const sourceWidth = image.width;
    const sourceHeight = image.height;
    const targetSize = computeDownsampleDimensions(sourceWidth, sourceHeight);
    const needsResize =
      targetSize.width !== sourceWidth || targetSize.height !== sourceHeight;

    if (!needsResize) {
      return { blob: file, width: sourceWidth, height: sourceHeight };
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetSize.width;
    canvas.height = targetSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context is unavailable in this browser.");
    }

    ctx.drawImage(image, 0, 0, targetSize.width, targetSize.height);

    const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
    return { blob, width: targetSize.width, height: targetSize.height };
  } finally {
    closeIfBitmap(image);
  }
}
