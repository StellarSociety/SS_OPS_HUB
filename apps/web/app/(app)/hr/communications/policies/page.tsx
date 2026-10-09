import { PoliciesListClient } from "@/components/hr/policies-list-client";
import { getEmailTransportSettings } from "@/lib/actions/hr-email-transport";
import {
  getPolicyDeliverySettings,
  listPolicies,
} from "@/lib/actions/hr-policies";

export default async function HrPoliciesPage() {
  const [result, delivery, transport] = await Promise.all([
    listPolicies(),
    getPolicyDeliverySettings(),
    getEmailTransportSettings(),
  ]);

  if (!result.ok) {
    return <p className="text-sm text-black/60">{result.error}</p>;
  }

  return (
    <PoliciesListClient
      policies={result.policies}
      canManage={result.canManage}
      delivery={delivery}
      connectionFromEmail={transport.smtp.fromEmail}
    />
  );
}
