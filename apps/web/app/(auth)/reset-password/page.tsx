"use client";

import { useActionState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { updatePassword } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState = { error: "" };

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) => {
      const result = await updatePassword(formData);
      return result ?? initialState;
    },
    initialState,
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <p className="font-serif text-2xl text-white">Set new password</p>
        </div>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
            />
          </div>
          {state.error ? (
            <p className="text-sm text-red-300">{state.error}</p>
          ) : null}
          <Button type="submit" className="w-full bg-[#808A3E]" disabled={pending}>
            Update password
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-white/50">
          <Link href="/login">Back to sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
