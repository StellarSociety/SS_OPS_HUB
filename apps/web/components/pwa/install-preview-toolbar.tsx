"use client";

import { useRouter } from "next/navigation";
import type { InstallPreviewKind } from "@/lib/pwa/install-preview";

const OPTIONS: Array<{ id: InstallPreviewKind | ""; label: string }> = [
  { id: "", label: "Auto" },
  { id: "ios", label: "iPhone Safari" },
  { id: "ios-chrome", label: "iPhone Chrome" },
  { id: "android", label: "Android" },
  { id: "desktop", label: "Desktop" },
  { id: "installed", label: "Installed" },
];

export function InstallPreviewToolbar({
  current,
}: {
  current: InstallPreviewKind | null;
}) {
  const router = useRouter();

  function setPreview(id: InstallPreviewKind | "") {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("preview", id);
    else url.searchParams.delete("preview");
    router.replace(`${url.pathname}${url.search}`);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#3D421F]/15 bg-[#3D421F] px-3 py-2 text-white">
      <p className="mb-1.5 text-center text-[11px] uppercase tracking-wide text-white/60">
        Preview layout (dev only)
      </p>
      <div className="mx-auto flex max-w-lg flex-wrap justify-center gap-1.5">
        {OPTIONS.map((option) => {
          const active = (current ?? "") === option.id;
          return (
            <button
              key={option.id || "auto"}
              type="button"
              onClick={() => setPreview(option.id)}
              className={
                active
                  ? "rounded-full bg-[#818a40] px-2.5 py-1 text-xs font-medium text-white"
                  : "rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/20"
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
