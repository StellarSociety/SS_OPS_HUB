"use client";

import { useState } from "react";
import { AcknowledgementEmployeeView } from "@/components/hr/acknowledgement-employee-view";
import { submitPublicEmailAcknowledgement } from "@/lib/actions/hr-acknowledgements";
import type {
  HrAcknowledgementPageSettings,
  HrEmailAcknowledgementRecord,
} from "@/lib/hr/acknowledgement";

export function PublicAcknowledgementForm({
  token,
  record,
  settings,
  venueName,
  venueLogoUrl,
}: {
  token: string;
  record: HrEmailAcknowledgementRecord;
  settings: HrAcknowledgementPageSettings;
  venueName: string;
  venueLogoUrl?: string | null;
}) {
  const [current, setCurrent] = useState(record);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <AcknowledgementEmployeeView
      venueName={venueName}
      venueLogoUrl={venueLogoUrl}
      settings={settings}
      subject={current.subject}
      employeeName={current.staffName}
      employeeEmail={current.recipientEmail}
      status={current.status}
      comments={current.comments}
      submitting={submitting}
      error={error}
      onSubmit={async (input) => {
        setSubmitting(true);
        setError(null);
        const result = await submitPublicEmailAcknowledgement({
          token,
          decision: input.decision,
          comments: input.comments,
        });
        setSubmitting(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setCurrent(result.record);
      }}
    />
  );
}
