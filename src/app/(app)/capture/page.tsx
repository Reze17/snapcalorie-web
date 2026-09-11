import { CaptureFlow } from "./CaptureFlow";

export default function CapturePage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-bold">Scan meal</h1>
      <CaptureFlow />
    </div>
  );
}
