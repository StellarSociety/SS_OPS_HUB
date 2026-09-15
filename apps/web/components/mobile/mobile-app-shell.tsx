"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PullToRefresh } from "@/components/mobile/pull-to-refresh";

export function MobileAppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  return (
    <div className="mobile-shell-inset h-dvh overflow-hidden">
      <PullToRefresh
        refreshing={refreshing}
        onRefresh={() => startRefresh(() => router.refresh())}
        indicatorInsetTop={22}
        contentClassName="h-full min-h-0 overflow-auto"
      >
        {children}
      </PullToRefresh>
    </div>
  );
}
