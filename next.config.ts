import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  },
  async rewrites() {
    // Next.js App Router does not support dots in route segment directory names,
    // so /api/events/feed.xml cannot be a first-class route. The canonical feed
    // path is /api/events/feed. This rewrite provides the conventional .xml alias
    // for compatibility with feed readers that expect a .xml extension.
    return [
      {
        source: "/api/events/feed.xml",
        destination: "/api/events/feed"
      }
    ];
  }
};

export default nextConfig;

