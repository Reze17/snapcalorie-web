export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;

  return (
    <main className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Analyzing your photo</h1>
      <p className="text-sm text-[var(--foreground)]/70">
        Uploaded object key:{" "}
        <code className="break-all">{key ?? "(none)"}</code>
      </p>
      <p className="text-sm text-[var(--foreground)]/70">
        Detection and macro estimation land in Phase 5.
      </p>
    </main>
  );
}
