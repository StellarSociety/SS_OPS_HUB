import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appDir = path.dirname(fileURLToPath(import.meta.url));
// pnpm workspace root — node_modules/.pnpm lives here, not in apps/web.
const workspaceRoot = path.join(appDir, "..", "..");

/** Optional @img/sharp platform packages we never need on Vercel (linux x64 glibc). */
const SHARP_TRACE_EXCLUDES = [
  "node_modules/.pnpm/@img+sharp-darwin-*/**/*",
  "node_modules/.pnpm/@img+sharp-win32-*/**/*",
  "node_modules/.pnpm/@img+sharp-wasm32-*/**/*",
  "node_modules/.pnpm/@img+sharp-freebsd-*/**/*",
  "node_modules/.pnpm/@img+sharp-libvips-darwin-*/**/*",
  "node_modules/.pnpm/@img+sharp-linux-arm@*/**/*",
  "node_modules/.pnpm/@img+sharp-linux-arm64@*/**/*",
  "node_modules/.pnpm/@img+sharp-linux-ppc64@*/**/*",
  "node_modules/.pnpm/@img+sharp-linux-riscv64@*/**/*",
  "node_modules/.pnpm/@img+sharp-linux-s390x@*/**/*",
  "node_modules/.pnpm/@img+sharp-linuxmusl-*/**/*",
  "node_modules/.pnpm/@img+sharp-libvips-linux-arm@*/**/*",
  "node_modules/.pnpm/@img+sharp-libvips-linux-arm64@*/**/*",
  "node_modules/.pnpm/@img+sharp-libvips-linux-ppc64@*/**/*",
  "node_modules/.pnpm/@img+sharp-libvips-linux-riscv64@*/**/*",
  "node_modules/.pnpm/@img+sharp-libvips-linux-s390x@*/**/*",
  "node_modules/.pnpm/@img+sharp-libvips-linuxmusl-*/**/*",
];

const nextConfig: NextConfig = {
  // Trace from the workspace root so pnpm's symlinked store is followed.
  outputFileTracingRoot: workspaceRoot,
  // sharp is a native module; keep it external and ship its platform binaries.
  serverExternalPackages: ["sharp"],
  // Do not use broad @img/** includes — they copy every platform arch into every
  // route and blow past Vercel's 250 MB function limit at "Deploying outputs".
  outputFileTracingExcludes: {
    "/*": SHARP_TRACE_EXCLUDES,
  },
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/.pnpm/@img+sharp-linux-x64@*/node_modules/@img/sharp-linux-x64/**/*",
      "node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
  experimental: {
    serverActions: {
      // InOutData.xls exports can be ~1 MB; parse on server from uploaded file.
      bodySizeLimit: "10mb",
      allowedOrigins: [
        "ssopshub.vercel.app",
        "ss-ops-hub.vercel.app",
        "localhost:3000",
        "127.0.0.1:3000",
      ],
    },
  },
};

export default nextConfig;
