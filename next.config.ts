import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow verification builds while a development server is running.
  distDir: process.env.NEXT_BUILD_DIR || ".next",
};

export default nextConfig;
