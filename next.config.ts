import type { NextConfig } from "next";

const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: baseHeaders },
      // The admin area and login must never be framed (clickjacking). The public form can be embedded.
      {
        source: "/forms/:path*",
        headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "Cache-Control", value: "private, no-store" }],
      },
      { source: "/login", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
  experimental: {
    // Typeform CSV exports can exceed the 1MB default.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
