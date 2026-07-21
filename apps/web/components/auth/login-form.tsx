"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import { signIn } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const REMEMBER_CREDENTIALS_KEY = "ss-ops-remember-credentials";

type LoginFormProps = {
  notice?: string | null;
};

type SavedCredentials = {
  email: string;
  password: string;
};

function loadSavedCredentials(): SavedCredentials | null {
  try {
    const raw = localStorage.getItem(REMEMBER_CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedCredentials;
    if (typeof parsed.email !== "string" || typeof parsed.password !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function LoginForm({ notice }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(signIn, { error: "" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberCredentials, setRememberCredentials] = useState(false);
  const error = state.error || notice || null;

  useEffect(() => {
    const saved = loadSavedCredentials();
    if (!saved) return;
    setEmail(saved.email);
    setPassword(saved.password);
    setRememberCredentials(true);
  }, []);

  function handleSubmit() {
    if (rememberCredentials) {
      localStorage.setItem(
        REMEMBER_CREDENTIALS_KEY,
        JSON.stringify({ email, password }),
      );
      return;
    }
    localStorage.removeItem(REMEMBER_CREDENTIALS_KEY);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-sm"
    >
      <div className="mb-8 text-center">
        <VenueBrandIcon
          slug="orilla"
          name="Orilla"
          variant="badge"
          className="mx-auto mb-5 h-[72px] w-[72px]"
          title="Orilla"
        />
        <p className="font-serif text-3xl leading-tight text-white">
          Stellar Society Group
        </p>
        <p className="font-serif text-lg text-white/70">
          Hospitality Operational Hub
        </p>
      </div>

      <form
        action={formAction}
        className="space-y-4"
        onSubmit={handleSubmit}
      >
        <div className="space-y-2">
          <Label htmlFor="email" variant="onDark">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@stellarsociety.ae"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            variant="onDark"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" variant="onDark">
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-10"
              variant="onDark"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-white/50 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:text-white"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-white/70">
          <input
            type="checkbox"
            checked={rememberCredentials}
            onChange={(event) => setRememberCredentials(event.target.checked)}
            className="size-4 rounded border border-white/25 bg-white/5 accent-[#818a40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818a40] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          />
          Remember credentials
        </label>

        {error ? (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          className="w-full bg-[#818a40] hover:bg-[#6f7835]"
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
