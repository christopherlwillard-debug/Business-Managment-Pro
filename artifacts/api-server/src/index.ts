import app from "./app";
import { startRecurringExpensesJob } from "./jobs/recurringExpenses.js";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runStartupMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS compliance_notification_email text;
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS compliance_email_enabled integer NOT NULL DEFAULT 0;
    `);
    console.log("Startup migrations applied.");
  } catch (err) {
    console.warn("Startup migration warning:", err instanceof Error ? err.message : err);
  } finally {
    client.release();
  }
}

runStartupMigrations().then(() => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startRecurringExpensesJob();
  });
});
