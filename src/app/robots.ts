import type { MetadataRoute } from "next";

// Forms are noindex by default; keep crawlers out of the admin area and APIs entirely.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/apply/", disallow: ["/forms", "/login", "/api/"] }] };
}
