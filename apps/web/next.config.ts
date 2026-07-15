import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // InOutData.xls exports can be ~1 MB; parse on server from uploaded file.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
