import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
  },
  serverExternalPackages: ["@libsql/client", "pg"],
  experimental: {
    serverActions: {
      // До 24 МБ изображений и запас для multipart-обрамления.
      bodySizeLimit: "32mb",
    },
  },
  async redirects() {
    return [{
      source: "/services/chistka-i-dezinfekciya-ventilyacii-fankoylov",
      destination: "/services/chistka-ventilyacii-i-fankoylov",
      permanent: true,
    }];
  },
  async headers() {
    const publicPageCache = {
      key: "Cache-Control",
      value: "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
    };
    const immutableAssetCache = {
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable",
    };

    const privatePageCache = { key: "Cache-Control", value: "private, no-store" };

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
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
        source: "/contacts",
        headers: [publicPageCache],
      },
      {
        source: "/politika",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
      {
        source: "/soglasie-administratora",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
      {
        source: "/login",
        headers: [privatePageCache],
      },
      {
        source: "/admin/:path*",
        headers: [privatePageCache],
      },
      {
        source: "/api/session",
        headers: [privatePageCache],
      },
      {
        source: "/robots.txt",
        headers: [publicPageCache],
      },
      {
        source: "/sitemap.xml",
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
        source: "/logo.webp",
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
        source: "/services/:asset.webp",
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
      {
        // Service worker всегда должен обновляться сразу — без долгого кэша.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
