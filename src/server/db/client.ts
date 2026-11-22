import "server-only";

import { createDb } from "./create";

declare global {
  var __dietlogDb: ReturnType<typeof createDb> | undefined;
}

/** 開発時のホットリロードで接続が増えないようにグローバルに保持する */
export const db =
  globalThis.__dietlogDb ??
  (globalThis.__dietlogDb = createDb({
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  }));

export type Db = typeof db;
