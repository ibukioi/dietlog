import type { NextConfig } from "next";

// cacheComponents は無効化: ほぼ全画面がセッション依存の動的ページのため
// (docs/adr/0001-disable-cache-components.md)
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
