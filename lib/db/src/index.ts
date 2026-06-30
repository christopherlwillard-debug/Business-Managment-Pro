import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Prevent idle-client errors from crashing the process.
// Without this handler, any connection-level error emitted by the pg pool
// (idle timeout, server-side close, network blip) becomes an unhandled
// EventEmitter 'error' event and kills the process.
pool.on("error", (err) => {
  console.error("[db-pool] idle client error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
