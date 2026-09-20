import {
  listHiringAppointments,
  listHiringApplicationsForForm,
  listHiringFormBlocks,
  listHiringForms,
} from "@/lib/hr/hiring/store";
import {
  HIRING_CATEGORY_LABELS,
  HIRING_STATUS_LABELS,
  type HiringAnswers,
  type HiringApplicationFile,
  type HiringFieldType,
} from "@/lib/hr/hiring/types";
import { createServiceClient } from "@/lib/supabase/service";

export type MobileHiringFormOption = {
  id: string;
  name: string;
  applicationCount: number;
};

export type MobileHiringField = {
  id: string;
  label: string;
  type: HiringFieldType;
  computeAge: boolean;
};

export type MobileHiringCandidate = {
  id: string;
  name: string;
  email: string | null;
  submittedAt: string;
  statusLabel: string;
  categoryLabel: string | null;
  photoUrl: string | null;
  answers: HiringAnswers;
  files: HiringApplicationFile[];
};

export type MobileHiringPage = {
  forms: MobileHiringFormOption[];
  selectedFormId: string | null;
  fields: MobileHiringField[];
  candidates: MobileHiringCandidate[];
};

export const EMPTY_MOBILE_HIRING_PAGE: MobileHiringPage = {
  forms: [],
  selectedFormId: null,
  fields: [],
  candidates: [],
};

export type MobileHiringAppointment = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  format: "in_person" | "video";
  locationDetails: string | null;
  meetingLink: string | null;
  applicantName: string;
  applicantEmail: string | null;
  formName: string | null;
};

function candidatePhotoUrl(
  files: Array<{ public_url: string; content_type: string | null }>,
): string | null {
  const image = files.find((file) =>
    (file.content_type ?? "").startsWith("image/"),
  );
  return image?.public_url || files[0]?.public_url || null;
}

export async function loadMobileHiringPage(
  venueId: string,
  formId?: string | null,
): Promise<MobileHiringPage> {
  const service = createServiceClient();
  const forms = await listHiringForms(service, venueId);
  const options: MobileHiringFormOption[] = forms.map((form) => ({
    id: form.id,
    name: form.name.trim() || "Untitled form",
    applicationCount: form.application_count ?? 0,
  }));

  if (options.length === 0) {
    return { forms: [], selectedFormId: null, fields: [], candidates: [] };
  }

  const selectedFormId =
    options.find((form) => form.id === formId)?.id ?? options[0]!.id;
  const [applications, blocks] = await Promise.all([
    listHiringApplicationsForForm(service, venueId, selectedFormId),
    listHiringFormBlocks(service, selectedFormId),
  ]);
  const fields: MobileHiringField[] = blocks.flatMap((block) => {
    if (block.kind !== "field" || !block.field_type) return [];
    return [
      {
        id: block.id,
        label: block.field_label?.trim() || "Field",
        type: block.field_type,
        computeAge: block.config.computeAge,
      },
    ];
  });

  return {
    forms: options,
    selectedFormId,
    fields,
    candidates: applications.map((application) => ({
      id: application.id,
      name: application.applicant_name?.trim() || "Unnamed",
      email: application.applicant_email?.trim() || null,
      submittedAt: application.submitted_at,
      statusLabel: HIRING_STATUS_LABELS[application.status],
      categoryLabel: application.category
        ? HIRING_CATEGORY_LABELS[application.category]
        : null,
      photoUrl: candidatePhotoUrl(application.files),
      answers: application.answers,
      files: application.files,
    })),
  };
}

export async function loadMobileHiringAppointments(
  venueId: string,
): Promise<MobileHiringAppointment[]> {
  const service = createServiceClient();
  const rows = await listHiringAppointments(service, venueId);
  return rows.map((row) => ({
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    format: row.format,
    locationDetails: row.location_details,
    meetingLink: row.meeting_link,
    applicantName: row.applicant_name?.trim() || "Candidate",
    applicantEmail: row.applicant_email?.trim() || null,
    formName: row.form_name,
  }));
}
