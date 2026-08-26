import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { absoluteAppHref } from "@/lib/public-app-url";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/select-venue";

  const supabase = await createClient();

  // OTP verify flow (invite / recovery / magiclink links we generate ourselves).
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(absoluteAppHref(next, request.url));
    }
  } else if (code) {
    // PKCE flow (OAuth / code exchange).
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(absoluteAppHref(next, request.url));
    }
  }

  return NextResponse.redirect(
    absoluteAppHref("/login?error=auth_callback", request.url),
  );
}
