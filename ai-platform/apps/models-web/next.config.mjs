import path from "node:path";
import { fileURLToPath } from "node:url";
const origin = process.env.VEYRA_API_ORIGIN ?? "http://127.0.0.1:4001";
const policy =
  "default-src 'self'; script-src 'self' 'unsafe-inline'" +
  (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") +
  "; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
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
          { key: "Content-Security-Policy", value: policy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(),microphone=(),geolocation=()",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/api/veyra/:path*", destination: `${origin}/v1/veyra/:path*` },
    ];
  },
};
