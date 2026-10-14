"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <h1 className="text-lg font-semibold text-ink">Something went wrong rendering this view</h1>
      <p className="mt-1 text-sm text-muted">{error.message}</p>
      <button onClick={reset} className="mt-4 rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium hover:bg-subtle">
        Try again
      </button>
    </div>
  );
}
