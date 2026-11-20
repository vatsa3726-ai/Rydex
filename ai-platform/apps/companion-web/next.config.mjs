import path from "node:path";
import { fileURLToPath } from "node:url";
const apiOrigin = process.env.SOULNEST_API_ORIGIN ?? "http://127.0.0.1:4000";
const csp =
  "default-src 'self'; script-src 'self' 'unsafe-inline'" +
  (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") +
  "; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
export default {
  outputFileTracingRoot: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  ),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self)" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/v2/soulnest/:path*",
        destination: `${apiOrigin}/v2/soulnest/:path*`,
      },
      {
        source: "/api/soulnest/:path*",
        destination: `${apiOrigin}/v2/soulnest/:path*`,
      },
    ];
  },
};
