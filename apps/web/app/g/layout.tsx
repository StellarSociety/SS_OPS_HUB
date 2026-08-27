import type { ReactNode } from "react";

export default function PublicGuestLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#F0F3DD]/40">
      {children}
    </div>
  );
}
