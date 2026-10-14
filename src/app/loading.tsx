export default function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-64 animate-pulse rounded bg-line/70" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-line/50" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-lg bg-line/50" />
    </div>
  );
}
