import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  serverExternalPackages: ["@libsql/client"],
  async headers() {
    const publicPageCache = {
      key: "Cache-Control",
      value: "public, max-age=3600, stale-while-revalidate=86400",
    };

    return [
      {
        source: "/",
        headers: [publicPageCache],
      },
      {
        source: "/services",
        headers: [publicPageCache],
      },
      {
        source: "/services/:slug",
        headers: [publicPageCache],
      },
    ];
  },
};

export default nextConfig;
