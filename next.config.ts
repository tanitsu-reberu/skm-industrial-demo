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
    const immutableAssetCache = {
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable",
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
      {
        source: "/favicon.ico",
        headers: [immutableAssetCache],
      },
      {
        source: "/apple-touch-icon.png",
        headers: [immutableAssetCache],
      },
      {
        source: "/icon.png",
        headers: [immutableAssetCache],
      },
    ];
  },
};

export default nextConfig;
