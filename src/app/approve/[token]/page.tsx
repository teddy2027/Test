import { ApprovalPage } from "@/components/external/ApprovalPage";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ApprovalPage token={token} />;
}
