import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import { SettingsSubNav } from "@/components/settings/settings-sub-nav";

const sections = [
  {
    href: "/settings/users",
    title: "Users & access",
    description:
      "Invite staff, assign permissions, activate or deactivate accounts.",
  },
  {
    href: "/settings/venue-modules",
    title: "Venue modules",
    description: "Enable or disable modules per venue for phased rollouts.",
  },
  {
    href: "/settings/email-config",
    title: "Email config",
    description: "Venue email connection and delivery settings.",
  },
  {
    href: "/settings/drive-config",
    title: "Drive config",
    description: "Venue drive connection and folder settings.",
  },
] as const;

export default async function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Venue Settings</h1>
        <p className="mt-1 text-sm text-black/60">
          Configuration for this venue — users, modules, email, and drive.
        </p>
      </div>

      <SettingsSubNav />

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full p-6 transition-colors hover:bg-[var(--venue-secondary)]/30">
              <h2 className="font-serif text-xl text-[#3D421F]">
                {section.title}
              </h2>
              <p className="mt-2 text-sm text-black/60">{section.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
