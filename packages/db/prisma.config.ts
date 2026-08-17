import "dotenv/config";
import { defineConfig } from "prisma/config";

const configuredDatabaseUrl = process.env.ROCKFOUNDRY_DATABASE_URL;
const databaseUrl = configuredDatabaseUrl?.startsWith("file:")
  ? configuredDatabaseUrl
  : "file:./rockfoundry.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations_agentic_v1",
  },
  datasource: {
    url: databaseUrl,
  },
});

export { databaseUrl };

// Previous Alpha PostgreSQL migrations remain under prisma/migrations for history only.
// They are intentionally outside this Agentic V1 migration path.
