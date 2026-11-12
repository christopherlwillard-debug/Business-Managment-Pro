# Phase C — Maintenance Mode Feasibility and Proposed Plan

**Status:** Proposed for review — not approved for implementation  
**Scope:** Planning only. No application, schema, database, deployment, DNS, or live-site changes have been made.

## Executive finding

Application-level maintenance mode is feasible for the current published website routes, but the full requirement is **not safely achievable by changing this app alone**. In particular, a database flag or app middleware cannot guarantee a branded HTTP 503 after application code is rolled back: older app code would not read the new flag, and a database trigger cannot change how old code handles `SELECT` requests.

Replit's deployment documentation does not describe a pre-application edge hook or configurable maintenance response for full-stack deployments. The static-deployment configuration docs describe response-header and rewrite controls for static deployments; this project is a React app plus an Express API. A separate, independently operated front door would be required for strict rollback safety—and it must cover every public alias and prevent visitors from bypassing it through the Replit origin. Replit documentation did not establish that origin access can be restricted this way.

**Recommendation:** Treat Phase C as blocked at an architecture gate until a no-cost, supported front-door/origin-isolation path is proven for the primary public domain, all connected custom domains, and any public Replit-hosted aliases. Do not activate maintenance mode or begin implementation before that decision. If no such path exists, the rollback-safety requirement must be explicitly relaxed; an app-only design must not be represented as rollback-safe.

## Findings from the existing project

- The Website system has two distinct content sources: `website_configs` is the published snapshot; `website_config_drafts` is the private editor snapshot. Only explicit Publish promotes a draft. This is ADR-034 and is already enforced by database guards for legacy writes.
- Public API routes are mounted at `/api/public/site` before the authenticated API router. The Website Studio routes are mounted at `/api/website` with `requireOwner`. The editor's draft preview uses the authenticated `preview-by-slug` route.
- Public-site rendering has both slug and host resolution: `/site/:slug` and `/site/:slug/:page` render the React `PublicSite`; its data comes from `/api/public/site/:slug` or `/api/public/site/by-host`. Custom-domain matching uses the forwarded host and the published `settings.customDomain`.
- Public surfaces extend beyond the homepage: slug/host content, nested pages, contact and deposit submissions, view tracking, logos, favicons, about photos, section/column/portfolio images, media images, manifests, sitemaps, and robots files. Root `/sitemap.xml` and `/robots.txt` are separately mounted before auth and SPA fallback.
- The editor preview is not a public route: `PublicSite` uses `?draft=1` to call the owner-protected preview API. It must remain available to authorized owners while the public website is unavailable.
- Existing sitemap, robots, and manifest responses use one-hour public caching. A maintenance response must override that behavior; otherwise a cached prior response can mask activation or restoration.
- Public slug URLs are also available on the app host. A gateway that fronts only custom DNS domains would not, by itself, stop direct requests to those aliases or to the Replit origin.
- Replit docs say custom domains connect through DNS records, but do not document full-stack edge middleware or a pre-app custom 503 response. The documentation also did not confirm origin ACLs that would prevent a visitor from bypassing an external proxy.
- The project has a standing constraint to keep edits and ongoing usage free. An external gateway must not be assumed to be free; provider pricing and any DNS/origin changes require explicit approval.

## Proposed public-state contract

The UI should expose three mutually exclusive states:

| State | Visitor response | Content behavior |
|---|---|---|
| **Live** | Normal published website, `200` | Serve only `website_configs`; drafts remain private. |
| **Under Construction** | Branded temporary page, `503 Service Unavailable` plus `Retry-After` | Show a short pre-launch message; no website sections, forms, or private data. |
| **Maintenance Mode** | Branded temporary page, `503 Service Unavailable` plus `Retry-After` | Show a temporary outage message; no website sections, forms, or private data. |

Under Construction and Maintenance Mode differ in copy, not privacy or HTTP semantics. Both are temporary unavailability, not redirects or permanent removal. Returning to Live serves the current `website_configs` snapshot only; it never publishes `website_config_drafts`. If no published site exists, a request to return Live must fail without promoting a draft.

Every state transition, including restoration to Live, should require an explicit confirmation that names the effect and the affected domains. The server-side operation must independently require a confirmation flag; a UI dialog alone is not an authorization boundary.

## Recommended architecture and data model

### Required prerequisite: independent public front door

Use a separately controlled edge/reverse-proxy layer only if it can:

1. Serve the visitor-facing document itself with the required status and headers.
2. Cover every primary/custom domain and any public alias that must be gated.
3. Keep the private Contractor App, sign-in, Website Studio, and authenticated draft preview reachable.
4. Prevent direct-origin and alternate-host bypasses, including after the app is rolled back.
5. Return a static branded response without needing the app origin to be healthy.

The app's public website hostnames must be routed through this layer, and direct-origin access to public site/API responses must be blocked or equivalently gated outside rollbackable app code. If either condition cannot be met, this plan cannot satisfy the requested rollback guarantee.

### Authoritative maintenance state

For that edge-first architecture, use the gateway provider's persistent key/value configuration as the **single source of truth for public availability state**. Do not add a maintenance column to `website_configs`, mix operational status into published content, or create a database flag that is incorrectly described as rollback protection.

Proposed records (provider-specific syntax is intentionally deferred until a provider is selected):

```text
website-domain:<normalized-host> -> { businessId }
website-mode:<businessId> -> {
  state: "live" | "under_construction" | "maintenance",
  updatedAt: ISO-8601,
  updatedBy: owner user ID,
  retryAfterSeconds: positive integer,
  publicBrand: { name, brandColor, optional public logo URL }
}
```

The domain map is routing metadata derived from published custom-domain configuration and the supported slug alias. It must be refreshed when a site's domain mapping changes and must not resolve private drafts. `publicBrand` contains only public, approved branding (never business credentials, private settings, or draft content). The edge serves only this safe snapshot and static maintenance markup.

The authenticated app should call a server-side control endpoint that verifies the owner/business relationship and performs the provider update with a server-held credential. Never expose provider credentials to the browser. Treat an incomplete domain rollout as a failed state change: do not show success until all registered hosts acknowledge the same mode version.

**Database changes:** None are required for the recommended edge-authoritative design. `website_configs` and `website_config_drafts` remain unchanged. If an app-only fallback is chosen after relaxing rollback safety, a separate `website_operational_states` table keyed by `business_id` would be clearer than modifying either content table, but it would only survive rollback as data—not enforce maintenance in old application code.

## HTTP, search, caching, and route coverage

- Return a real `503` for the public document and each public route while unavailable; include a configurable positive `Retry-After`.
- Use `Cache-Control: no-store, max-age=0` and the gateway's equivalent CDN/surrogate no-store directive on maintenance responses. Invalidate or bypass existing one-hour cached sitemap, robots, manifest, and page responses when the state changes.
- Do not redirect visitors to a maintenance URL, return `200` for a maintenance document, or add `noindex`/robots disallow rules as a shortcut. Those can cause search engines to treat a temporary outage as a permanent removal.
- Return a minimal static HTML page with safe brand name/color and optional public logo. Do not include API errors, stack traces, editor URLs, draft fields, storage paths, account information, or form data.
- Gate all public website route families: root/slug pages and nested pages; `/api/public/site` slug/by-host content; contact/deposit submissions and view tracking; public image/logo/favicon handlers; manifest, sitemap, and robots endpoints. A maintenance response must not be cached as a normal live page.
- Keep authenticated app routes and the owner-only draft-preview endpoint outside the public-site gate. Verify this by authentication and route, not by a caller-supplied `draft=1` flag alone.
- Draft-only media remains private and must not be added to public edge records or responses. Previously published public assets may already be cached or directly addressable; maintenance mode cannot revoke copies already held by browsers or third parties.

## Security, reliability, and rollback analysis

- `requireOwner` is already the Website route boundary. New control endpoints should retain it and also validate business ownership on every read and write.
- The gateway must trust only its configured domain map, not arbitrary `Host` or `X-Forwarded-Host` values supplied by clients. Normalize hostnames and reject unknown hosts safely.
- Direct-origin access is the key unresolved security condition. If a public visitor can reach `/site/:slug`, `/api/public/site/*`, or the public API host without passing through the gateway, the mode can be bypassed. A database trigger cannot prevent this.
- On control-store uncertainty or a partial activation, prefer a closed response for a known website host and report the transition as incomplete. On restoration, do not claim Live until all mapped hosts are updated.
- Gateway outages, stale host maps, cache propagation, edge KV consistency, DNS/TLS routing, and provider limits need a tested recovery path. The default behavior should not silently expose a page when the mode cannot be checked.
- A code rollback is safe only if the independent gateway continues to enforce mode and the origin cannot be reached around it. A table/trigger in PostgreSQL alone does not meet this condition.
- Replit's public documentation does not confirm origin restrictions or an edge hook for this full-stack deployment. The front-door design therefore remains a feasibility blocker, not an implementation assumption.

## Proposed implementation phases (after approval only)

1. **Platform and domain proof** — Select a no-cost supported provider/path, inventory every primary/custom/slug alias, verify TLS, and prove origin isolation and 503 behavior in a non-production test domain. Stop if direct bypass cannot be prevented.
2. **Edge state and static responses** — Add the state/domain records, static branded Under Construction and Maintenance responses, real 503/Retry-After/no-store headers, and safe state rollout/reconciliation.
3. **Owner controls** — Add Live/Under Construction/Maintenance controls and explicit confirmation dialogs; add authenticated server proxy endpoints; enforce owner/business checks; require all host updates to succeed before reporting completion.
4. **Public route integration** — Gate pages, APIs, forms, media, metadata, and SEO endpoints; keep login, editor, and authenticated draft preview reachable. Synchronize domain mappings when published custom-domain settings change, without publishing drafts.
5. **Release verification** — Run the matrix below in development and a staging custom domain. Production DNS, deployment, activation, or restoration requires separate explicit authorization.

No phase above is approved or started by this document.

## Required test plan

### Domains and route coverage

- Test the slug-based website URL, configured primary public domain, and every connected custom domain.
- For each host, test homepage and nested page documents; slug/by-host data APIs; contact and deposit POSTs; public view tracking; logo/favicon/about/section/column/portfolio/media/card images; manifest; sitemap; and robots.
- Verify an unknown or spoofed host cannot select another business's state.
- Test aliases and direct-origin URLs from an unauthenticated browser; a successful origin bypass is a release blocker.

### Private access and draft isolation

- While each non-Live mode is active, sign in and load Website Studio; read/save a harmless development draft and load its authenticated preview.
- Verify visitors without authorization cannot call the preview endpoint or retrieve private draft media.
- Confirm public page/data responses contain only the static maintenance response, never draft section JSON, draft media URLs, or private app details.
- Restore Live and verify the published content returns while an intentionally different draft remains unpublished.

### State transitions, failure, and rollback

- Verify Live → Under Construction → Live and Live → Maintenance → Live, with confirmation on every transition.
- Verify no transition publishes a draft and failed/unconfirmed requests do not change state.
- Simulate provider timeout, partial multi-domain update, stale mapping, cache hit, cache purge failure, and edge-store outage.
- Activate maintenance, roll back the app to the prior version in a non-production environment, then test every public alias. The gateway must continue returning 503 and the origin must remain inaccessible; otherwise rollback safety fails.
- Restore Live and verify every domain returns the published site, not the draft.

### HTTP and search

- Assert exact status `503`, `Retry-After`, `Cache-Control` and CDN/surrogate no-store headers for all public route families.
- Assert no `Location` redirect, no `noindex`, no robots disallow, and no cached 200 document survives activation.
- Verify restoration returns normal `200` content and refreshed metadata/sitemaps.

## Unresolved decisions and risks

1. Which independently controlled, no-cost front-door provider can cover every required hostname and prevent direct Replit-origin access? Current documentation does not answer this.
2. Is the slug-based `/site/:slug` alias on the Replit app host part of the public maintenance guarantee, and can that alias be safely gated without exposing the origin?
3. Can every custom domain be routed through the same provider without paid usage, loss of existing DNS/TLS, or a public outage?
4. What should happen if a host update partially succeeds, the edge KV is stale, or provider control credentials are unavailable?
5. Are existing public object URLs or browser/CDN caches expected to remain accessible during maintenance? Already downloaded or third-party cached assets cannot be recalled.

Until decisions 1–3 are proven, the strict Phase C requirement is a **no-go for implementation on the current Replit configuration**. The next step is review and approval of this plan or a decision to relax the rollback/origin-isolation requirement.

## References

- Project ADR-034: Website Studio drafts stay separate from published configuration.
- Project registry, Website / Marketing / Media: `website_configs` is published; `website_config_drafts` is private.
- Relevant code: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/index.ts`, `artifacts/api-server/src/routes/website.ts`, `artifacts/api-server/src/routes/seo-crawl.ts`, `artifacts/contractor-app/src/pages/website/PublicSite.tsx`.
- Replit [Publishing](https://docs.replit.com/learn/projects-and-artifacts/replit-deployments) and [Custom Domains](https://docs.replit.com/features/publishing/custom-domains) documentation.
- Replit [Static Deployment Configuration](https://docs.replit.com/features/deployment-customization/static-deployments-advanced) documents static-deployment rewrites/headers; it does not establish an equivalent pre-app control for this full-stack app.
