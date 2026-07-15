import { CertificationTypesSection } from "@/components/hr/lookup-sections";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listCertificationTypes } from "@/lib/hr/store";

export default async function HrCertificationsSettingsPage() {
  const { supabase } = await getHrPageContext();
  const certifications = await listCertificationTypes(supabase);

  return <CertificationTypesSection certifications={certifications} />;
}
