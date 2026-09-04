import { CaptureFlow } from "./CaptureFlow";

export default function CapturePage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Log a meal</h1>
      <CaptureFlow />
    </main>
  );
}
