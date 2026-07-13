import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

type MiddlewareClientOptions = {
  /** Extra request headers to forward to the downstream route handler. */
  headers?: Record<string, string>;
  /** When set, the base response rewrites the request to this URL. */
  rewriteTo?: URL;
};

export function createMiddlewareClient(
  request: NextRequest,
  options: MiddlewareClientOptions = {},
) {
  // Rebuilt on each call so Supabase cookie refreshes (which mutate
  // `request.cookies`) are reflected in the forwarded request headers, while
  // still injecting our scope headers.
  const buildResponse = () => {
    const requestHeaders = new Headers(request.headers);
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        requestHeaders.set(key, value);
      }
    }
    return options.rewriteTo
      ? NextResponse.rewrite(options.rewriteTo, {
          request: { headers: requestHeaders },
        })
      : NextResponse.next({ request: { headers: requestHeaders } });
  };

  let supabaseResponse = buildResponse();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = buildResponse();
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
            supabaseResponse.cookies.set(name, value, cookieOptions);
          });
        },
      },
    },
  );

  return { supabase, supabaseResponse };
}
