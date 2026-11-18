# BuildPro — Aerial Quote Existing-Capability Audit

**Audit date:** 2026-11-18
**Scope:** Read-only inspection of application source, package manifests, database schemas, API routes, generated API contract, and current official provider policies.
**Not performed:** No secret values read; no API keys or settings changed; no paid provider requests, production data reads/writes, database changes, migrations, code changes, workflow restarts, or deployment. This audit verifies implementation from source; it does not claim the authenticated UI or production records were exercised.

## 1. Executive summary

BuildPro already has a useful estimating foundation: business-scoped properties, optional client/job links, append-only numeric measurement revisions, versioned service pricing profiles, a server-side pricing engine, and standard draft-estimate creation. Saved numeric measurements can be reused for multiple service estimates.

The current Aerial Quote experience does **not** load a map, locate an address, draw property boundaries, calculate an area from coordinates, or save polygon geometry. The map was deliberately left out of the November 12, 2026 manual-first implementation while Google key restrictions and imagery/measurement rights remained unverified. This is not evidence of a map-loading regression.

The repository contains active Leaflet mapping in Route Planner, Mapbox tile/geocoding support, Census/Nominatim/Google/Mapbox geocoding paths, and installed Turf.js. These do not currently provide Aerial Quote with a map or measurement editor. Turf.js is installed but no application source imports it. The existing property and revision model can hold labeled numeric measurements, but not drawn geometry.

**Recommended order:** Option A—reuse the current property, revision, and estimate architecture; add geometry only after an authorized map surface is chosen. Option B—use the already-installed Leaflet and Turf.js for polygon interaction and local geometry calculations if a suitable, licensed map surface is available. Avoid paying for a measurement provider unless the first two approaches cannot meet imagery, accuracy, or workflow needs. Google satellite imagery must not be used as the surface from which users trace or digitize measurements unless a written agreement explicitly permits it.

## 2. Existing technology inventory

| Capability | Verified state | Evidence / implications |
|---|---|---|
| Leaflet | **Active** for Route Planner. `react-leaflet` provides the map container, markers, popups, polylines, and map fitting. | `artifacts/contractor-app/src/pages/RoutePlanner.tsx` imports Leaflet at lines 4–5 and renders the map at 1880–1948. |
| Mapbox maps | **Active conditionally** in Route Planner. The map uses Mapbox Streets raster tiles when `MAPBOX_TOKEN` is returned; otherwise it falls back to public OpenStreetMap raster tiles. It is not an aerial/satellite layer. | `RoutePlanner.tsx` lines 1887–1899; `GET /api/mapbox-token` in `artifacts/api-server/src/routes/geocode.ts` lines 196–203. |
| Mapbox geocoding | **Active as a fallback** in `/api/geocode`; also not used by Aerial Quote's property form. | `geocode.ts` lines 58–97. |
| Mapbox GL / React Map GL | **Not found** as a package or active application import. Mapbox tiles are rendered through Leaflet, not Mapbox GL. |
| Google Maps JavaScript map | **Not found** as an active map renderer. No Maps JS loader, Google map component, or Google satellite layer is in active source. |
| Google geocoding | **Active as a last fallback** in `geocodeAddressString`, used by RoutingEngine, route stops, and property lookup. | `artifacts/api-server/src/geocode-helpers.ts` lines 110–151 and 197–237. |
| Google Drive Picker | **Active**, and it reads `VITE_GOOGLE_API_KEY` in browser code. This is a separate Google product use from map rendering. | `artifacts/contractor-app/src/lib/googleDrivePicker.ts` lines 1–2 and 29–47. |
| Census geocoding | **Active first choice** for structured U.S. street addresses. | `geocode-helpers.ts` lines 23–64, 207–213. |
| OpenStreetMap / Nominatim | **Active** in Route Planner as a tile fallback and in two geocoding paths. OSM is street/map data, not satellite imagery. | Route Planner lines 1895–1899; `geocode.ts` lines 68–84; `geocode-helpers.ts` lines 66–108 and 215–228. |
| Turf.js | **Installed but not used** by application source. No `@turf/turf` import was found outside package/build configuration. It could support local geometry calculations without a per-calculation provider call. | `artifacts/contractor-app/package.json` dependency at line 92. |
| Leaflet drawing/editing plugins | **Not found** in dependencies or active imports. Leaflet itself is present, but a polygon editor would still need a plugin or custom interaction. |
| MapLibre | **Not found** in dependencies or active imports. |
| Static U.S. geography | `us-atlas`-derived SVG state paths exist for a website section; this is not a geocoded property map or measurement tool. | `artifacts/contractor-app/src/pages/website/sections/USMapData.ts`. |
| Aerial imagery / image measurement | **Not found** in active Aerial Quote code. No aerial tile service, imagery API, polygon measurement layer, or image cache is connected to the page. |
| Distance and route geometry | Route Planner uses OSRM route geometry for a displayed route polyline. The shared RoutingEngine geocodes and calls the public OSRM route endpoint for driving distance/time, with a Haversine fallback and an in-memory 24-hour cache. This is not property area/perimeter measurement. | `RoutePlanner.tsx` around line 234; `artifacts/api-server/src/lib/routing-engine.ts` lines 27–50, 86–155. |
| Other geospatial packages | `d3-geo`, `topojson-client`, and `us-atlas` are present in the frontend manifest; no active import of `d3-geo` or `topojson-client` was found in the searched application source. The existing state SVG data is static. | `artifacts/contractor-app/package.json`; source import search. |

### Configuration names (values intentionally not inspected)

- `VITE_GOOGLE_API_KEY`: used in the browser for Drive Picker and server-side through the credential manager for Google geocoding.
- `MAPBOX_TOKEN`: read by the API server for Mapbox geocoding and exposed by `/api/mapbox-token` to the web client for Mapbox tile requests.

The repository cannot show whether these provider keys are currently present, restricted, billing-enabled, or correctly scoped in their provider consoles. The Google key is shared across browser and server contexts, so its current restriction state cannot be inferred from the variable name. Do not change this key as part of this audit. A separate browser-restricted Maps key is a future recommendation only if Google Maps JavaScript API is approved for view-only use.

## 3. Current Aerial Quote workflow

The active route is `/aerial-quote`, owner-only. `AerialQuote.tsx` re-exports `AerialQuoteManual.tsx`; the historical map-first page is not the active implementation. This manual-first scope matches ADR-035 and the November 12 architecture changelog entry, which deferred map imagery and geometry pending verified key restrictions and measurement/storage rights.

| Workflow step | Status | Existing support / gap |
|---|---|---|
| Customer or property selection | **Works, basic** | Aerial Quote loads business-scoped properties and clients. A property can have an optional client. There is no customer-first address autocomplete in this page. |
| Property address entry | **Works, manual** | Street, city, state, and ZIP are entered into form fields and stored on `properties`. Address fields are optional; no geocode/validation call is made by this form. |
| Map loading | **Missing by design** | The page says map-based measurement is unavailable until access and licensing are cleared (`AerialQuoteManual.tsx` line 337). There is no map component or map API call in the page. |
| Property location identification | **Missing in Aerial Quote** | No address-to-coordinate search, location marker, parcel lookup, or map positioning is connected to the page. General `/api/geocode` functionality exists elsewhere. |
| Boundary drawing / polygon editing | **Missing** | No draw controls, polygon state, vertex editing, multiple polygon regions, deletion, or polygon validation. |
| Area / perimeter calculation | **Missing from geometry** | Users type numeric quantities. The pricing engine converts known units but receives no coordinates and does not derive area/perimeter. |
| Measurement saving | **Works for numeric entries** | A property can have revisions containing named entries with category, dimension kind, numeric quantity, unit, and notes. Source is limited to `manual` or `on_site`. |
| Revision history | **Works** | Saving creates the next revision; existing revisions are listed and can be selected. Older revisions remain. |
| Service selection | **Works, bounded catalog** | Current keys are lawn mowing, landscaping, parking-lot cleaning, snow removal, asphalt sealing, and property maintenance. |
| Pricing | **Works for saved numeric entries** | A server-side engine applies versioned components, unit conversion, fixed/per-unit charging, margin mode, minimum charge, rounding, and an explainable calculation trace. |
| Estimate creation | **Works** | The Aerial Quote route creates a standard draft estimate with property/client/business context, line items, and a calculation snapshot. |
| Quote / invoice integration | **Partial, via existing estimate flow** | The result is a normal draft estimate in the existing Estimates/Quote Center system. It does not directly create or send an invoice. Quote delivery/decision uses the existing quote-event system; no direct Aerial Quote-to-invoice operation was observed. |
| Client Profile reuse | **Works for saved data** | `ClientPropertiesQuotes.tsx` lists properties and measurement revisions and can create separate estimates from an existing revision/profile. It explicitly reports that map measurement is unavailable. |
| Jobs link | **Works, optional association** | Jobs can select an existing property; the job-to-property field is nullable. This associates a job with a property but does not add mapping or measurement capability. |

### User experience observations

- The current interface is a four-section form: Property, Manual measurements, Pricing profile, Calculate/create estimate. It is not a spatial workspace.
- The property and measurement form controls are always present together. The page is information-dense on small screens, even though fields use responsive grids.
- Measurements are entered one at a time as label/category/kind/quantity/unit. The entries list is flexible but does not show a spatial summary, perimeter, area preview, or map.
- Revisions are preserved, and the Client Profile shows revision number, source, date, and entry quantities. This is a useful existing return/reuse path.
- The user must separately create a pricing profile before calculating; this is powerful but makes first use more complex.
- The property form supports editing and business-sharing permissions. Route access is owner-only; property access grants govern reads, measuring, estimating, and management across same-legal-business divisions.
- No authenticated browser session was used for this read-only audit, so the visual assessment is based on source and responsive class behavior, not a live signed-in screenshot.

## 4. Database and data relationships

| Table | Existing responsibility | Geometry/revision implications |
|---|---|---|
| `properties` | Business-owned property identity; optional client; label, address, notes, timestamps. | No latitude/longitude, parcel ID, polygon, imagery provider, or boundary field. |
| `property_measurement_revisions` | Append-only revisions for one property; revision number, source, JSONB `entries`, notes, author, timestamp. | Entries are numeric named measurements; no polygon coordinates/geometry. Source DB constraint allows only `manual` and `on_site`. |
| `property_business_access` | Same-legal-business property access and permission history/revocation. | Existing permission boundary can govern future measure/view operations; no new property ownership model is necessary for ordinary measurement capture. |
| `service_pricing_profile_versions` | Versioned service/rules JSON by business and service key. | Profiles match measurements by category, kind, and unit. |
| `estimates` | Standard estimate, line items, property/client/business/job links, and calculation snapshot. | Aerial Quote writes `propertyId` and stores `measurementRevisionId` and profile version in JSON `calculationSnapshot`. The measurement revision ID is not a relational foreign key, so referential integrity is carried by application snapshot data rather than a DB FK. |
| `estimate_quote_events` | Frozen quote revision and append-only delivery/view/customer-response/work-authorization history. | Its revision snapshots refer to estimate quote revisions, not property measurement revisions. Keep the two revision concepts distinct. |
| `clients` / `businesses` | Customer and legal/business ownership context. | Property and estimate reads/writes are business-scoped; client association is optional and validated to the same legal business. |
| `jobs` | Optional operational job relationship to a customer property. | `jobs.property_id` is nullable and references `properties`; it does not replace the property address or own its measurements. |

**Answers to the requested data questions:**

- Property boundaries and map coordinates are **not stored** in the current schema.
- Polygon or measurement geometry is **not saved**. Only numeric entry records are saved inside JSONB.
- Measurements can be revised by creating a new property revision; prior numeric revisions are preserved.
- Different services can match different categories, dimension types, and units. Multiple entries can represent separately labeled areas, but only as user-entered quantities—not polygons.
- Revisions are tied to a property; the property is tied to a business. Revision rows do not contain their own `business_id`.
- An Aerial Quote estimate snapshots a specific `measurementRevisionId` and pricing-profile version in JSON, alongside calculation details and line items; no DB FK enforces that measurement link.
- The same property and revision can be reused for separate service estimates. Client Profile explicitly supports this workflow.
- No duplicate property, expense, or revenue table is needed for a measurement tool. Any future geometric detail should be evaluated as an extension to this existing property/revision source of truth, not a second estimating subsystem.

## 5. Existing capabilities that work

1. Create, update, list, and business-scope properties.
2. Link a property to an existing client, optionally.
3. Share a property with another division of the same legal business using view/measure/estimate/manage permissions.
4. Store multiple named manual/on-site measurements with supported area, length, count, and time units.
5. Preserve and select past measurement revisions.
6. Reuse a saved measurement revision across service profiles and separate estimates.
7. Version business-specific pricing profiles.
8. Calculate prices server-side with validated inputs, conversion/rounding rules, a calculation trace, and a saved snapshot.
9. Create standard draft estimates that continue through existing quote and invoice workflows.
10. Link an existing customer property to a job.
11. Render an interactive street/route map in Route Planner and geocode addresses elsewhere in the app.

These are source-level findings. No production records or running authenticated UI were inspected.

## 6. Partially implemented capabilities

- **Map display infrastructure:** Leaflet/React-Leaflet is already active in Route Planner. It displays Mapbox Streets tiles when configured or OSM standard tiles otherwise. This proves a map-rendering stack exists, not that it has aerial imagery or can be reused without UI, provider, and licensing work.
- **Address lookup infrastructure:** There are working geocoding paths in other app flows, but Aerial Quote’s property address form does not invoke them. The general `/api/geocode` path and the `geocodeAddressString` helper have different fallback sequences, increasing maintenance complexity.
- **Geometry computation library:** Turf.js is installed but unused. It could calculate area and perimeter from valid user-provided coordinates; it cannot provide a map surface or authorize deriving coordinates from restricted imagery.
- **Multiple measurement regions:** The current entries array allows multiple labeled categories and quantities. It does not provide a shared map, polygon shape, hole/exclusion, or editing relationship.
- **Estimate continuity:** Aerial Quote creates the standard draft estimate and records measurement/profile IDs in a snapshot. The relationship is not a relational FK, and quote revision events have their own separate revision IDs.
- **Mapbox access:** Mapbox uses a token for tile rendering and geocoding, but token configuration, URL restrictions, billing status, and quotas could not be confirmed from source.
- **Google access:** The key name exists in the code paths, but the map renderer is absent and key restrictions are unverified.

## 7. Missing functionality

- Property map inside Aerial Quote; satellite/aerial layer; address search and map positioning on that page.
- Polygon drawing/editing/deletion, multiple shapes/holes, labeled map regions, vertex handles, undo, and geometry validation.
- Automatic square-foot/acre/perimeter calculation and display from coordinates.
- Saved geometry and source/imagery metadata associated with each revision.
- Summaries by property area, lawn, beds, driveways, parking, sidewalks, building footprints, asphalt, and user-defined custom regions.
- A workflow to select permitted imagery and preserve appropriate source/date/attribution context.
- A map/drawing interaction that works on mobile/tablet and is tested for touch controls.
- An authenticated end-to-end test that creates a property, saves/reopens a geometric revision, calculates an estimate, and verifies the selected revision is retained in its snapshot.

## 8. Licensing, privacy, and cost assessment

### Google Maps

- Google’s Maps JavaScript policies say not to create content based on Google Maps content, with examples including tracing or digitizing features from satellite imagery. Viewing a Google map and calculating geometry from user-provided coordinates are distinct actions; policy does not make those equivalent.
- The current app does not render Google Maps JavaScript maps. The shared `VITE_GOOGLE_API_KEY` is used by Drive Picker in browser code and as a backend geocoding fallback. Its Cloud Console API/application restrictions and billing configuration are unverified.
- Google recommends both application restrictions (for example, website referrers for browser keys) and API restrictions. A future browser map should not reuse/change the existing shared key without review; a separate, restricted key is a recommendation only.
- If Maps JavaScript API is added, Google’s published policy also requires publicly accessible Terms of Use and Privacy Policy incorporating Google’s terms/privacy requirements, with proper attribution.
- Google Maps Platform is usage-metered, with SKU-specific free monthly usage caps and pay-as-you-go pricing after those caps. A dollar estimate requires the selected APIs and expected traffic; no map loads or API usage were made during this audit.

### OpenStreetMap and Nominatim

- OpenStreetMap **data** is open under ODbL and requires attribution. That does not make the public `tile.openstreetmap.org` servers a free unlimited commercial tile-hosting service.
- The OSM Foundation tile usage policy says tile capacity is limited, best-effort/no SLA, and usage that harms service may be blocked. It disallows bulk downloading and offline use of those public tiles. For production volume, use a provider with an appropriate plan or host tiles/data yourself; either option has operating costs.
- The public Nominatim service is limited-capacity. Its policy sets an absolute maximum of one request per second, discourages autocomplete and bulk usage, and can change. It is not a production autocomplete guarantee. A hosted/commercial geocoder may charge by request or plan.
- OSM street maps do not provide aerial imagery. OpenStreetMap’s free data and Leaflet do not, by themselves, satisfy the aerial-photo measurement requirement.

### Mapbox

- Current Mapbox use is conditional: Route Planner requests Mapbox Streets raster tiles if `MAPBOX_TOKEN` is available; `/api/geocode` uses Mapbox Geocoding as a final fallback. It is not evidence of a Mapbox Aerial Quote integration.
- Mapbox is usage-priced. Its public pricing page has separate meters for map/tile usage and search/geocoding; exact current pricing depends on API product, volume, and account terms. Mapbox tokens can be URL-restricted, but the current token’s restrictions cannot be confirmed from the repository.
- The existing geocoding call uses temporary geocoding by default. Mapbox documentation distinguishes temporary results (not cacheable) from permanent results (storeable under the permanent mode and its billing/account conditions). Do not persist returned geocoding content without confirming the applicable mode and terms.
- **Coordinate-retention review needed:** `/api/geocode` can fall back to temporary Mapbox geocoding, and its UI callers can persist selected coordinates in prospects and route stops. Separately, `geocodeAddressString` can fall back to Google geocoding and is used by route-stop/property-lookup flows. The stored coordinates do not record which provider supplied them. This is a concrete retention/provenance risk to review against provider terms; this source audit does not determine legal compliance or identify which provider produced any existing row.
- No Mapbox GL SDK is installed; current tiles are consumed through Leaflet.

### Other open-source components and public endpoints

- Leaflet and Turf.js are open-source software components and do not themselves meter map rendering or geometry calculations. They do not grant rights to imagery, tiles, geocoding, or stored derived data.
- The public OSRM routing endpoint is used for route distance/shape in other workflows, not property measurement. It is a shared public service, not a contractual production SLA or aerial imagery source.
- U.S. Census geocoding is an existing public U.S.-address source. It returns address coordinates, not imagery or measurement geometry.
- No existing cache for aerial imagery or measurements was found. RoutePlanner’s external tiles are requested by the browser; RoutingEngine has its own 24-hour in-memory route-result cache, unrelated to Aerial Quote.

### Important distinctions

1. **Viewing imagery:** can be allowed by a provider’s map product and still require attribution, a restricted key, and permitted web terms.
2. **Drawing on a map surface:** must be allowed by the specific imagery/map license; do not trace Google satellite imagery under standard published policy.
3. **Calculating geometry from user-supplied coordinates:** can be performed locally with Turf.js without a measurement API call, but that does not resolve whether the coordinates were lawfully digitized.
4. **Saving polygon/derived measurements:** requires rights to retain and reuse the inputs/results for BuildPro estimates; this is separate from displaying the map.
5. **Republishing imagery:** is separately restricted and may require a commercial/custom license even if measurement quantities can be stored.

## 9. Free improvement opportunities

Without a paid measurement provider, the existing stack could support a modest workflow **if a permitted map surface is selected**:

- Reuse Leaflet already in the app rather than introduce a second map renderer.
- Add a drawing plugin or carefully scoped custom polygon interaction; no drawing plugin is currently installed.
- Use the already-installed Turf.js for local polygon area, length/perimeter, unit conversion, and validation from user-supplied coordinates.
- Save labeled numeric results through the existing Aerial Quote revision endpoint. Whether full coordinates should be stored requires a schema/design review; the current revision JSON could technically hold more data, but it has no geometry schema or validation today.
- Keep the existing server-side pricing engine and standard estimate flow.
- Use a permitted street/base map for location navigation; do not claim that OSM provides aerial imagery.
- Keep free/public services low-volume and respect their attribution, usage, and service limits. A production map tile or geocoder provider may still cost money even when the rendering library and geometry math are open source.

Potential no-provider constraint: if aerial imagery suitable for visual property measurement is mandatory and no appropriately licensed public imagery is available for the desired geography/resolution/freshness, a truly free solution may not meet the requested experience. This is a coverage/imagery question, not a Leaflet/Turf limitation.

## 10. Recommended user experience

The intended experience can remain a focused property workspace rather than a GIS editor:

1. Pick an existing client property or add an address.
2. Show a permitted map surface and an address pin.
3. Provide a simple region tool: draw, label, undo, edit vertices, and remove.
4. Display area/perimeter as the polygon changes, with clear units and a human-readable measurement list.
5. Let users classify regions (for example, lawn, bed, driveway, parking, sidewalk, building, custom) without forcing a category when they need a custom measurement.
6. Save all regions as a new immutable property measurement revision with source/date and measurement method.
7. Reopen a saved revision and select it for a service pricing profile.
8. Show the pricing breakdown and create a normal draft estimate, preserving the exact measurement and profile versions used.
9. On phones/tablets, use large touch targets and allow list-based entry/editing as a fallback to vertex dragging.

Keep map provider and geometry logic behind the existing Aerial Quote boundary so imagery can change without replacing the property, revision, pricing, estimate, or quote systems.

## 11. Three ranked approaches

| Rank / option | Functionality | Complexity | Licensing / cost | Flexibility |
|---|---|---|---|---|
| **1. Option A — Improve the existing system** | Reuse current properties, revisions, profiles, engine, and estimates. Simplify first-use flow, revision summary, and reuse. Does not itself add aerial drawing if no licensed image surface is available. | Lowest. Existing data/API path is already cohesive. | No new provider fee for the current numeric workflow. Any map/geocoder still has usage/license conditions. | Preserves the strongest existing architecture. |
| **2. Option B — Add free/open-source measurement capability** | Reuse Leaflet plus Turf.js for drawing and local area/perimeter math on a permitted map surface. Could add multiple named regions and save revisions. | Moderate: drawing UX, geometry validation, coordinate schema/versioning, attribution, mobile behavior, and end-to-end tests. | Leaflet/Turf software has no per-use API fee. Tiles, aerial imagery, geocoding, hosting, and usage remain separately licensed/costed. Public OSM tiles/Nominatim have strict operational limits and no production SLA. | High if map and geometry are kept provider-neutral and the current revision/estimate source of truth remains. |
| **3. Option C — External measurement provider** | May supply licensed imagery, automated measurements, or hosted drawing tools depending on provider. | Highest: vendor authentication, account/plan mapping, retries, privacy, provider identity, retention, contract constraints, and support obligations. | Potential per-measurement/order or subscription cost; no exact provider cost is asserted here. | Risk of provider lock-in unless BuildPro stores provider-neutral measurement outputs and handles revisions itself. |

### Recommendation

Proceed in the order **A, then B, then C**. First retain the existing manual measurement/estimate path and improve its summary/reuse. For map measurement, prototype only after identifying a surface that permits the intended drawing and saved outputs. The existing Leaflet/Turf dependencies make a provider-neutral geometry workflow plausible without paying for an area-calculation API, but they cannot supply licensed aerial imagery. Consider an external provider only if permitted imagery, coverage, accuracy, or measurement quality cannot be met otherwise.

## 12. Recommended next development phase

No implementation is authorized by this audit. A future approval-gated phase should first resolve the map-surface choice and its permissions. Then scope a small vertical slice:

- Search/select an address and locate it on the chosen permitted surface.
- Draw one labeled region; calculate area and perimeter from its coordinates.
- Save and reopen it as a new property measurement revision.
- Use that revision in the existing pricing engine and create a standard draft estimate.
- Verify mobile touch interactions, business/permission scoping, immutable revision behavior, no duplicate data, and estimate snapshot traceability.

If the selected source cannot grant the rights needed for saved polygons/measurements, stop and choose another source before building. Do not use Google satellite imagery as a tracing surface absent explicit written permission.

## 13. Risks and dependencies

- **Licensing:** Map display, tracing, saving derived measurements, and republishing imagery are different permissions. Written rights are needed for the exact workflow.
- **Key security:** Google key restrictions and Mapbox token URL restrictions are unverified. The current Google key is reused across different contexts.
- **Provider coverage:** Any imagery must cover the current territory and future U.S.-wide service needs at useful resolution and age.
- **Accuracy:** A mathematically exact polygon can still be based on an inaccurate boundary, stale image, or wrong parcel. Show source/date and let users adjust it.
- **Geometry/data design:** Current revisions accept numeric values only and constrain source values. A geometry extension needs explicit validation, coordinate order, unit/precision, polygon holes, and revision semantics.
- **Revision source values:** The database constraint currently permits only `manual` and `on_site`. A future map/provider capture method must be represented compatibly rather than silently mislabeled.
- **Provider uptime/cost:** Public tiles/geocoders can throttle/block; paid services have usage or transaction charges. RoutePlanner’s existing fallback is not a guarantee for Aerial Quote.
- **Duplicate entry:** Do not add a second property, measurement, estimate, or price ledger. Use existing records and calculation engine.
- **Business access:** Reuse existing property permissions and business-scoping; measurement writes require the measure permission.
- **Screenshot/testing:** This audit did not use an authenticated browser session or production records. Source-level findings must be followed by controlled tests and signed-in UI verification after an implementation is approved.

## 14. Testing requirements for a future approved implementation

- Geometry unit cases: square/rectangle, irregular polygon, repeated/closing vertex, self-intersection, zero-area, hole/exclusion, large and small coordinates, and unit conversions.
- Round-trip tests: create revision, list revisions, reopen exact geometry and metadata, create a later revision, verify earlier revision is unchanged.
- Aerial Quote API tests: valid/invalid geometry; ownership and same-business permission boundaries; `view` versus `measure` versus `estimate`; no cross-business leakage.
- Pricing contract tests: area/length/count categories map to existing service profile inputs; server calculation remains canonical; units, rounding, minimums, and calculation snapshots remain explainable.
- Estimate tests: estimate stores the exact measurement revision ID/profile version and generated line items; existing Quote Center flow and later estimate-to-invoice behavior remain unchanged.
- Browser tests: address selection, map load/failure, draw/edit/delete, measurement summary, save/reopen, estimate create, responsive touch interactions, and accessible keyboard/list alternatives.
- Provider/legal checks: test environment only; no paid calls until user approves and billing/terms are confirmed. Verify attribution, domain/API key restrictions, data retention, provider/survey source, and disabled states.
- No new real property or financial rows in verification without explicit authorization; use isolated test fixtures and clean them up.

## 15. Sources

### Application source reviewed

- `artifacts/contractor-app/src/pages/AerialQuote.tsx`
- `artifacts/contractor-app/src/pages/AerialQuoteManual.tsx`
- `artifacts/contractor-app/src/components/ClientPropertiesQuotes.tsx`
- `artifacts/contractor-app/src/pages/Jobs.tsx`
- `artifacts/contractor-app/src/pages/RoutePlanner.tsx`
- `artifacts/contractor-app/src/lib/googleDrivePicker.ts`
- `artifacts/api-server/src/routes/aerial-quote.ts`
- `artifacts/api-server/src/routes/geocode.ts`
- `artifacts/api-server/src/geocode-helpers.ts`
- `artifacts/api-server/src/lib/aerial-quote-engine.ts`
- `artifacts/api-server/src/lib/routing-engine.ts`
- `artifacts/api-server/src/lib/integrationCatalog.ts`
- `lib/db/src/schema/properties.ts`
- `lib/db/src/schema/property-measurement-revisions.ts`
- `lib/db/src/schema/property-business-access.ts`
- `lib/db/src/schema/service-pricing-profile-versions.ts`
- `lib/db/src/schema/estimates.ts`
- `lib/db/src/schema/estimate-quote-events.ts`
- `artifacts/contractor-app/package.json`
- `lib/api-spec/openapi.yaml`

### Official provider policies / pricing

- [Google Maps JavaScript API policies](https://developers.google.com/maps/documentation/javascript/policies)
- [Google Maps API key security best practices](https://developers.google.com/maps/api-security-best-practices)
- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [OpenStreetMap Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright)
- [Mapbox pricing](https://www.mapbox.com/pricing)
- [Mapbox token restrictions](https://docs.mapbox.com/accounts/guides/tokens/)
- [Mapbox Geocoding API storage modes](https://docs.mapbox.com/api/search/geocoding/)
- [Leaflet documentation](https://leafletjs.com/reference.html)
- [Turf.js documentation](https://turfjs.org/docs/)
