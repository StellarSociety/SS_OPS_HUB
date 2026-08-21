"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { GroupLogo } from "@/components/brand/group-logo";
import { signIn } from "@/lib/actions/auth";
import { DEFAULT_GROUP_LOGO_URL } from "@/lib/group/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const REMEMBER_CREDENTIALS_KEY = "ss-ops-remember-credentials";

type LoginFormProps = {
  notice?: string | null;
  logoUrl?: string;
  /** Device preview: sign in stays in the phone, then venue selection. */
  preview?: boolean;
  onAuthenticated?: () => void;
  /** After a real sign-in, return the phone to this PhoneChrome path. */
  nextPath?: string | null;
  mobileApp?: boolean;
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

export function LoginForm({
  notice,
  logoUrl = DEFAULT_GROUP_LOGO_URL,
  preview = false,
  onAuthenticated,
  nextPath = null,
  mobileApp = false,
}: LoginFormProps) {
  const [state, formAction, pending] = useActionState(signIn, { error: "" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const error = state.error || notice || null;
  const enterHub = hasSavedCredentials && Boolean(email.trim() && password);

  useEffect(() => {
    const saved = loadSavedCredentials();
    if (!saved) return;
    setEmail(saved.email);
    setPassword(saved.password);
    setHasSavedCredentials(true);
  }, []);

  useEffect(() => {
    if (!state.authenticated) return;
    onAuthenticated?.();
  }, [state.authenticated, onAuthenticated]);

  function handleSubmit() {
    localStorage.setItem(
      REMEMBER_CREDENTIALS_KEY,
      JSON.stringify({ email, password }),
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-sm"
    >
      <div className="mb-8 text-center">
        <GroupLogo
          src={logoUrl}
          eager
          className="mx-auto mb-5 h-auto w-[260px] max-w-full"
        />
        <p className="font-serif text-lg text-white/70">
          Hospitality Operational Hub
        </p>
      </div>

      <form
        action={formAction}
        className="space-y-4"
        onSubmit={handleSubmit}
      >
        {preview ? (
          <input type="hidden" name="device_preview" value="1" />
        ) : null}
        {mobileApp ? <input type="hidden" name="mobile_app" value="1" /> : null}
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-label="Email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          variant="onDark"
          className="text-[16px]"
        />
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-label="Password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="pr-10 text-[16px]"
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

        {error ? (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          className="w-full bg-[#a7aaae] text-[#1a1a1a] hover:bg-[#929599]"
          disabled={pending}
        >
          {pending
            ? enterHub
              ? "Entering HUB…"
              : "Signing in…"
            : enterHub
              ? "Enter HUB"
              : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-white/50">
        <Link
          href="/forgot-password"
          className="hover:text-white/80"
          onClick={
            preview || mobileApp ? (event) => event.preventDefault() : undefined
          }
        >
          Forgot password?
        </Link>
      </p>
    </motion.div>
  );
}
