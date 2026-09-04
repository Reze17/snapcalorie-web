export class InvalidFileTypeError extends Error {
  constructor(mimeType: string) {
    super(
      `"${mimeType || "unknown"}" is not a supported image type. Please choose a JPEG, PNG, HEIC, or WebP photo.`,
    );
    this.name = "InvalidFileTypeError";
  }
}

export class FileTooLargeError extends Error {
  constructor(sizeBytes: number, maxBytes: number) {
    const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
    super(
      `That photo is ${sizeMb}MB, which is over the ${maxMb}MB limit. Try a smaller photo.`,
    );
    this.name = "FileTooLargeError";
  }
}
