import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as machineSocialSchema from './machine-social';

// Connection string from environment
const connectionString = process.env.SPACEBOT_DATABASE_URL || process.env.DATABASE_URL!;

// Create postgres client with SSL for production
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

// Create drizzle instance with all schemas for relational queries
export const db = drizzle(client, { schema: { ...schema, ...machineSocialSchema } });

// Export schemas for use in queries
export * from './schema';
export * from './machine-social';
