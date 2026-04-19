import { Router } from "express";
import { isSquareConfigured, getSquareClient } from "../lib/square";

const router = Router();

router.get("/square/status", async (_req, res) => {
  if (!isSquareConfigured()) {
    return res.json({
      connected: false,
      message: "Add SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID to your environment to enable Square payments",
    });
  }

  try {
    const client = getSquareClient();
    const result = await client.merchants.get({ merchantId: "me" });
    const merchant = result.merchant;

    res.json({
      connected: true,
      merchantId: merchant?.id ?? null,
      businessName: merchant?.businessName ?? null,
      country: merchant?.country ?? null,
      currency: merchant?.currency ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to retrieve Square account";
    console.error("Square status error:", err);
    res.json({
      connected: false,
      message,
    });
  }
});

export default router;
