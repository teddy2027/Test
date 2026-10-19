import { Suspense } from "react";
import { Forward } from "@/components/shell/Forward";

export default function Page() {
  return (
    <Suspense>
      <Forward from="insights" />
    </Suspense>
  );
}
