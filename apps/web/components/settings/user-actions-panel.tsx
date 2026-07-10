"use client";

import { useTransition } from "react";
import { resendUserInvite, setUserStatus } from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type UserActionsPanelProps = {
  userId: string;
  status: "active" | "disabled";
  email: string;
};

export function UserActionsPanel({
  userId,
  status,
  email,
}: UserActionsPanelProps) {
  const [isPending, startTransition] = useTransition();

  function toggleStatus() {
    const next = status === "active" ? "disabled" : "active";
    startTransition(async () => {
      const result = await setUserStatus(userId, next);
      alert(result.error ?? result.success);
    });
  }

  function handleResend() {
    startTransition(async () => {
      const result = await resendUserInvite(userId);
      alert(result.error ?? result.success);
    });
  }

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <h2 className="font-serif text-xl text-[#3D421F]">Account</h2>
        <p className="mt-1 text-sm text-black/60">{email}</p>
        <p className="mt-1 text-sm">
          Status:{" "}
          <span className="font-medium">
            {status === "active" ? "Active" : "Disabled"}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={handleResend}
        >
          Resend invite
        </Button>
        <Button
          type="button"
          variant={status === "active" ? "ghost" : "default"}
          disabled={isPending}
          onClick={toggleStatus}
        >
          {status === "active" ? "Deactivate" : "Activate"}
        </Button>
      </div>
    </Card>
  );
}
