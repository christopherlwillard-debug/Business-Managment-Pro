import { db } from "@workspace/db";
import { invoicesTable, settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const [inv] = await db
    .select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, 33));

  console.log("Current invoice id=33:", JSON.stringify(inv));

  if (!inv) {
    console.error("Invoice id=33 not found");
    process.exit(1);
  }

  if (inv.invoiceNumber === "Wil-1032") {
    console.log("Already fixed — nothing to do.");
    process.exit(0);
  }

  if (inv.invoiceNumber !== "Wil-1036") {
    console.error(`Unexpected invoice number "${inv.invoiceNumber}" — aborting to avoid unintended changes.`);
    process.exit(1);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(invoicesTable)
      .set({ invoiceNumber: "Wil-1032" })
      .where(eq(invoicesTable.id, 33));

    const [s] = await tx.select().from(settingsTable).limit(1);
    if (s) {
      await tx
        .update(settingsTable)
        .set({ invoiceNextNumber: 1033 })
        .where(eq(settingsTable.id, s.id));
    }
  });

  const [after] = await db
    .select({ invoiceNumber: invoicesTable.invoiceNumber })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, 33));
  const [settings] = await db
    .select({ invoiceNextNumber: settingsTable.invoiceNextNumber })
    .from(settingsTable)
    .limit(1);

  console.log("Done!");
  console.log("  Invoice id=33 is now:", after?.invoiceNumber);
  console.log("  Counter reset to:", settings?.invoiceNextNumber);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
