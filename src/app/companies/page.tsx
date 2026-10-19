import { Suspense } from "react";
import { CompaniesSection } from "@/components/companies/CompaniesSection";

export default function Page() {
  return (
    <Suspense>
      <CompaniesSection />
    </Suspense>
  );
}
