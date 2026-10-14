import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Typeform CSV exports can exceed the 1MB default.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
