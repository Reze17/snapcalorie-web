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

  if (status === "preview" || status === "uploading" || status === "error") {
    return (
      <div className="flex w-full flex-col gap-4">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not something next/image can optimize
          <img
            src={photo.previewUrl}
            alt="Meal preview"
            className="w-full rounded-lg border border-white/10 object-contain"
          />
        )}
        {status === "uploading" && (
          <div className="flex flex-col gap-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-white/60 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-[var(--foreground)]/70">
              Uploading… {progress}%
            </p>
          </div>
        )}
        {status === "error" && errorMessage && (
          <p className="text-sm text-[var(--foreground)]/70">{errorMessage}</p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleRetake}
            disabled={status === "uploading"}
            className="flex-1 rounded border border-white/20 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-60"
          >
            Retake
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={status === "uploading"}
            className="flex-1 rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-60"
          >
            {status === "error" ? "Retry upload" : "Use this photo"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
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

      <button
        type="button"
        onClick={() => cameraInputRef.current?.click()}
        className="w-full rounded bg-white/10 px-4 py-3 text-sm font-medium hover:bg-white/20"
      >
        Take photo
      </button>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-lg border border-dashed px-4 py-6 text-center transition-colors ${
          isDragging ? "border-white/60 bg-white/5" : "border-white/20"
        }`}
      >
        <p className="mb-3 text-sm text-[var(--foreground)]/70">
          Drag and drop a photo here, or
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
        >
          Upload photo
        </button>
      </div>

      {errorMessage && (
        <p className="text-sm text-[var(--foreground)]/70">{errorMessage}</p>
      )}
    </div>
  );
}
