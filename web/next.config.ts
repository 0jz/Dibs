import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The public tunnel hostname changes every launch. Dev assets must be allowed
  // from it or the shop login page loads without its script.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
