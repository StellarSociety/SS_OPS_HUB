"use client";

import { useActionState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { requestPasswordReset } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState = { error: "", success: "" };

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) => {
      const result = await requestPasswordReset(formData);
      return { error: result?.error ?? "", success: result?.success ?? "" };
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
          <p className="font-serif text-2xl text-white">Reset password</p>
          <p className="mt-1 text-sm text-white/60">
            We&apos;ll email you a reset link.
          </p>
        </div>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          {state.error ? (
            <p className="text-sm text-red-300">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-emerald-300">{state.success}</p>
          ) : null}
          <Button type="submit" className="w-full bg-[#818a40]" disabled={pending}>
            Send reset link
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-white/50">
          <Link href="/login">Back to sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
