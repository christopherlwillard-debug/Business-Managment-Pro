import { Router, type Request, type Response } from "express";
import { wrapAsync } from "./guards";

const router = Router();

router.get(
  "/geocode",
  wrapAsync(async (req: Request, res: Response) => {
    const { street, city, state, postalcode } = req.query as Record<string, string | undefined>;

    if (!street && !city && !postalcode) {
      res.status(400).json({ error: "Provide at least street, city, or postalcode" });
      return;
    }

    const params = new URLSearchParams({
      format: "json",
      limit: "5",
      countrycodes: "us",
      addressdetails: "1",
    });
    if (street)     params.set("street", street);
    if (city)       params.set("city", city);
    if (state)      params.set("state", state ?? "");
    if (postalcode) params.set("postalcode", postalcode);

    const nominatimRes = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          "User-Agent": "BuildPro/1.0 (Willards General Contracting; willardsgeneralcontracting@gmail.com)",
          "Accept-Language": "en-US,en",
          "Referer": "https://buildpro.app",
        },
      }
    );

    if (!nominatimRes.ok) {
      res.status(502).json({ error: "Geocoding service error" });
      return;
    }

    const data = await nominatimRes.json();
    res.json(data);
  })
);

export default router;
