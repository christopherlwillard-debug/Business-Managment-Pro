import { Router } from "express";
import { isSquareConfigured, getSquareClient, getLocationId } from "../lib/square";

const router = Router();

function bigIntSafe(val: unknown): unknown {
  if (typeof val === "bigint") return Number(val);
  if (Array.isArray(val)) return val.map(bigIntSafe);
  if (val !== null && typeof val === "object") {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, bigIntSafe(v)])
    );
  }
  return val;
}

router.get("/square/live-transactions", async (req, res) => {
  if (!isSquareConfigured()) {
    return res.json({ transactions: [], connected: false, message: "Square is not configured" });
  }

  try {
    const client = getSquareClient();
    const locationId = getLocationId();

    const rawDays = req.query["days"];
    const days = typeof rawDays === "string" ? Math.min(Math.max(parseInt(rawDays, 10) || 30, 1), 365) : 30;

    const endTime = new Date();
    const beginTime = new Date();
    beginTime.setDate(beginTime.getDate() - days);

    const allPayments: unknown[] = [];
    let cursor: string | undefined = undefined;

    do {
      const result = await client.payments.list({
        locationId,
        beginTime: beginTime.toISOString(),
        endTime: endTime.toISOString(),
        sortOrder: "DESC",
        limit: 200,
        cursor,
      });

      const payments = (result as { payments?: unknown[]; cursor?: string }).payments ?? [];
      allPayments.push(...payments);
      cursor = (result as { cursor?: string }).cursor;
    } while (cursor && allPayments.length < 500);

    const safe = bigIntSafe(allPayments) as Array<Record<string, unknown>>;

    const transactions = safe.map((p) => {
      const amountMoney = p["amountMoney"] as { amount?: number; currency?: string } | undefined;
      const cardDetails = p["cardDetails"] as {
        card?: { cardBrand?: string; last4?: string; cardholderName?: string };
        status?: string;
      } | undefined;

      return {
        id: p["id"] ?? null,
        status: p["status"] ?? null,
        createdAt: p["createdAt"] ?? null,
        updatedAt: p["updatedAt"] ?? null,
        amountCents: amountMoney?.amount ?? 0,
        currency: amountMoney?.currency ?? "USD",
        buyerEmail: p["buyerEmailAddress"] ?? null,
        cardBrand: cardDetails?.card?.cardBrand ?? null,
        last4: cardDetails?.card?.last4 ?? null,
        cardholderName: cardDetails?.card?.cardholderName ?? null,
        note: p["note"] ?? null,
        referenceId: p["referenceId"] ?? null,
        sourceType: p["sourceType"] ?? null,
        receiptUrl: p["receiptUrl"] ?? null,
        receiptNumber: p["receiptNumber"] ?? null,
      };
    });

    const completedOnly = transactions.filter((t) => t.status === "COMPLETED");
    const totalCents = completedOnly.reduce((sum, t) => sum + (t.amountCents as number), 0);

    res.json({
      connected: true,
      transactions,
      summary: {
        totalCents,
        completedCount: completedOnly.length,
        totalCount: transactions.length,
        days,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch Square transactions";
    console.error("Square live-transactions error:", err);
    res.status(500).json({ error: message });
  }
});

export default router;
