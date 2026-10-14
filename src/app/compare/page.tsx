import { Suspense } from "react";
import { ComparePage } from "@/components/compare/ComparePage";

export default function Page() {
  return (
    <Suspense>
      <ComparePage />
    </Suspense>
  );
}
