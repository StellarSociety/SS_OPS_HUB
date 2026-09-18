import { HiringPublicForm } from "@/components/hr/hiring-public-form";
import {
  getHiringFormByCode,
  listHiringFormBlocks,
} from "@/lib/hr/hiring/store";
import { isHiringFormAccepting } from "@/lib/hr/hiring/types";
import { loadGuestFeedbackOutboundLinks } from "@/lib/sentiment/guest-feedback/outbound-links";
import { createServiceClient } from "@/lib/supabase/service";
import { venueThemeStyle } from "@/lib/venue/theme";
import type { Venue } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { code } = await params;
  const form = await getHiringFormByCode(createServiceClient(), code).catch(
    () => null,
  );
  return { title: form?.intro2_title.trim() || "Hiring form" };
}

export default async function PublicHiringApplyPage({ params }: PageProps) {
  const { code } = await params;
  const service = createServiceClient();
  const form = await getHiringFormByCode(service, code);

  if (!form) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-12">
        <div className="max-w-md rounded-2xl border border-black/10 bg-white px-6 py-8 text-center shadow-sm">
          <h1 className="font-serif text-2xl text-[#3D421F]">Page unavailable</h1>
          <p className="mt-2 text-sm text-black/60">
            This hiring form is closed or the link is no longer valid.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: venue }, blocks, socials] = await Promise.all([
    service.from("venues").select("*").eq("id", form.venue_id).maybeSingle(),
    listHiringFormBlocks(service, form.id),
    loadGuestFeedbackOutboundLinks(service, { id: form.venue_id }),
  ]);
  const venueRow = (venue ?? null) as Venue | null;
  const accepting = isHiringFormAccepting(form, {
    applicationCount: form.application_count ?? 0,
  });

  return (
    <main
      className="min-h-dvh overflow-x-hidden"
      style={{
        ...venueThemeStyle(venueRow),
        backgroundColor:
          "color-mix(in srgb, var(--venue-secondary, #F0F3DD) 35%, white)",
      }}
    >
      <HiringPublicForm
        form={form}
        blocks={blocks}
        venueName={venueRow?.name?.trim() || "Venue"}
        socials={socials}
        closedReason={accepting.ok ? undefined : accepting.reason}
      />
    </main>
  );
}
