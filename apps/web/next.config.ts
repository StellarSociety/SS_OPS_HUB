import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appDir = path.dirname(fileURLToPath(import.meta.url));
// pnpm workspace root — node_modules/.pnpm lives here, not in apps/web.
const workspaceRoot = path.join(appDir, "..", "..");

const nextConfig: NextConfig = {
  // Trace from the workspace root so pnpm's symlinked store is followed.
  outputFileTracingRoot: workspaceRoot,
  // sharp is a native module; keep it external and ship its platform binaries.
  serverExternalPackages: ["sharp"],
  outputFileTracingIncludes: {
    "/**": [
      "../../node_modules/.pnpm/@img+**/node_modules/@img/**/*",
      "../../node_modules/@img/**/*",
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
