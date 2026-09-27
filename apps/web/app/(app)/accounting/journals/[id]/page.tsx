import { notFound } from "next/navigation";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { JournalEntryDetail } from "@/components/accounting/journal-entry-detail";
import { getJournalEntry } from "@/lib/accounting/journal-store";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { canAccessGl } from "@/lib/accounting/permissions";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function JournalEntryPage({ params }: PageProps) {
  const { supabase, venue, permissions } = await getAccountingPageContext();

  if (!canAccessGl(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const { id } = await params;
  const entry = await getJournalEntry(supabase, id);
  if (!entry || entry.venue_id !== venue.id) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-5">
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[#3D421F] md:text-3xl">
          Journals
        </h1>
        <p className="text-sm text-black/55">
          General ledger journal entry detail.
        </p>
      </div>
      <JournalEntryDetail entry={entry} />
    </div>
  );
}
