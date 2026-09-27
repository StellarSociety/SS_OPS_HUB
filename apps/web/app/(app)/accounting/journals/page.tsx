import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { JournalsBrowserClient } from "@/components/accounting/journals-browser-client";
import { listJournalEntries } from "@/lib/accounting/journal-store";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { canAccessGl } from "@/lib/accounting/permissions";

export default async function JournalsPage() {
  const { supabase, venue, permissions } = await getAccountingPageContext();

  if (!canAccessGl(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const entries = await listJournalEntries(supabase, { venueId: venue.id });

  return (
    <div className="mx-auto w-full max-w-none space-y-5">
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[#3D421F] md:text-3xl">
          Journals
        </h1>
        <p className="text-sm text-black/55">
          General ledger journal entries — posted books from AP, sales, and
          other sources.
        </p>
      </div>
      <JournalsBrowserClient entries={entries} />
    </div>
  );
}
