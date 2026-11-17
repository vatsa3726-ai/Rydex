import path from 'node:path';
import { fileURLToPath } from 'node:url';
const apiOrigin = process.env.SOULNEST_API_ORIGIN ?? 'http://127.0.0.1:4000';
export default {
 outputFileTracingRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
 async rewrites() { return [{ source: '/api/soulnest/:path*', destination: `${apiOrigin}/v1/soulnest/:path*` }]; }
};
