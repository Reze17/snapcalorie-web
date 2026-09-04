export type UploadProgressHandler = (percent: number) => void;

/** PUTs a blob directly to a presigned storage URL, reporting progress via XHR (fetch has no upload progress event). */
export function uploadWithProgress(
  url: string,
  blob: Blob,
  onProgress?: UploadProgressHandler,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "image/jpeg");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(`Upload failed (status ${xhr.status}). Please try again.`),
        );
      }
    };

    xhr.onerror = () => {
      reject(
        new Error("Upload failed due to a network error. Please try again."),
      );
    };

    xhr.send(blob);
  });
}
