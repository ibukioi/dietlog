import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

/** server-only に依存しない生成関数(スクリプト・テストからも使う) */
export function createDb(opts: { url: string; authToken?: string }) {
  const client = createClient({ url: opts.url, authToken: opts.authToken });
  return drizzle(client, { schema });
}

export type AppDb = ReturnType<typeof createDb>;
