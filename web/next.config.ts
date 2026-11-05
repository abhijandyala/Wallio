import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js dev badge; it overlaps the account menu in the sidebar.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
