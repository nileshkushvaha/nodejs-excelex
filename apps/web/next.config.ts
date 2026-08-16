import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  /**
   * The browser only ever talks to this origin. /api/v1/* is proxied to the
   * NestJS app, which keeps the session cookie same-origin and host-only, and
   * mirrors the production topology where Nginx does exactly this. A browser
   * that had to call the API on another origin would need CORS with credentials
   * and would weaken the cookie scope that isolation depends on.
   */
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // One compromised client page is same-site with every other client's
          // page, so framing is denied by default rather than per route.
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
