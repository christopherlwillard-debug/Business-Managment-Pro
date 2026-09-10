# Contractor Platform and Website Studio Domain Separation

## Goal

Make the deployment identity and domain behavior clearly reflect one multi-business Contractor Management Platform that contains Website Studio. Public business websites must remain separate from the authenticated contractor dashboard at the hostname level without creating separate projects, databases, authentication systems, or Website Studio implementations.

## Architecture

The existing `artifacts/contractor-app` remains the single web artifact and the existing API/database remain shared:

```text
One Contractor Management Platform
├── Authenticated contractor dashboard
│   └── the generated *.replit.app URL
├── Business management and financial systems
└── Website Studio
    ├── willardsgc.com → the configured Willard's GC public site
    ├── future business domain → that business's configured public site
    └── additional domains → their matching business site configurations
```

The public-site API already resolves a site from the incoming hostname and the frontend already distinguishes Replit-managed application hosts from custom public-site hosts. Preserve that model.

## Host-routing contract

| Incoming host | Interface | Authentication | Expected result |
| --- | --- | --- | --- |
| `*.replit.app` | Contractor dashboard | Required | Login or authenticated dashboard shell |
| `*.replit.dev` / localhost | Development contractor app | Development auth | Admin app for local testing |
| `willardsgc.com` | Willard's GC public site | None | Published Website Studio content for the mapped business |
| Another verified business domain | That business's public site | None | Published Website Studio content for the mapped business |
| Unknown custom host | Public-site lookup | None | Existing “No site found for this domain” response; never the dashboard |
| `/site/:slug` preview/public path | Slug-based public site | None for published content; authenticated preview only for draft content | Existing slug route behavior |

The generated Replit URL remains the dashboard origin. No public-domain request may render `AdminApp`, and no dashboard-host request may render `PublicSite` solely because its site lookup fails.

## Changes

1. Rename the web artifact title from `Contractor Management App` to `Contractor Management Platform + Website Studio` so Replit deployment metadata does not imply that the public custom domain is a dashboard-only application.
2. Keep the generated Replit URL as a valid dashboard fallback.
3. Keep `willardsgc.com` as the public Website Studio domain for the configured Willard's GC business website.
4. Keep public-domain routing based on business website configuration and incoming hostname. Do not hard-code the public domain into dashboard selection, introduce project-per-business routing, or duplicate databases.
5. Update user-facing deployment/domain documentation in the repository to describe the one-platform/multiple-public-sites model.

## Domain and DNS behavior

Replit's custom-domain attachment remains project-level infrastructure. Application routing is responsible for interpreting the hostname:

- `*.replit.app`/`*.replit.dev` are BuildPro application hosts.
- `willardsgc.com` and future configured business domains are public Website Studio hosts.
- A public hostname with no matching published website configuration returns the existing no-site result rather than opening the dashboard.

Custom domains must be verified by Replit before they are treated as production public websites. Each verified public domain is stored in exactly one published Website Studio configuration and is resolved to that configuration's business. Domain normalization must be case-insensitive, remove an optional trailing dot, and reject ambiguous duplicate mappings. Removing or reassigning a domain must stop serving the old business after the published configuration/cache is refreshed.

Host headers are read behind Replit's trusted proxy. The API must normalize the forwarded host consistently and must not accept an arbitrary client-supplied forwarded host when running outside the trusted deployment proxy. Hostname lookup is only a public-site selector; it is never an authorization mechanism for editor, media, publish, or business-management routes.

## Error handling and security boundaries

- Missing public-site domain mapping continues to show the existing public-site error response.
- An unauthenticated request to the dashboard hostname continues through the normal authentication screen.
- The generated Replit dashboard URL remains the stable dashboard URL; no custom dashboard DNS record is required.
- No redirects send public website visitors to the dashboard.
- Draft, unpublished, or deleted Website Studio configurations are never served from a public custom domain.
- Public-site requests do not rely on dashboard session cookies or expose authenticated editor routes.
- Website editor, preview, publish, media, and contact-form routes remain business-authorized independently of hostname lookup.

## Verification

- Artifact metadata validates with the artifact schema.
- Frontend typecheck and production build pass.
- Public-site host routing tests map a configured domain to its business and reject unknown/unpublished domains.
- Dashboard host tests render only the authenticated app shell/login path.
- Host normalization tests cover case, trailing dots, missing forwarded hosts, and duplicate-domain rejection.
- Published-site HTML, metadata, sitemap, robots, manifest, favicon, and error responses remain public-site-only; dashboard auth, PWA, and editor assets remain dashboard-only.
- Production verification checks both `willardsgc.com` and the generated Replit URL after publishing.
- Domain setup instructions identify the user-controlled DNS step separately from code changes.

## Out of scope

- Splitting Website Studio into another Replit project.
- Creating a second database, API, authentication system, or artifact.
- Automatically changing DNS records or claiming `app.willardsgc.com` without user verification.
- Changing how businesses are isolated in the database.
- Building per-business PWA manifests, install prompts, or service workers beyond preserving the existing runtime boundary.