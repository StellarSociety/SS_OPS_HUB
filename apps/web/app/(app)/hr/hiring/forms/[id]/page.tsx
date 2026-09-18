import { notFound } from "next/navigation";
import { HiringFormEditor } from "@/components/hr/hiring-form-editor";
import { generateQrSvg } from "@/lib/guests-intel/qr";
import { canEditHiring } from "@/lib/hr/permissions";
import {
  getHiringForm,
  listHiringFormBlocks,
} from "@/lib/hr/hiring/store";
import { hiringApplyPath } from "@/lib/hr/hiring/types";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listDepartments, listPositions } from "@/lib/hr/store";
import { envAppUrl, joinAppUrl } from "@/lib/public-app-url";
import { createServiceClient } from "@/lib/supabase/service";

export default async function HiringFormEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { venue, permissions } = await getHrPageContext();
  const service = createServiceClient();
  const form = await getHiringForm(service, venue.id, id);
  if (!form) notFound();

  const [blocks, departments, positions] = await Promise.all([
    listHiringFormBlocks(service, form.id),
    listDepartments(service, venue.id),
    listPositions(service, venue.id),
  ]);
  const formUrl = joinAppUrl(hiringApplyPath(form.public_code), envAppUrl());
  const formQrSvg = await generateQrSvg(formUrl);

  return (
    <HiringFormEditor
      form={form}
      blocks={blocks}
      departments={departments}
      positions={positions}
      formUrl={formUrl}
      formQrSvg={formQrSvg}
      canEdit={canEditHiring(permissions, venue.id)}
    />
  );
}
