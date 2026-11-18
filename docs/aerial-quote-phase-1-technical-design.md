# BuildPro — Aerial Quote Phase 1 Technical Design

**Status:** Proposed design; not implemented
**Prepared:** 2026-11-18
**Related audit:** [`aerial-quote-existing-capability-audit-2026-11-18.md`](./aerial-quote-existing-capability-audit-2026-11-18.md)

## 1. Executive summary

**Recommendation:** Keep the existing Aerial Quote property, measurement-revision, pricing-profile, and estimate systems. Add a provider-neutral Leaflet measurement workspace that draws human-edited GeoJSON geometry and uses Turf.js for area and length calculations. Do not use Google satellite imagery as a tracing surface. Evaluate the USGS National Map `USGSImageryOnly` service as the first no-subscription aerial layer, subject to source-by-source licensing, coverage, freshness, and service-availability checks before implementation.

The USGS option is promising, not a blanket approval. USGS says National Map data are free and public domain with requested attribution, and publishes an imagery-only tile service. Its current service metadata reports different image sources and ages by region, including lower-resolution, licensed Alaska imagery that is not available for download. Confirm that drawing and saving derived measurements is permitted for each source served in the intended territory. Where permission, resolution, or freshness is not adequate, keep the existing manual/on-site workflow available and do not enable map-derived saving.

Use existing `properties` as the address/customer container and append-only `property_measurement_revisions` as the revision history. Store polygon vertices, computed quantities, and provenance in the revision’s existing JSONB entries. Do not add a new property or measurement ledger. Extend API validation and the server-side calculation path so the browser cannot submit an arbitrary quantity that becomes a financial estimate. An existing estimate already records the property, selected measurement revision ID, pricing-profile version, line items, and calculation snapshot; preserve that flow and never silently update an existing quote.

**No new subscription is required for the Leaflet/Turf software.** That does not make map imagery, geocoding, tile hosting, or public services unlimited or automatically authorized. Existing saved coordinates have no provider provenance, so their retention and reuse cannot be cleared in bulk from the current records. Do not treat them as an approved Aerial Quote location source until reviewed or re-geocoded under documented terms.

This document is a proposal only. It does not authorize implementation, provider integration, key changes, paid usage, or production data edits.

## 2. Existing architecture findings

### Verified in the repository

| Area | Current capability | Design consequence |
|---|---|---|
| Properties | `properties` stores business, optional client, label, address, and notes. It has no coordinates or boundary fields. | Reuse the property as the location/customer record. Keep map focus coordinates transient unless a separately approved source permits persistence. |
| Measurement history | `property_measurement_revisions` stores a property ID, revision number, source (`manual` or `on_site`), JSONB `entries`, notes, author, and timestamp. Revisions are append-only in the active flow. | Reuse this ledger. JSONB can carry geometry without a new table, but the API currently validates numeric-only entries and must be extended. |
| Pricing | `service_pricing_profile_versions` stores versioned business/service rules. `calculateServiceEstimate` matches entries by category, kind, and compatible unit. | Preserve existing categories, quantities, conversions, rounding, margin, minimum charge, and pricing profile versions. |
| Estimates | Aerial Quote creates a standard draft estimate. Its calculation snapshot records the selected measurement revision ID and profile version; the revision ID is not a database foreign key. | Keep estimate creation in the existing route. Include calculated measurement values in its snapshot and do not mutate saved or accepted quotes when a new property revision is saved. |
| Quote events | `estimate_quote_events` holds quote revision, delivery, customer decision, and authorization history. | Keep quote events separate from property measurement revisions. |
| Access | Aerial Quote routes are owner-only for writes; property sharing supports view, measure, estimate, and manage permissions between divisions of the same legal business. | Preserve existing checks. Require the relevant property permission for each operation; do not infer permission from “All Businesses” context. |
| Map display | Leaflet and React-Leaflet are used in Route Planner for stop markers and route lines. It conditionally uses Mapbox Streets raster tiles or OpenStreetMap street tiles. | Reuse Leaflet rather than introduce a second renderer. Neither existing layer is aerial imagery. |
| Geometry math | `@turf/turf` is installed in the contractor-app package but has no current application imports. | Use it for geometry, but establish a server-authoritative calculation path before quantities can feed estimates. |
| Drawing controls | No Leaflet drawing/editing plugin is installed. | Phase 1 needs a small custom interaction or a separately reviewed open-source plugin; the map library alone does not supply the requested editing experience. |
| Address search | `/api/geocode` tries Census, Nominatim, and Mapbox; `geocodeAddressString` tries Census, Nominatim structured/freeform, and Google. The sequences differ and do not return durable provider provenance. | Do not use the general endpoint unchanged for persistent property coordinates. If used for transient centering, preserve provider attribution and do not persist results without rights. |

### Current Aerial Quote APIs to reuse

Mounted under `/api/aerial-quote`:

- `GET /properties` and `POST /properties`
- `GET /properties/:propertyId/measurement-revisions`
- `POST /properties/:propertyId/measurement-revisions`
- `GET /pricing-profiles` and `POST /pricing-profiles`
- `POST /calculate`
- `POST /estimates`
- Property access grant/list/revoke routes

These routes already give the feature the correct property, revision, pricing, estimate, and access boundaries. The map should not create duplicate versions of these resources. The generic `GET /api/geocode` is an existing service, not a suitable persistence contract as-is.

### Proposed decisions and unresolved items

- **Proposed:** Keep `properties` as the sole property record and measurement revisions as the sole saved measurement history.
- **Proposed:** Keep geometry in the existing JSONB entries and retain the existing numeric `quantity`/`unit` fields for estimate pricing.
- **Proposed:** Add a `role` to distinguish the non-billable property outline from billable service regions. Older entries without a role remain service regions for compatibility.
- **Proposed:** Record drawing method and imagery provenance per geometric entry. Use `source: "manual"` only if the product owner confirms that human-drawn map geometry is a manual measurement; otherwise add a separate source value with a narrowly scoped constraint migration.
- **Unresolved:** Which USGS mosaic source is returned at each location and zoom, whether all those sources allow the exact commercial tracing/storage workflow, and whether its coverage/freshness is adequate for all desired U.S. service areas.
- **Unresolved:** Which provider produced any previously saved prospect or route-stop coordinate. Existing records do not identify the provider.

## 3. Recommended technical architecture

### Data flow

1. The owner selects an existing property or enters a new address in the current property form.
2. A location adapter obtains a map center for the current editing session. It returns provider/source and attribution information with the coordinates. The center is transient; it is not copied into `properties` by default.
3. Leaflet loads the selected, approved map tile layer. A source/status strip displays the imagery provider, known collection date/age when available, and attribution.
4. The user draws a property outline and one or more service regions. Each region is a separate editable GeoJSON geometry with a purpose/category.
5. Turf.js provides immediate client-side feedback. On save, the API validates coordinates and recomputes all stored quantities using the approved, pinned server-side geometry implementation.
6. The API appends a new property measurement revision using the existing endpoint. The previous revision is never edited or deleted.
7. Aerial Quote selects that revision and an existing pricing-profile version. The existing server-side `/calculate` and `/estimates` routes produce a normal draft estimate.
8. The estimate snapshot records the property, revision ID, profile version, geometry algorithm/version, and exact pricing inputs/results needed to explain the generated line items. Later revisions do not rewrite the estimate or quote history.

### Component boundaries

- **Aerial Quote workspace:** property selection/address form, saved-revision selector, map, drawing state, measurement list, save and estimate actions.
- **Map layer adapter:** Leaflet tile URL, attribution, source metadata, zoom/coverage limits, and loading/error state. Keep it replaceable and separate from geometry state.
- **Drawing interaction:** starts/finishes a polygon, adds/moves/removes vertices, handles undo/redo, and serializes GeoJSON. It does not decide pricing.
- **Geometry engine:** validates WGS84 geometry, computes area/length/perimeter, and converts to the existing supported units. Client preview is advisory; server output is canonical.
- **Revision API:** authorizes the property action, validates the revision, computes canonical metrics, and appends a revision.
- **Existing estimate engine:** consumes the saved revision’s numeric entries and the selected pricing profile; no separate quote or finance logic.

### API plan

**Reuse and extend** the existing revision POST/GET APIs. Revision POST should accept geometry and provenance in the JSONB entry shape, reject malformed or unauthorized geometry, and write server-calculated values. Revision GET returns the same geometry and saved calculation metadata so the user can reopen and edit it.

**Reuse** `/api/aerial-quote/calculate` and `/api/aerial-quote/estimates`, but ensure only service-region entries are eligible for pricing. The property outline must not accidentally match a service pricing component.

**Location search:** first determine whether existing `/api/geocode` can return a provider, source attribution, and retention mode and whether its chosen provider may be shown on the selected map. If it cannot, add an Aerial Quote-specific, provider-aware adapter using only an approved source. Do not persist temporary Mapbox or restricted Google Geocoding output. A “place not located” fallback should let the user pan/zoom and place the center manually, not silently substitute ambiguous coordinates.

No new endpoint is needed for geometry calculation if the existing revision POST performs authoritative validation and calculation. A new endpoint should be added only if the current API contract cannot validate and calculate before it appends a revision.

## 4. Mapping and licensing approach

### Separate the products and rights

| Layer/action | Recommendation |
|---|---|
| Street-map viewing | Existing OSM/Mapbox Streets layer is suitable for orientation only under its terms and attribution. OSM street tiles are not aerial photographs. |
| Satellite/aerial viewing | Evaluate USGS National Map `USGSImageryOnly` first as a no-subscription candidate. Confirm actual source, service terms, coverage, date, and zoom-level resolution for the customer’s location. |
| Drawing geometry | Human-created vectors are stored separately from the image. Drawing is enabled only for an imagery source whose terms permit this use. Do not use Google satellite imagery for tracing absent written permission. |
| Calculation | Turf.js calculates geometry from GeoJSON coordinates; it does not make the imagery or geocoder license-free. |
| Saving geometry and measurements | Store only the user-created coordinates and derived metrics, not provider imagery or map tiles. Save source/provider/date/attribution provenance. Confirm the source allows saving and commercial reuse of derived quantities. |
| Commercial estimates | Existing BuildPro service prices and estimate flow consume the saved user measurement. Provider terms must allow the input/derived-measurement storage and this commercial use. |

### No-subscription imagery candidate

USGS states that National Map data are free and in the public domain, and requests agency acknowledgment. The `USGSImageryOnly` service is a cached orthoimagery basemap. Its service metadata reports a mosaic with different source data and resolution by region: typically NAIP in the conterminous U.S.; lower-resolution imagery in Alaska; and older acquisition years in Hawaii, Puerto Rico, and U.S. territories. The service metadata also notes that Alaska SPOT imagery is not available for direct download due to license restrictions.

**Recommendation:** Treat the USGS service as a promising candidate, not a blanket legal or accuracy approval. Before enabling drawing, confirm that the exact service and underlying imagery source returned for each supported location may be used to create and save commercial measurement geometry. Show acquisition/source dates where available. Require an explicit “imagery too old/unclear” or “use field measurement” fallback. Do not promise survey accuracy. Keep U.S.-wide address support; imagery quality and recency may vary by place.

Suggested attribution, subject to the service/source in use:

> Map services and data available from U.S. Geological Survey, National Geospatial Program. Imagery attribution: USDA, USGS The National Map: Orthoimagery.

The attribution should be rendered in or immediately adjacent to the map and match any additional source-specific requirements.

### Existing geocoding data and retained coordinates

The current application stores latitude/longitude in prospect and route-stop records, but neither record records the geocoding provider. Two fallback chains exist:

- Browser callers use `/api/geocode`: U.S. Census, then Nominatim, then Mapbox.
- `geocodeAddressString` uses Census, Nominatim structured/freeform, then Google Maps Geocoding. It is used by route-related and property-lookup flows.

This means **the legality of retaining or reusing previously stored coordinates cannot be established from the current database records**. A coordinate may have come from a public source, OSM/Nominatim, temporary Mapbox geocoding, or Google Geocoding, and its provenance was not saved.

- Mapbox documents temporary geocoding as the default and says those coordinates are not for future storage. Its permanent mode allows storage only under the applicable plan/terms. The current `/api/geocode` Mapbox request does not set a permanent mode.
- Google’s current Geocoding API policy generally restricts storing/caching Google Maps content except permitted IDs, and has rules about displaying Geocoding results on a map. The current source returns coordinates, not a durable Place ID.
- OSM/Nominatim has usage limits and attribution/license obligations; public Nominatim is not a production autocomplete service.
- Census results are U.S.-address data, but the source and terms should still be recorded if coordinates are retained.

**Decision:** Do not copy existing prospect/route-stop coordinates into `properties` or treat them as a cleared property measurement location source. For any future migration or reuse, first establish provenance per row or re-geocode under a documented, approved retention basis. In Phase 1, keep a geocoded map center transient and store only user-drawn geometry when the imagery/derived-data license is confirmed. The app’s saved property address itself may remain in the existing property record.

### Open-source libraries and existing dependencies

- **Leaflet / React-Leaflet:** reuse as the map UI, tile layer, feature rendering, and pan/zoom system. Leaflet does not grant tile or imagery rights.
- **Turf.js:** use for local area, perimeter, line length, and geometry checks. It does not provide imagery, geocoding, or parcel boundaries.
- **OSM data:** open data under ODbL with attribution. This is distinct from the OSM Foundation’s capacity-limited public tile and Nominatim services. Do not bulk-download/use public tiles offline or rely on public servers for a commercial SLA.
- **Google Maps:** no Google map renderer currently exists. Google Geocoding is a last resort in another path. Do not use Google satellite for digitizing saved boundaries under standard published terms.
- **Mapbox:** currently supplies Streets tiles and fallback geocoding, not Aerial Quote satellite imagery. Temporary geocoding results cannot be stored for future use.
- **`d3-geo`, `topojson-client`, `us-atlas`:** present in the frontend dependency set or static website map data, but not an existing parcel/location editor. They are not needed for Phase 1 property geometry.
- **OSRM:** route geometry/distance is separate and is not a property area-measurement source.

## 5. Measurement workspace design

### Screen workflow

1. **Choose property:** search the existing property list or create one with the current name/address/client fields. Keep the existing business selector and explicit business scope.
2. **Locate:** center the map from an approved geocode result for this session. Show the source and map attribution. If lookup fails, offer manual pan/zoom and center placement.
3. **Outline property:** select “Property boundary,” click/tap vertices, finish the polygon, and review calculated total area/perimeter. This boundary is context only and is not billed.
4. **Add service regions:** select a purpose (lawn, bed, driveway, parking lot, sidewalk, building, asphalt, custom), draw one polygon per region, and edit its label/category. Multiple regions may share the same category; the existing price engine sums matching entries.
5. **Review:** show a color-coded list with label, area, perimeter, units, and edit/remove actions. Selecting a row focuses/highlights its shape.
6. **Save revision:** show the selected property, map-source/date, region count, and a revision note. Saving appends a revision; it never overwrites the currently selected saved revision.
7. **Estimate:** select a pricing-profile version, calculate, inspect the regular pricing trace/line items, and create a standard draft estimate.
8. **Reopen/edit:** choosing a historical revision loads its saved shapes. Editing creates a draft; the save action creates a new revision while preserving history.

### Text wireframe

```text
Property: [Search or choose saved property v]   Address: [____________________]
Revision: [Current / choose saved revision v]   [Locate]

┌──────────────────────────────────────────┬───────────────────────────────┐
│ Map source + imagery date + attribution   │ PROPERTY BOUNDARY             │
│                                          │ Total area   12,480 sq ft      │
│ [Pan] [Boundary] [Add area] [Undo]       │ Perimeter      512 ft          │
│ [Redo] [Delete shape] [Clear draft]      ├───────────────────────────────┤
│                                          │ SERVICE REGIONS                │
│   Draw/edit map geometry here            │ Lawn A       7,200 sq ft [Edit]│
│                                          │ Bed 1          430 sq ft [Edit]│
│                                          │ Driveway       680 sq ft [Edit]│
│                                          │ [+ Add region]                 │
└──────────────────────────────────────────┴───────────────────────────────┘

Measurement notes: [_______________________________________________________]
[Save new revision]                    [Choose pricing profile] [Estimate]
```

### Drawing and editing

- Use a simple mode selector: **Pan**, **Property boundary**, **Add region**, **Edit**. Keep the active mode visible.
- Draw polygon vertices by click/tap; show a live preview line and clear finish/cancel actions.
- Edit vertices using draggable handles and explicit add/remove vertex controls. Include undo/redo for the current unsaved edit session; keep saved revisions immutable.
- Phase 1 should use one simple polygon per region. Multiple polygons are represented as multiple entries, including multiple regions with the same label/category. Defer polygon holes unless a real service workflow requires them; users can draw separate billable shapes rather than hidden exclusions.
- Do not show “survey-grade” precision. Provide source/date and an accuracy caveat; allow manual/on-site numeric measurement when imagery is too old, unclear, or too coarse.
- The boundary has an explicit `role: "property_boundary"` and is excluded from pricing. Measurement regions use `role: "service_region"`.

### Desktop, tablet, and mobile

- **Desktop:** map and region list side by side; drawing toolbar remains visible above the map; details edit in the region list rather than a nested GIS inspector.
- **Tablet:** map above a collapsible region list; large controls; fit-to-boundary action; avoid controls over key image details.
- **Mobile:** full-width map with a bottom action bar and a compact, collapsible region summary. Use large touch targets and avoid requiring precision vertex dragging; list controls provide numeric edit/delete alternatives. Keep manual/on-site entry accessible if the map is unavailable.
- **Accessibility:** use labeled buttons and status text, keyboard-operable mode/undo/redo controls, visible focus, and a list-based summary so geometry is not communicated by color alone. Vertex editing should have a non-drag alternative.
- **Failure states:** distinguish address lookup failure, imagery unavailable, imagery not permitted at this location, invalid polygon, save failure, and pricing failure. Preserve the unsaved local draft after transient network/API failures.

## 6. Geometry calculation approach

### Representation and coordinate system

- Store geometry as GeoJSON `Polygon` coordinates in WGS84 longitude/latitude order: `[longitude, latitude]`. Leaflet positions are commonly expressed as `[latitude, longitude]`; convert explicitly at the boundary so the axis order is never inferred.
- Use one polygon per measurement entry in Phase 1. A separate property-boundary entry and service-region entries share the revision. If a site has disconnected regions, save multiple entries with the same category/label suffix rather than requiring MultiPolygon editing.
- The base map may render in Web Mercator, but calculate from geographic coordinates, not screen pixels or Web Mercator map units.
- Close the ring on serialization, require at least three distinct non-closing vertices, finite coordinates within valid longitude/latitude ranges, and reject zero-area or self-intersecting rings. Prevent accidental incomplete polygons from being saved.
- Validate holes/inner rings as unsupported in the first UI; do not silently ignore them if submitted through the API.

### Turf.js calculations

- `turf.area` provides polygon area in square meters. Convert from square meters to the app’s existing `sq_ft`, `acre`, and `sq_yd` units.
- `turf.length` over the closed outer ring provides perimeter in kilometers by default; convert to feet/yards/miles as needed. For linear measurement entries, calculate from a LineString and use the existing `length` kind.
- Use the same pinned Turf version for live browser previews and authoritative server calculation. If the API server does not already depend on it, add it as an ordinary open-source package dependency only when implementation is approved; no paid service is needed.
- The browser may calculate a responsive preview, but the server must validate the geometry and compute the quantities used in estimate pricing. Never trust client-submitted `quantity` as the authoritative area.
- Preserve full vertices and derived canonical values in each immutable measurement entry. Record algorithm/schema version so later engine changes can be distinguished from the values saved at measurement time.
- Measurement accuracy is limited by image resolution, image age, georeferencing, boundary choice, and vertex placement. Polygon math precision is not parcel/survey accuracy.

## 7. Data model and revision strategy

### Reuse existing records

- `properties`: continue to hold business, optional client, label, and postal address. No coordinate or polygon columns are needed for the first slice.
- `property_measurement_revisions`: continue to own revision number, property reference, source, author, notes, and creation date. Its JSONB `entries` stores both geometry and numerical pricing entries.
- `service_pricing_profile_versions`: unchanged. Existing `category`, `kind`, and `unit` matching remains the interface to pricing.
- `estimates`: unchanged core relationship. Existing `propertyId`, client/business, line items, and calculation snapshot remain the estimate record.
- `estimate_quote_events`: unchanged. Quote revisions/approvals remain separate from property measurement revisions.

### Proposed backward-compatible JSONB entry

Illustrative shape only:

```json
{
  "role": "service_region",
  "label": "Front lawn",
  "category": "mowable_area",
  "kind": "area",
  "quantity": 7200,
  "unit": "sq_ft",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[ -87.63, 41.88 ], [ -87.62, 41.88 ], [ -87.62, 41.87 ], [ -87.63, 41.88 ]]]
  },
  "calculation": {
    "areaSquareMeters": 668.9,
    "perimeterMeters": 109.4,
    "algorithm": "turf-area-length",
    "version": 1
  },
  "provenance": {
    "method": "human_map_trace",
    "imageryProvider": "USGS The National Map",
    "layer": "USGSImageryOnly",
    "imageryDate": "unknown",
    "measuredAt": "ISO-8601 timestamp",
    "attribution": "USGS / USDA"
  }
}
```

The property outline uses the same structure with `role: "property_boundary"` and its own label/category. Old rows have no geometry or role; the API should normalize missing role to `service_region` and continue accepting current manual/on-site entries.

### Migration decision

The database column is already JSONB, so adding optional geometry, calculation, role, and provenance fields does not by itself require a table migration. The existing API Zod schemas and TypeScript types still need to be extended and tested.

The database currently restricts revision `source` to `manual` and `on_site`. If a human-drawn polygon is considered a manual measurement, keep `source: "manual"` and record the exact map method/provider/date in the entry’s `provenance`. If the product defines map measurement as a distinct revision source, add a new allowed value and narrowly update the database constraint only after that requirement is confirmed. Do not relabel map measurements as `on_site`.

No standalone geometry table, new property table, or second measurement ledger is justified for the first phase. If future geometry volume/query needs require normalization, revisit it with measured evidence rather than preemptively migrating.

### Revision behavior

- Every save creates a new revision through the existing revision API.
- Selecting an old revision loads it read-only until the user chooses “Edit as new”; that action creates local draft state.
- New revision numbers are assigned by the existing server logic. The server rechecks the property permission and business relationship on every save.
- Keep the old numeric values and geometry intact. Do not rewrite or cascade updates into estimates, quotes, invoices, or job records.
- An estimate snapshot captures the selected revision ID and server-calculated quantities. Quote delivery and acceptance continue to use existing quote snapshots/events.

## 8. Estimate integration

1. Map-drawn service-region entries produce existing numeric fields (`category`, `kind`, `quantity`, `unit`) after server validation.
2. The property outline is excluded by `role`; only service-region entries are passed to pricing. This prevents a whole-lot boundary from being billed as lawn, asphalt, or parking by accident.
3. Existing profile components select by category/kind/unit; the engine aggregates matching regions and uses the existing unit conversion, rounding, margin, and minimum-charge logic.
4. The existing `/calculate` response displays line items and trace. No new pricing formula or rate table is introduced.
5. `/estimates` creates the standard draft estimate. Extend its `calculationSnapshot` with the revision ID, profile version, calculated region/category totals, and geometry calculation version if needed for traceability.
6. A new property revision is available for a future estimate. It does not silently modify an existing draft, sent quote, accepted quote, invoice, or estimate event.

Examples:

- `mowable_area` → lawn-maintenance profile component, in `sq_ft` or `acre`.
- `asphalt_area` → asphalt-sealing component, in `sq_ft` or `sq_yd`.
- `landscape_bed_area` → landscaping component.
- `driveway_edge` → linear pricing component, in feet or yards.

Profile categories remain business-configurable; the examples are not hard-coded service prices.

## 9. Business isolation and permissions

- Select one explicit active business before property search, save, calculation, or estimate creation. Do not treat the combined “All Businesses” view as write scope.
- Use the existing property access helpers and same-legal-business checks. `view` can read a saved revision, `measure` can create a new revision, `estimate` can calculate/create estimates, and `manage` can edit the property/share controls, subject to current route-level owner restrictions.
- A property’s business identity remains authoritative. Client IDs must continue to belong to the same legal business.
- Validate property ID, revision ID, business ID, selected pricing profile, and permission together on the server for calculate and estimate requests. Never accept a browser-provided revision from a different business.
- Do not change job ownership, accounting ledgers, expenses, invoices, or financial calculations.
- Audit geometry revisions with the same author/time fields as existing revisions; do not expose one division’s property geometry to another without a valid access grant.

## 10. Recommended implementation sequence

Each unit is a future work package for planning purposes only; these are **not created as project tasks** and none is authorized to start.

### Unit 1 — Property map and location foundation

- **Components:** Aerial Quote map shell, provider/layer adapter, attribution/source-age status, transient address-search and map-center state.
- **APIs/data:** Reuse properties and address fields. Reuse `/api/geocode` only if it can return provider/source and is permitted to display on the chosen map; otherwise add a provider-aware Aerial Quote lookup. Do not persist location-provider coordinates by default.
- **Dependencies:** Written confirmation for the selected imagery/service and provider-display rules; current Leaflet/React-Leaflet installation.
- **Acceptance:** Owner can select/create an existing property, locate or manually center it, see source/attribution and service failures, and continue manual entry if map imagery is unavailable. No location lookup result is persisted.
- **Tests:** map initialization, no-result/provider errors, invalid addresses, missing token not relevant to USGS public layer, accessible map controls, business-scoped property list.
- **Risks:** USGS mosaic source/age varies; geocoding retention/display rules remain unresolved.

### Unit 2 — Polygon drawing and editing

- **Components:** Drawing-mode controls, polygon layer, vertex handles, clear/cancel, undo/redo, unsaved-draft state.
- **APIs/data:** Local draft GeoJSON only; no API write in this unit.
- **Dependencies:** Unit 1 and approved map surface.
- **Acceptance:** User can draw, finish, move/add/remove vertices, undo/redo, discard, and reopen the draft without accidentally saving it.
- **Tests:** click/touch interactions, state transitions, ring closure, invalid point prevention, repeated undo/redo, keyboard/list alternatives.
- **Risks:** Touch targets, map pan versus vertex drag conflicts, invalid/self-intersecting shapes.

### Unit 3 — Local area and perimeter calculations

- **Components:** Shared geometry utility and live measurement summary.
- **APIs/data:** Preview from browser Turf; future revision API recomputes authoritatively on server. Use the same pinned algorithm version on both sides.
- **Dependencies:** Unit 2; no imagery calls for calculation.
- **Acceptance:** Valid geometry displays area/perimeter in supported units, invalid geometry is blocked, server and preview agree within defined test tolerance, and no screen-pixel/Web Mercator arithmetic is used.
- **Tests:** rectangles, irregular shapes, long/short edges, closed rings, self-intersections, zero-area, valid-coordinate ranges, conversion rounding, reference values independently calculated.
- **Risks:** Incorrect coordinate order, geodesic/spherical approximation, extremely large polygons, and false precision.

### Unit 4 — Multiple labeled measurement regions

- **Components:** Region category/label editor, color-safe shape list, property-boundary role, add/select/delete region controls.
- **APIs/data:** Each region is an entry in a property-revision draft. Same-category regions remain separate records and sum in the pricing engine. Property boundary is explicitly non-billable.
- **Dependencies:** Units 2–3.
- **Acceptance:** User can create several regions, reuse a category, rename/delete one, and see per-region and aggregate totals. The property outline never appears in a service estimate.
- **Tests:** repeated categories, custom labels, boundary/region separation, empty list, region deletion, multiple customer service profiles.
- **Risks:** Category mismatch with pricing profiles; overlapping regions can be double-counted unless clearly disclosed or detected.

### Unit 5 — Saving and revising measurements

- **Components:** Save-review panel, revision selector, read-only historical view, “edit as new” draft.
- **APIs/data:** Extend existing `POST/GET /api/aerial-quote/properties/:propertyId/measurement-revisions`; persist geometry, role, canonical calculations, and provenance in JSONB. Keep property/revision tables.
- **Dependencies:** Units 1–4; agreed source semantics for `manual` versus map capture.
- **Acceptance:** Save appends exactly one new revision; reload returns equivalent vertices and metrics; old revisions remain unchanged; unauthorized business/property requests are rejected.
- **Tests:** JSONB round-trip, Zod validation, server recalculation, source field constraint, idempotency/retry behavior, permissions, append-only history.
- **Risks:** JSONB schema drift; stale or absent image-date metadata; current source constraint if the business wants a distinct map source.

### Unit 6 — Existing estimate integration

- **Components:** Existing pricing profile selector, calculation trace, estimate creation action; no new quote page.
- **APIs/data:** Extend existing `/calculate` and `/estimates` contracts only as required; snapshots record measurement revision/profile/calculation versions.
- **Dependencies:** Unit 5 and existing pricing-profile mappings.
- **Acceptance:** Correct service regions feed configured components; draft estimate uses the exact selected revision; old estimates and quote events do not change after new measurements are saved.
- **Tests:** area/length unit conversion, category match, boundary exclusion, margin/minimum/rounding parity, revision/profile snapshot, estimate business/client ownership.
- **Risks:** Accidental billing of boundary geometry, stale profile versions, or quote snapshots that omit the selected measurements.

### Unit 7 — Mobile and usability improvements

- **Components:** Responsive workspace layout, touch-specific controls, accessible region list, save/failure states.
- **APIs/data:** No new API or table; same revision/estimate flow.
- **Dependencies:** Units 1–6.
- **Acceptance:** The complete flow works on desktop, tablet, and mobile without hidden controls; a user can finish with keyboard/list controls and can fall back to manual/on-site measurements.
- **Tests:** small viewport, touch targets, keyboard navigation, screen-reader labels, reduced motion, network interruption, map unavailable, and draft recovery.
- **Risks:** Large maps competing with small screens, accidental saves, inaccessible vertex-only controls, and provider performance on mobile.

## 11. Acceptance criteria

The first approved release should meet all of the following:

1. An owner can select or create an existing property and center a map without creating a duplicate property or persisting unapproved geocoder results.
2. The map displays a permitted, attributed source and communicates unavailable, stale, or low-resolution imagery.
3. The user can draw and edit one property boundary and multiple service regions.
4. The boundary is explicitly non-billable; only service regions enter pricing.
5. Valid regions show area/perimeter in supported units; server-side calculations are canonical and do not rely on display pixels.
6. Saving appends a new immutable revision to the selected property; old revisions can be reopened.
7. Geometry and source/date/method metadata round-trip from the existing revision record.
8. The existing pricing profile and estimate engine generate a normal draft estimate from the selected revision.
9. A later property revision does not silently alter existing estimate, quote, invoice, or approval data.
10. Business ownership and `view`/`measure`/`estimate`/`manage` permissions are enforced server-side.
11. Manual/on-site measurement remains available when map use is disallowed or unavailable.
12. No Google satellite tracing, provider terms bypass, paid provider usage, or production data writes occur without separate user approval.

## 12. Testing strategy

### Unit and calculation tests

- GeoJSON `[longitude, latitude]` conversion at the Leaflet boundary.
- Polygon closure, distinct vertices, finite/range validation, zero-area, self-intersection, and unsupported-hole rejection.
- Area/perimeter reference geometries and unit conversion to square feet, acres, square yards, feet, yards, and miles.
- Multiple service-region aggregation and property-boundary exclusion.
- Calculation parity between client preview and server canonical result.
- Rounding tolerance explicitly defined; never assert survey-level accuracy.

### API and data tests

- Revision JSONB round-trip with geometry and provenance.
- Old numeric-only revisions still load, calculate, and create estimates.
- Appending a revision leaves prior rows unchanged.
- Recompute quantities server-side; reject forged quantity/geometry mismatch.
- Same-legal-business property access and permission matrix for view/measure/estimate/manage.
- Business ID, property ID, revision ID, client ID, pricing profile, and estimate ownership all cross-validated.
- Estimate snapshots retain exact measurement revision and profile version.

### Browser and device tests

- Property search/add, locate/manual center, map loading/error/coverage status, draw/edit/undo/redo/delete, revision save/reopen, calculation, and estimate creation.
- Test desktop pointer, tablet touch, and narrow mobile viewport.
- Keyboard and non-drag alternatives; clear focus, contrast, and non-color-only labels.
- Save failure preserves the draft; retry does not accidentally create duplicate revisions.
- Existing Aerial Quote manual entry, Client Profile measurement reuse, Quote Center, and estimate lifecycle remain intact.

### Provider and legal checks before enabling a source

- Confirm the exact imagery service’s commercial display, drawing/digitizing, geometry storage, derived-measurement, attribution, and retention terms.
- Capture actual source/date/zoom metadata and test coverage for target regions, including Alaska, Hawaii, Puerto Rico, and territories if nationwide use is expected.
- Confirm geocoder output can be displayed with that map and whether the coordinates may be stored. Do not use the generic fallback endpoint for persistence while provider provenance is unknown.
- Check service quotas, rate limits, uptime expectations, allowed caching, referrer restrictions, and any per-request costs.
- Do not make paid API calls during testing without explicit approval.

## 13. Risks and unresolved licensing questions

1. **USGS mosaic source rights:** National Map data are described as public domain, but the imagery service combines sources. Confirm the drawing/derived-data workflow per served source; Alaska’s imagery is a notable exception to assume-safe offline reuse.
2. **Coverage/freshness:** The USGS service reports different imagery vintages and resolutions by region. A stale image can produce an inaccurate estimate even when polygon math is correct.
3. **Existing coordinate provenance:** Current prospect/route-stop coordinates have no provider/source field. Existing records cannot be certified for retention/reuse from the schema alone.
4. **Google:** Geocoding results have storage and display constraints; Google satellite tracing is prohibited under standard terms absent written agreement.
5. **Mapbox:** Temporary geocoding is the current default and cannot be stored for future use. The current integration may feed coordinates into persisted prospect/route-stop rows without storing provider/mode provenance.
6. **OpenStreetMap:** Data and public services have separate obligations. Public tile and Nominatim infrastructure has limits and no commercial SLA.
7. **Measurement accuracy:** Visual interpretation, source resolution, image date, obstructions, and user vertex placement dominate mathematical precision.
8. **Double counting:** Overlapping regions can cause repeated billed area. Warn on overlap where feasible and require deliberate confirmation; do not silently subtract.
9. **API trust boundary:** Client-derived area must not be the authoritative price input. The server recalculates and saves canonical numeric inputs.
10. **JSONB schema:** Flexibility avoids an immediate SQL migration but requires explicit versioned validation and backward-compatible readers.

Unresolved questions must be settled before enabling map-derived saves: which map layer is approved for the full service territory; its exact allowed uses; how source date/provider will be recorded; whether geocoder coordinates may be stored; and what accuracy/imagery age is acceptable to the business.

## 14. Cost assessment

- **Leaflet and Turf.js:** Open-source software; no per-map or per-calculation API meter. Turf is already installed in the web package. Server-authoritative calculation may require making the same package available to the API/shared geometry layer.
- **USGS imagery:** USGS describes National Map data as free/public domain with requested attribution. The public tile service is a no-subscription candidate, but service availability/traffic policy and every underlying imagery source must be confirmed; public services are not a contractual uptime guarantee.
- **OSM street tiles/Nominatim:** No software fee, but public-service limits make them unsuitable as unlimited production infrastructure. A managed tile/geocoder provider or self-hosted data creates ongoing costs.
- **Google/Mapbox:** Existing integrations are usage-metered or contract-bound. No new API calls or exact cost estimate were made. Do not enable them for Aerial Quote without an approved plan, key restrictions, and storage/display rights.
- **Hosting:** Storing GeoJSON vertices and small metric records should be low-volume compared with imagery. Do not store image tiles/screenshots. If imagery is later downloaded/self-hosted, storage, bandwidth, refresh, and operational costs must be estimated separately.
- **Expected Phase 1 cost posture:** No new subscription is a reasonable goal using an approved USGS layer plus Leaflet/Turf, but it is conditional on source terms and service suitability. If those conditions fail, leave map measurement disabled rather than silently moving to a paid or restricted source.

## 15. Source notes

### Project source reviewed

- Existing Aerial Quote audit: `docs/aerial-quote-existing-capability-audit-2026-11-18.md`
- `artifacts/contractor-app/src/pages/AerialQuoteManual.tsx`
- `artifacts/contractor-app/src/pages/RoutePlanner.tsx`
- `artifacts/api-server/src/routes/aerial-quote.ts`
- `artifacts/api-server/src/routes/geocode.ts`
- `artifacts/api-server/src/geocode-helpers.ts`
- `artifacts/api-server/src/lib/aerial-quote-engine.ts`
- `lib/db/src/schema/properties.ts`
- `lib/db/src/schema/property-measurement-revisions.ts`
- `lib/db/src/schema/service-pricing-profile-versions.ts`
- `lib/db/src/schema/estimates.ts`
- `lib/db/src/schema/estimate-quote-events.ts`
- `artifacts/contractor-app/package.json`

### Official policy and service references

- [Google Maps Platform Terms of Service — caching and derived-content restrictions](https://cloud.google.com/maps-platform/terms)
- [Google Geocoding API policies](https://developers.google.com/maps/documentation/geocoding/policies)
- [Mapbox temporary vs. permanent geocoding](https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/)
- [Mapbox Geocoding API](https://docs.mapbox.com/api/search/geocoding/)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [OpenStreetMap Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright)
- [USGS National Map service and data licensing](https://www.usgs.gov/faqs/what-are-terms-uselicensing-map-services-and-data-national-map)
- [USGSImageryOnly tile service metadata](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer?f=pjson)
- [USGS imagery service types and sources](https://www.usgs.gov/faqs/what-are-urls-imagery-services-national-map-and-are-they-cached-or-dynamic)
- [USGS National Agriculture Imagery Program overview](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip)
- [Leaflet reference](https://leafletjs.com/reference.html)
- [Turf.js documentation](https://turfjs.org/docs/)
