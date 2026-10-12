import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The public tunnel hostname changes every launch. Dev assets must be allowed
  // from it or the shop login page loads without its script.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // The reference tables are read with fs at run time, so file tracing cannot see
  // them. Without this they are missing from the Vercel deployment.
  outputFileTracingIncludes: {
    "/*": ["./reference/**/*"],
  },
};

export default nextConfig;
