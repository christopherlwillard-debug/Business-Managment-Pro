import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db/schema";
import { eq, isNull } from "drizzle-orm";
import { getSquareClient } from "../lib/square";

const router = Router();

type ClientRow = typeof clientsTable.$inferSelect;

async function syncClientToSquare(client: ClientRow): Promise<string> {
  const square = getSquareClient();

  if (client.squareCustomerId) {
    try {
      const existing = await square.customers.get({ customerId: client.squareCustomerId });
      if (existing.customer) {
        await square.customers.update({
          customerId: client.squareCustomerId,
          givenName: client.name,
          emailAddress: client.email ?? undefined,
          phoneNumber: client.phone ?? undefined,
          note: client.notes ?? undefined,
          referenceId: `buildpro_client_${client.id}`,
        });
        return client.squareCustomerId;
      }
    } catch {
    }
  }

  const result = await square.customers.create({
    idempotencyKey: `buildpro-client-${client.id}-${Date.now()}`,
    givenName: client.name,
    emailAddress: client.email ?? undefined,
    phoneNumber: client.phone ?? undefined,
    note: client.notes ?? undefined,
    referenceId: `buildpro_client_${client.id}`,
  });

  if (!result.customer?.id) throw new Error("Square did not return a customer ID");
  return result.customer.id;
}

router.post("/sync/:clientId", async (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.clientId as string);
    if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) return res.status(404).json({ error: "Client not found" });

    const squareCustomerId = await syncClientToSquare(client);

    const [updated] = await db
      .update(clientsTable)
      .set({ squareCustomerId })
      .where(eq(clientsTable.id, clientId))
      .returning();

    res.json({ squareCustomerId, client: { ...updated, createdAt: updated.createdAt.toISOString() } });
  } catch (err: unknown) {
    console.error("Square customer sync error:", err);
    res.status(500).json({ error: "Failed to sync client to Square" });
  }
  return;
});

router.post("/sync-all", async (_req: Request, res: Response) => {
  try {
    const clients = await db.select().from(clientsTable).where(isNull(clientsTable.squareCustomerId));

    const results: { clientId: number; squareCustomerId: string; ok: boolean; error?: string }[] = [];

    for (const client of clients) {
      try {
        const squareCustomerId = await syncClientToSquare(client);
        await db.update(clientsTable).set({ squareCustomerId }).where(eq(clientsTable.id, client.id));
        results.push({ clientId: client.id, squareCustomerId, ok: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ clientId: client.id, squareCustomerId: "", ok: false, error: msg });
      }
    }

    const succeeded = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    res.json({ synced: succeeded, failed, results });
  } catch (err: unknown) {
    console.error("Square sync-all error:", err);
    res.status(500).json({ error: "Failed to sync clients to Square" });
  }
});

export default router;
