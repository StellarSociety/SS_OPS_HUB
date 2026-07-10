import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Settings</h1>
        <p className="mt-1 text-sm text-black/60">
          App-wide and per-module configuration will live here.
        </p>
      </div>
      <Card className="p-8 text-center">
        <p className="font-serif text-xl text-[#3D421F]">Settings scaffold</p>
        <p className="mt-2 text-sm text-black/50">
          Global settings (users, roles, integrations) and module settings
          panels will be wired in with the modules registry.
        </p>
      </Card>
    </div>
  );
}
