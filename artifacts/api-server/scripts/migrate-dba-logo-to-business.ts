import { db, pool } from "@workspace/db";
import { businessesTable, settingsTable } from "@workspace/db/schema";
import { and, eq, isNull } from "drizzle-orm";

const ASPHALT_SEALING_SLUG = "asphalt_sealing";

async function migrateDbaLogo(): Promise<void> {
  const result = await db.transaction(async (tx) => {
    const [settings] = await tx
      .select({ id: settingsTable.id, dbaLogoUrl: settingsTable.dbaLogoUrl })
      .from(settingsTable)
      .orderBy(settingsTable.id)
      .limit(1);

    if (!settings?.dbaLogoUrl) {
      return { status: "skipped", reason: "No legacy settings.dbaLogoUrl was found." };
    }

    const [business] = await tx
      .select({
        id: businessesTable.id,
        name: businessesTable.name,
        logoUrl: businessesTable.logoUrl,
      })
      .from(businessesTable)
      .where(eq(businessesTable.slug, ASPHALT_SEALING_SLUG))
      .limit(1);

    if (!business) {
      throw new Error(`Business with slug "${ASPHALT_SEALING_SLUG}" was not found.`);
    }

    if (business.logoUrl) {
      return {
        status: "skipped",
        reason: `Business "${business.name}" already has a logo; no existing logo was overwritten.`,
      };
    }

    // The null predicate makes the copy safe if two migration processes overlap.
    const [updated] = await tx
      .update(businessesTable)
      .set({ logoUrl: settings.dbaLogoUrl })
      .where(and(eq(businessesTable.id, business.id), isNull(businessesTable.logoUrl)))
      .returning({ id: businessesTable.id });

    return updated
      ? {
          status: "migrated",
          reason: `Copied settings.dbaLogoUrl to ${ASPHALT_SEALING_SLUG}.logoUrl.`,
        }
      : {
          status: "skipped",
          reason: "The business logo was set by another migration process; no existing logo was overwritten.",
        };
  });

  console.log(`[dba-logo-migration] ${result.status}: ${result.reason}`);
}

try {
  await migrateDbaLogo();
} catch (error) {
  console.error(
    `[dba-logo-migration] failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}