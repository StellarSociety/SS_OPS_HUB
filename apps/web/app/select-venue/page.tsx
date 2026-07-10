import { redirect } from "next/navigation";
import { VenueGrid } from "@/components/venue/venue-grid";
import { canAccessGlobal } from "@/lib/role-permissions";
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

  const showGlobal = canAccessGlobal(permissions ?? []);
  const sorted = [
    ...(venues ?? []).filter((v) => !v.is_global),
    ...(showGlobal ? (venues ?? []).filter((v) => v.is_global) : []),
  ];

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#E9E3D6] px-4 py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_55%)]" />
      <VenueGrid venues={sorted} />
    </div>
  );
}
