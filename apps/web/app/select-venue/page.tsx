import { redirect } from "next/navigation";
import { VenueGrid } from "@/components/venue/venue-grid";
import { createClient } from "@/lib/supabase/server";

export default async function SelectVenuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: venues }, { data: permissions }] = await Promise.all([
    supabase.from("venues").select("*").order("created_at", { ascending: true }),
    supabase.from("user_permissions").select("*").eq("user_id", user.id),
  ]);

  const sorted = (venues ?? []).filter((v) => !v.is_global);

  return (
    <div className="relative h-dvh overflow-hidden bg-[#E9E3D6]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_55%)]" />
      <div className="relative grid h-full grid-rows-[3fr_auto_1fr]">
        <div aria-hidden />
        <div className="flex min-h-0 items-center justify-center overflow-hidden px-4">
          <VenueGrid venues={sorted} />
        </div>
        <div aria-hidden />
      </div>
    </div>
  );
}
