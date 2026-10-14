import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@catalogue/database";

const migrationsFolder = process.env.DRIZZLE_MIGRATIONS_FOLDER ?? "packages/database/src/migrations";

await migrate(db, {
  migrationsFolder,
});

console.log("✅ Drizzle migrations applied");