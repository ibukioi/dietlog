import type { NextConfig } from "next";

// cacheComponents は無効化: ほぼ全画面がセッション依存の動的ページのため
// (docs/adr/0001-disable-cache-components.md)
const KUROMOJI_DICT = [
  "./node_modules/kuromoji/dict/**",
  "./node_modules/.pnpm/kuromoji@*/node_modules/kuromoji/dict/**",
];

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["@libsql/client", "libsql", "kuromoji"],
  // 読みの変換で使う辞書は動的に読むので、デプロイに明示的に含める
  outputFileTracingIncludes: {
    "/api/foods/search": KUROMOJI_DICT,
    "/api/off/search": KUROMOJI_DICT,
    "/api/search/reading": KUROMOJI_DICT,
    "/log": KUROMOJI_DICT,
    "/products": KUROMOJI_DICT,
  },
};

export default nextConfig;
