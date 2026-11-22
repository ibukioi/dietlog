/** drizzle/ のマイグレーションを DATABASE_URL に適用する */
import { config } from "dotenv";
import { migrate } from "drizzle-orm/libsql/migrator";

import { createDb } from "../../src/server/db/create";

config({ path: ".env.local" });

async function main() {
  const db = createDb({
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ migrated");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
