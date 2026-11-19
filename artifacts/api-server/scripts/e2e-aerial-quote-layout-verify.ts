import { deleteSession, createTestLoginProof, SESSION_COOKIE } from "../src/lib/auth.js";
import { launchBrowser } from "../src/lib/launchBrowser.js";

const previewUrl = process.env.AERIAL_QUOTE_PREVIEW_URL;
if (!previewUrl || process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Run this verifier only against an explicit development preview URL.");
}
const parsedUrl = new URL(previewUrl);
if (!/\.replit\.dev$/.test(parsedUrl.hostname) && !["localhost", "127.0.0.1"].includes(parsedUrl.hostname)) {
  throw new Error("The Aerial Quote verifier requires a development preview.");
}

const browser = await launchBrowser();
let sessionId: string | undefined;

try {
  const loginPage = await browser.newPage();
  const proof = createTestLoginProof("/aerial-quote");
  const loginUrl = new URL("/api/dev-test-login", previewUrl);
  loginUrl.search = new URLSearchParams({ ...proof, returnTo: "/aerial-quote" }).toString();
  const loginResponse = await loginPage.goto(loginUrl.toString(), { waitUntil: "networkidle2" });
  if (!loginResponse?.ok()) {
    throw new Error(`Development test login returned ${loginResponse?.status() ?? "no response"}.`);
  }
  sessionId = (await loginPage.cookies(previewUrl)).find(cookie => cookie.name === SESSION_COOKIE)?.value;
  if (!sessionId) throw new Error("Development test session cookie was not issued.");

  const businessId = await loginPage.evaluate(async () => {
    const businesses = await fetch("/api/businesses").then(response => response.json());
    const business = businesses.find((item: { slug: string }) => item.slug === "general_contracting")
      ?? businesses[0];
    if (!business?.id) throw new Error("No active business is available for Aerial Quote verification.");
    return business.id as number;
  });

  const scenarios = [
    { label: "client property", propertyId: 77, clientId: 88, prospectId: null, hasRevision: true },
    { label: "prospect property", propertyId: 77, clientId: null, prospectId: 99, hasRevision: true },
    { label: "property without saved measurements", propertyId: 78, clientId: 88, prospectId: null, hasRevision: false },
  ];

  const results: Array<Record<string, unknown>> = [];
  for (const scenario of scenarios) {
    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 402, height: 874 },
    ]) {
      const page = await browser.newPage();
      await page.setViewport({ width: viewport.width, height: viewport.height });
      const blockedWrites: string[] = [];
      const pageErrors: string[] = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      await page.setRequestInterception(true);
      page.on("request", request => {
        const method = request.method().toUpperCase();
        const url = new URL(request.url());
        const respond = (data: unknown) => void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
        if (method === "GET" && url.pathname === "/api/aerial-quote/properties") {
          respond([{
            id: scenario.propertyId,
            businessId,
            clientId: scenario.clientId,
            prospectId: scenario.prospectId,
            label: scenario.label,
            street: "100 Verification Way",
            city: "Test City",
            state: "KY",
            zip: "40000",
            createdAt: "2026-01-01T00:00:00.000Z",
          }]);
          return;
        }
        if (method === "GET" && url.pathname.endsWith("/measurement-revisions")) {
          respond(scenario.hasRevision ? [{
            id: 333,
            propertyId: scenario.propertyId,
            revision: 1,
            source: "manual",
            entries: [{ label: "Front lawn", category: "Lawn", kind: "area", quantity: 1000, unit: "sq_ft" }],
            notes: "Test fixture",
            createdAt: "2026-01-01T00:00:00.000Z",
          }] : []);
          return;
        }
        if (method === "GET" && url.pathname.endsWith("/access")) {
          respond([]);
          return;
        }
        if (method === "GET" && url.pathname === "/api/aerial-quote/pricing-profiles") {
          respond([{
            id: 55,
            businessId,
            serviceKey: "lawn_mowing",
            version: 1,
            displayName: "Test mowing profile",
            rules: { components: [{ label: "Mowing", category: "Service", kind: "area", unit: "sq_ft" }] },
            createdAt: "2026-01-01T00:00:00.000Z",
          }]);
          return;
        }
        if (method === "GET" && url.pathname === "/api/clients") {
          respond([{ id: 88, name: "Test Client" }]);
          return;
        }
        if (method === "GET" && url.pathname === "/api/estimates") {
          respond([]);
          return;
        }
        if (method === "GET" && url.pathname === "/api/prospects") {
          respond([{ id: 99, contactName: "Test Prospect", status: "needs_measurements" }]);
          return;
        }
        if (method === "GET" || method === "HEAD") {
          void request.continue();
          return;
        }
        blockedWrites.push(`${method} ${new URL(request.url()).pathname}`);
        void request.abort("blockedbyclient");
      });

      const params = new URLSearchParams({ propertyId: String(scenario.propertyId) });
      if (scenario.prospectId) params.set("prospectId", String(scenario.prospectId));
      await page.goto(`${previewUrl}/aerial-quote?${params.toString()}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => [...document.querySelectorAll("h1")].some(item => item.textContent?.trim() === "Aerial Quote"), { timeout: 30000 });
      await page.waitForSelector(".leaflet-container", { timeout: 30000 });

      const layout = await page.evaluate(() => {
        const headings = [...document.querySelectorAll("h2")];
        const mapSection = headings.find(item => item.textContent?.includes("Map measurements"))?.closest("section");
        const propertySection = headings.find(item => item.textContent?.includes("Choose a property"))?.closest("section");
        const mapRect = mapSection?.getBoundingClientRect();
        const propertyRect = propertySection?.getBoundingClientRect();
        const mapRectBox = document.querySelector(".leaflet-container")?.getBoundingClientRect();
        return {
          mapFirst: Boolean(mapRect && propertyRect && (innerWidth < 768
            ? mapRect.top < propertyRect.top
            : mapRect.left < propertyRect.left)),
          viewportWidth: innerWidth,
          mapX: mapRect?.left ?? null,
          mapY: mapRect?.top ?? null,
          propertyX: propertyRect?.left ?? null,
          propertyY: propertyRect?.top ?? null,
          mapHeight: mapRectBox?.height ?? 0,
          drawArea: [...document.querySelectorAll("button")].some(button => button.textContent?.trim() === "Draw area"),
          measureLength: [...document.querySelectorAll("button")].some(button => button.textContent?.trim() === "Measure length"),
          profileEditorVisible: document.body.innerText.includes("Create a pricing profile version"),
          revisionPickerVisible: document.body.innerText.includes("Start from a saved revision"),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          internalScroll: [...document.querySelectorAll("div")].some(element =>
            element.scrollHeight > element.clientHeight + 50 && getComputedStyle(element).overflowY === "auto"),
        };
      });

      if (!layout.mapFirst || layout.mapHeight < 400 || !layout.drawArea || !layout.measureLength
        || !layout.profileEditorVisible || !layout.revisionPickerVisible || layout.horizontalOverflow
        || !layout.internalScroll) {
        throw new Error(`${scenario.label} ${viewport.name} layout check failed: ${JSON.stringify(layout)}`);
      }

      await page.evaluate(() => {
        const drawButton = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Draw area");
        drawButton?.click();
      });
      await page.waitForFunction(() => document.body.innerText.includes("0 points · need 3"), { timeout: 5000 });
      const mapBounds = await page.$eval(".leaflet-container", element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      const mapHitTarget = await page.evaluate(({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        return { tag: target?.tagName, className: (target as HTMLElement | null)?.className };
      }, { x: mapBounds.x + mapBounds.width * 0.3, y: mapBounds.y + mapBounds.height * 0.3 });
      for (const [x, y] of [[0.3, 0.3], [0.55, 0.38], [0.4, 0.6]]) {
        await page.evaluate(({ x: clientX, y: clientY }) => {
          document.elementFromPoint(clientX, clientY)?.dispatchEvent(new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX,
            clientY,
          }));
        }, { x: mapBounds.x + mapBounds.width * x, y: mapBounds.y + mapBounds.height * y });
      }
      await page.waitForFunction(() => document.body.innerText.includes("3 points · need 3"), { timeout: 10000 })
        .catch(async () => {
          const visible = await page.evaluate(() => document.body.innerText.slice(-500));
          throw new Error(`Map clicks did not add vertices; hit target ${JSON.stringify(mapHitTarget)}; visible ${visible}`);
        });
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button =>
        button.textContent?.trim() === "Finish drawing" && !button.disabled), { timeout: 10000 });
      await page.evaluate(() => {
        const finishButton = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Finish drawing");
        finishButton?.click();
      });
      await page.waitForFunction(() => document.body.innerText.includes("Area 1"));
      await page.evaluate(() => {
        const addButton = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Add map measurements");
        addButton?.click();
      });
      await page.waitForFunction(() => [...document.querySelectorAll("input[aria-label='Measurement name']")]
        .some(input => (input as HTMLInputElement).value === "Aerial area 1"));

      if (blockedWrites.length || pageErrors.length) {
        throw new Error(`${scenario.label} ${viewport.name} had writes or browser errors: ${JSON.stringify({ blockedWrites, pageErrors })}`);
      }
      results.push({ scenario: scenario.label, viewport: viewport.name, ...layout, polygonApplied: true, blockedWrites: 0, pageErrors: 0 });
      await page.close();
    }
  }

  console.log(JSON.stringify({ authenticated: true, businessDataMutated: false, results }, null, 2));
} finally {
  if (sessionId) await deleteSession(sessionId);
  await browser.close();
}
