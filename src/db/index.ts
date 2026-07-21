import crypto from "node:crypto";
import fs from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import * as machineSocialSchema from "./machine-social";
import * as openjudgeSchema from "./openjudge-schema";
import * as hermesSchema from "./hermes-schema";

// Connection string from environment
const runtimeConnectionString = process.env.SPACEBOT_RUNTIME_DATABASE_URL;
if (process.env.NODE_ENV === "production" && !runtimeConnectionString) {
  throw new Error("SPACEBOT_RUNTIME_DATABASE_URL is required in production");
}
const connectionString =
  runtimeConnectionString ||
  process.env.SPACEBOT_DATABASE_URL ||
  process.env.DATABASE_URL!;
const databaseUrl = new URL(connectionString);
databaseUrl.searchParams.delete("sslmode");

let productionSsl:
  | { rejectUnauthorized: true; servername: string; ca?: string }
  | undefined;
if (process.env.NODE_ENV === "production") {
  productionSsl = {
    rejectUnauthorized: true,
    servername: databaseUrl.hostname,
  };
  const caPath = process.env.SPACEBOT_DATABASE_CA_PATH;
  if (caPath) {
    const ca = fs.readFileSync(caPath, "utf8");
    const expectedCaSha256 =
      process.env.SPACEBOT_EXPECTED_DATABASE_CA_SHA256?.toUpperCase();
    const actualCaSha256 = crypto
      .createHash("sha256")
      .update(ca)
      .digest("hex")
      .toUpperCase();
    if (!expectedCaSha256 || actualCaSha256 !== expectedCaSha256) {
      throw new Error("Pinned database CA fingerprint guard failed");
    }
    productionSsl.ca = ca;
  }
}

// Create postgres client with SSL for production
const client = postgres(databaseUrl.toString(), {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: productionSsl,
});

// Create drizzle instance with all schemas for relational queries
export const db = drizzle(client, {
  schema: {
    ...schema,
    ...machineSocialSchema,
    ...openjudgeSchema,
    ...hermesSchema,
  },
});

// Export schemas for use in queries
export * from "./schema";
export * from "./machine-social";
export * from "./openjudge-schema";
export * from "./hermes-schema";
