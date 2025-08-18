/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep dev entries hot longer to avoid disposing chunks referenced by server
  onDemandEntries: {
    maxInactiveAge: 60 * 1000, // 60s
    pagesBufferLength: 5,
  },
  // Ensure fresh rebuilds in dev to avoid stale chunk ids
  webpack(config, { dev }) {
    if (dev) {
      config.cache = false;
      if (config.optimization && config.optimization.runtimeChunk) {
        // leave as is; default is fine
      }
    }
    return config;
  },
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
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
      bodySizeLimit: "16mb"
    }
  }
};

module.exports = nextConfig;


