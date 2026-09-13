"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { processImageFile } from "@/lib/image/process";
import { uploadWithProgress } from "@/lib/upload";
import { requestUploadUrl } from "./actions";

type Status = "idle" | "preview" | "uploading" | "error";

interface ProcessedPhoto {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
}

export function CaptureFlow() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [photo, setPhoto] = useState<ProcessedPhoto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetPhoto = useCallback(() => {
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setErrorMessage(null);
      try {
        const { blob, width, height } = await processImageFile(file);
        const previewUrl = URL.createObjectURL(blob);
        resetPhoto();
        setPhoto({ blob, previewUrl, width, height });
        setStatus("preview");
      } catch (err) {
        setStatus("idle");
        setErrorMessage(
          err instanceof Error ? err.message : "Could not read that photo.",
        );
      }
    },
    [resetPhoto],
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = ""; // allow re-selecting the same file later
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const handleRetake = useCallback(() => {
    resetPhoto();
    setErrorMessage(null);
    setStatus("idle");
  }, [resetPhoto]);

  const handleConfirm = useCallback(async () => {
    if (!photo) return;
    setStatus("uploading");
    setErrorMessage(null);
    setProgress(0);
    // Warm the /analyze route's JS chunk while the upload is in flight —
    // we don't know the ?key= yet, but the route bundle itself is static,
    // so this shaves chunk-download time off the critical path on a slow
    // connection instead of only starting once the upload finishes.
    router.prefetch("/analyze");
    try {
      const { key, uploadUrl } = await requestUploadUrl();
      await uploadWithProgress(uploadUrl, photo.blob, setProgress);
      router.push(`/analyze?key=${encodeURIComponent(key)}`);
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
    }
  }, [photo, router]);

  const hiddenInputs = (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />
    </>
  );

  if (status === "preview" || status === "uploading" || status === "error") {
    return (
      <div className="flex w-full flex-col gap-4">
        {hiddenInputs}
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not something next/image can optimize
          <img
            src={photo.previewUrl}
            alt="Meal preview"
            className="aspect-[4/3] w-full rounded-2xl border border-border object-cover"
          />
        )}
        {status === "uploading" && (
          <div className="flex flex-col gap-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="num text-xs text-text-muted">
              Uploading… {progress}%
            </p>
          </div>
        )}
        {status === "error" && errorMessage && (
          <div className="flex gap-2 rounded-xl bg-err-soft px-3 py-2.5 text-xs text-err">
            {errorMessage}
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleRetake}
            disabled={status === "uploading"}
            className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold disabled:opacity-60"
          >
            Retake
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={status === "uploading"}
            className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-accent-ink disabled:opacity-60"
          >
            {status === "error" ? "Retry upload" : "Use this photo"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {hiddenInputs}

      <div
        onClick={() => (fileInputRef.current || cameraInputRef.current)?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`group flex aspect-[4/5] w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed cursor-pointer transition-all ${
          isDragging
            ? "border-accent bg-accent-soft scale-[1.01]"
            : "border-border bg-surface-2 hover:bg-surface-3 hover:border-accent/40"
        }`}
      >
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-accent/10 text-accent ring-1 ring-accent/20 shadow-md group-hover:scale-105 transition-transform">
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
            </svg>
          </div>
          <div>
            <p className="font-display text-base font-bold text-text">Tap or drop food photo</p>
            <p className="mt-1 text-xs text-text-muted">Supports camera photos, gallery, or drag & drop</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 pt-2">
        <button
          type="button"
          onClick={() => (cameraInputRef.current || fileInputRef.current)?.click()}
          className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-accent bg-surface shadow-lg hover:scale-105 active:scale-95 transition-transform cursor-pointer"
          aria-label="Take photo"
        >
          <span className="h-10 w-10 rounded-full bg-accent" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="mx-auto text-sm font-semibold text-text-muted hover:text-accent underline decoration-text-faint underline-offset-4 cursor-pointer transition-colors"
      >
        Upload from photo gallery
      </button>

      {errorMessage && (
        <div className="flex gap-2 rounded-xl bg-err-soft px-3 py-2.5 text-xs text-err">
          {errorMessage}
        </div>
      )}
    </div>
  );
}

