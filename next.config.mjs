import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // No `output: "standalone"` on purpose. The Docker image (see Dockerfile)
  // serves three roles from one build — web server, pg-boss worker, and the
  // migration job — so it needs the real source tree, db/migrations, and a real
  // node_modules, none of which a standalone bundle contains. It runs
  // `next start` against .next instead.
  experimental: {
    // Next 15+ defaults the client Router Cache's staleTime for dynamic routes
    // to 0s, so navigating between any two dynamic routes re-fetches (and
    // re-renders) even a *shared* parent layout — e.g. app/(app)/[workspaceId]/
    // layout.tsx, which renders the sidebar, is dynamic (calls headers()).
    // Opening a task (/[workspaceId]/task/[taskId]) and closing it back to the
    // list therefore re-ran the sidebar's server render on every close,
    // reading as a one-time blink. 30s (the pre-15 default) lets the shared
    // layout reuse its already-rendered output across this kind of quick
    // back-and-forth; an explicit router.refresh() (realtime updates) still
    // always bypasses this cache regardless of staleTime.
    staleTimes: {
      dynamic: 30,
    },
  },
  // sharp loads its native binary dynamically based on platform/arch, so keep it
  // as a real require() against node_modules rather than letting Next.js bundle
  // it — the recommendation in sharp's own docs.
  serverExternalPackages: ["sharp"],
  turbopack: {
    root: resolve(__dirname),
  },
  transpilePackages: ["@emoji-mart/react"],
  // Always revalidate the service worker so a CDN (e.g. Cloudflare, which caches
  // .js by default) or the browser never serves a stale /sw.js after a deploy.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
