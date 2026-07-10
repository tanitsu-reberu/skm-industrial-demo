import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
  },
  serverExternalPackages: ["@libsql/client"],
  async headers() {
    const publicPageCache = {
      key: "Cache-Control",
      value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
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
        source: "/politika",
        headers: [publicPageCache],
      },
      {
        source: "/login",
        headers: [publicPageCache],
      },
      {
        source: "/checkout/:slug",
        headers: [publicPageCache],
      },
      {
        source: "/_next/static/css/:path*",
        headers: [immutableAssetCache],
      },
      {
        source: "/_next/static/chunks/:path*",
        headers: [immutableAssetCache],
      },
      {
        source: "/_next/static/:path*",
        headers: [immutableAssetCache],
      },
      {
        source: "/_next/image",
        headers: [immutableAssetCache],
      },
      {
        source: "/logo.png",
        headers: [immutableAssetCache],
      },
      {
        source: "/logo.svg",
        headers: [immutableAssetCache],
      },
      {
        source: "/services/:asset.svg",
        headers: [immutableAssetCache],
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
