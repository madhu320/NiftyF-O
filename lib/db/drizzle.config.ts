import { defineConfig } from "drizzle-kit";
import path from "path";

type DbEnvironment = typeof globalThis & {
  process?: {
    env?: {
      DATABASE_URL?: string;
    };
  };
};

const environment = globalThis as DbEnvironment;
const databaseUrl = environment.process?.env?.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
