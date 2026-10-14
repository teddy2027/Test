import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-lg font-semibold text-ink">Page not found</h1>
      <p className="mt-1 text-sm text-muted">That company or page does not exist in this demo portfolio.</p>
      <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
        Back to Portfolio Overview
      </Link>
    </div>
  );
}
