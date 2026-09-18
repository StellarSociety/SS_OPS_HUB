import {
  listHiringAppointments,
  listHiringApplicationsForForm,
  listHiringForms,
} from "@/lib/hr/hiring/store";
import { HIRING_STATUS_LABELS } from "@/lib/hr/hiring/types";
import { createServiceClient } from "@/lib/supabase/service";

export type MobileHiringFormOption = {
  id: string;
  name: string;
  applicationCount: number;
};

export type MobileHiringCandidate = {
  id: string;
  name: string;
  email: string | null;
  submittedAt: string;
  statusLabel: string;
  photoUrl: string | null;
};

export type MobileHiringPage = {
  forms: MobileHiringFormOption[];
  selectedFormId: string | null;
  candidates: MobileHiringCandidate[];
};

export const EMPTY_MOBILE_HIRING_PAGE: MobileHiringPage = {
  forms: [],
  selectedFormId: null,
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
    return { forms: [], selectedFormId: null, candidates: [] };
  }

  const selectedFormId =
    options.find((form) => form.id === formId)?.id ?? options[0]!.id;
  const applications = await listHiringApplicationsForForm(
    service,
    venueId,
    selectedFormId,
  );

  return {
    forms: options,
    selectedFormId,
    candidates: applications.map((application) => ({
      id: application.id,
      name: application.applicant_name?.trim() || "Unnamed",
      email: application.applicant_email?.trim() || null,
      submittedAt: application.submitted_at,
      statusLabel: HIRING_STATUS_LABELS[application.status],
      photoUrl: candidatePhotoUrl(application.files),
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
