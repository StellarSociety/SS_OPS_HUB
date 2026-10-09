import { PolicyDetailClient } from "@/components/hr/policy-detail-client";
import { getPolicyDetail } from "@/lib/actions/hr-policies";

export default async function HrPolicyDetailPage({
  params,
}: {
  params: Promise<{ policyId: string }>;
}) {
  const { policyId } = await params;
  const result = await getPolicyDetail(policyId);

  if (!result.ok) {
    return <p className="text-sm text-black/60">{result.error}</p>;
  }

  return (
    <PolicyDetailClient
      policy={result.policy}
      records={result.records}
      staff={result.staff}
      canManage={result.canManage}
    />
  );
}
