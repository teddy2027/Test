import { CompanyPage } from "@/components/company/CompanyPage";
import { getData } from "@/lib/data";

export function generateStaticParams() {
  return getData().companies.map((c) => ({ id: c.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompanyPage id={id} />;
}
