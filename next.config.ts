import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js N badge on local desk screenshots.
  devIndicators: false,
  // No generated agent rule files in the repo.
  agentRules: false,
  // Lets a second local build (for example against a local validator) live beside the main one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
