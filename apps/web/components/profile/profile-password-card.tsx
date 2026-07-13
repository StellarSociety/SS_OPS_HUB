"use client";

import { useTransition } from "react";
import { KeyRound } from "lucide-react";
import { updateOwnPassword } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

const lightInput =
  "border-black/10 bg-white text-[#3D421F] placeholder:text-black/40 focus-visible:ring-offset-white";

export function ProfilePasswordCard() {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateOwnPassword(formData);
      if (result.error) toast.error(result.error);
      else toast.saved(result.success ?? "Password updated.");
    });
  }

  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-[#818a40]" />
        <h2 className="font-serif text-xl text-[#3D421F]">Password</h2>
      </div>
      <form action={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-black/70">
            New password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
            className={lightInput}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm" className="text-black/70">
            Confirm password
          </Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
            className={lightInput}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Updating…" : "Update password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
