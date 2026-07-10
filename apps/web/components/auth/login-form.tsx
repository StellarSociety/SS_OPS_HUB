"use client";

import { useActionState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { signIn } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState = { error: "" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-sm"
    >
      <div className="mb-8 text-center">
        <p className="font-serif text-3xl leading-tight text-white">
          Stellar Society
        </p>
        <p className="font-serif text-lg text-white/70">Operational Hub</p>
      </div>

      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@stellarsociety.ae"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        </div>

        {state.error ? (
          <p className="text-sm text-red-300" role="alert">
            {state.error}
          </p>
        ) : null}

        <Button
          type="submit"
          className="w-full bg-[#808A3E] hover:bg-[#6f7835]"
          disabled={pending}
        >
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-white/50">
        <Link href="/forgot-password" className="hover:text-white/80">
          Forgot password?
        </Link>
      </p>
    </motion.div>
  );
}
