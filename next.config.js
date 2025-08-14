/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Avoid dev asset cross-origin issues and stale CSS by disabling cache on static chunks
  // and allowing common localhost origins during development
  async headers() {
    const headers = [];
    if (process.env.NODE_ENV !== "production") {
      headers.push(
        {
          source: "/_next/static/:path*",
          headers: [
            { key: "Cache-Control", value: "no-store" }
          ]
        }
      );
      headers.push(
        {
          source: "/_next/:path*",
          headers: [
            { key: "Cache-Control", value: "no-store" }
          ]
        }
      );
    }
    return headers;
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid flaky dev vendor-chunk pack cache and missing files after restarts
      config.cache = false;
    }
    return config;
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
      bodySizeLimit: "16mb"
    }
  }
};

module.exports = nextConfig;


