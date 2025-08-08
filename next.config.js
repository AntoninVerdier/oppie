/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
      bodySizeLimit: "16mb"
    }
  }
};

module.exports = nextConfig;


