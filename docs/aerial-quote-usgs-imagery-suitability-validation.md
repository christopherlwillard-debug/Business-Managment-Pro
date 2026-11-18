# Aerial Quote — USGS Imagery Suitability Validation

**Research date:** 2026-11-18
**Decision status:** **Not approved as the sole Aerial Quote measurement source.** USGS National Map is a promising no-subscription imagery candidate, but the current evidence does not establish per-location source dates and rights for the complete commercial drawing/storage workflow, and the observed service detail is too coarse for narrow features.
**Scope note:** The attached validation prompt ended mid-bullet in its costs section. This report completes the visible coverage, rights, accuracy, and cost/technical-availability requirements only; it does not infer additional omitted requirements.
**No implementation:** No code, database, secret, key, provider setting, workflow, deployment, or production data was changed. No paid API was used. Public USGS REST map-service requests were made only to inspect representative imagery availability.

## 1. Executive conclusion

| Question | Result | Confidence / limitation |
|---|---|---|
| Are tiles available in Kentucky, Indiana, and Illinois? | **Yes at the tested points.** The public `USGSImageryOnly` map service returned image tiles for nine urban, suburban, and rural sample points—three per state—at cached zoom level 16. | This confirms sampled locations only, not every address or a complete statewide coverage audit. |
| Is the imagery legally usable for the full commercial workflow? | **Not fully cleared.** USGS states National Map services/data are free and public domain and requests attribution. The imagery mosaic has multiple sources; its metadata notes source-specific restrictions for Alaska imagery. The sources and acquisition dates for our KY/IN/IL sample tiles were not exposed in the tile response. | Obtain written confirmation for drawing and retaining commercial derived measurements from the exact imagery service and all source layers it serves. |
| Is the image detail adequate? | **Conditional for broad, rough measurements; not approved for every requested feature.** Metadata says most CONUS imagery is NAIP at 1-meter source GSD. The cached service’s effective tile scale at the sample latitude is about 1.9 meters (6.2 feet) per displayed pixel. Zoomed exports returned images but did not add source detail. | No sample-specific horizontal accuracy or acquisition-date metadata was returned. Fine boundaries and narrow features cannot be judged reliably from this evidence. |
| Can it avoid a new paid subscription? | **Likely for the USGS public service itself.** Tested tile requests required no API key or registration and returned HTTP 200. USGS describes National Map data as free/public domain. | No published request quota, SLA, or guarantee of unlimited production use was found in the service metadata/docs reviewed. Free access is not a production reliability guarantee. |

### Recommendation

Do **not** approve implementation of all seven roadmap units or commit to USGS as the only measurement source. Keep USGS as a candidate for a limited, approval-gated prototype after the rights question is answered. For a usable Aerial Quote release, require imagery at **0.3 meters per pixel (about 1 foot) or better for fine categories** such as beds and sidewalks. A layer at **0.6 meters per pixel (about 2 feet) or better** may be considered for large lawn/parking/asphalt quantities only after comparison against field measurements. These are proposed product acceptance thresholds, not an external accuracy standard. The observed service cache is coarser than those thresholds at its effective maximum tile level; source data metadata for most CONUS NAIP is 1 meter, also coarser than the preferred threshold.

If the rights, dates, coverage, or detail are not adequate, leave map-derived saving disabled and keep manual/on-site measurement available. Do not trace Google satellite imagery under standard Google terms.

## 2. Coverage and programmatic availability

### Representative public-service tests

The `USGSImageryOnly` ArcGIS REST tile endpoint was queried at zoom level 16 for the following approximate sample centers. All nine returned HTTP 200 with JPEG image tiles. Four tiles (Owensboro, Newburgh, Carmi, and rural Daviess County) were visually inspected.

| State | Representative point | Approx. coordinates (lat, lon) | Context | z16 tile |
|---|---|---:|---|---|
| Kentucky | Owensboro | 37.7719, -87.1112 | City | HTTP 200 |
| Kentucky | Daviess County sample | 37.8130, -86.9800 | Rural/agricultural | HTTP 200 |
| Kentucky | Bowling Green | 36.9685, -86.4808 | City | HTTP 200 |
| Indiana | Evansville | 37.9716, -87.5711 | City | HTTP 200 |
| Indiana | Newburgh | 37.9440, -87.4050 | Suburban/river edge | HTTP 200 |
| Indiana | Warrick County sample | 38.0300, -87.2500 | Rural | HTTP 200 |
| Illinois | Carmi | 38.0909, -88.1587 | Town | HTTP 200 |
| Illinois | Harrisburg | 37.7384, -88.5406 | Town | HTTP 200 |
| Illinois | White County sample | 38.1200, -88.0000 | Rural/agricultural | HTTP 200 |

The inspected tiles displayed aerial/orthoimagery in both developed and agricultural locations. This is stronger evidence than service metadata alone that the layer returns imagery at these sample points, but it does not prove every parcel has usable imagery or that the image is current.

### Effective zoom/detail observed

- The public service is the cached `USGSImageryOnly` MapServer. Its description says the basemap is visible to approximately **1:9,028** and that source imagery may range from 6 inches to 1 meter.
- At Owensboro, cached tile requests at levels 15 and 16 returned HTTP 200; levels 17, 18, and 19 returned HTTP 404. The REST metadata lists LOD definitions above 16, but a listed LOD does not mean a tile exists at each point/level. The practical cached tile limit needs to be checked per area.
- At latitude around 38°, level 16 corresponds to roughly **1.9 meters of ground per screen pixel** (about 6.2 feet), based on the service’s level-16 resolution metadata and latitude scale factor.
- Three 512×512 REST `export` requests at close extents around Owensboro, Evansville, and Carmi returned images. The close images looked enlarged/interpolated rather than revealing new surface detail. Export success is not proof of finer source imagery.
- The public REST endpoint is programmatically accessible and also advertises WMS/WMTS capabilities. It returned tiles without an API key, login, or registration in this limited test.

### Date and coverage limitations

The service description says:

- Its majority CONUS source is NAIP at **1-meter source GSD**, with the service metadata describing NAIP data from **2017–2021**.
- Other sources are used at smaller scales and where NAIP is unavailable.
- The cited metadata lists different and older imagery years for Hawaii, Alaska, Puerto Rico, and U.S. territories; it specifically identifies 10-meter Alaska SPOT imagery and says it is not available for direct download due to license restrictions.
- The service’s copyright text reports a data refresh in June 2024. That is a service refresh date, not necessarily the acquisition date of imagery at a specific parcel.

The tile response did not provide a per-tile acquisition date, source sensor, or horizontal accuracy value. Therefore the report cannot establish whether a particular Owensboro, Evansville, or Carmi image is from the newest available flight. A production design would need an authoritative per-location source/date lookup or a visible “date unknown” state and a freshness fallback.

**Coverage finding:** Nine successful points across the three states establish broad sampled availability, not continuous coverage. Before release, sample a grid across the actual service territory, include address-level spots from urban/suburban/rural areas, test tile availability at intended zoom levels, and inspect image dates and quality. Do not imply coverage for an address from state-level availability alone.

## 3. Commercial rights and data handling

### What the public USGS statements establish

USGS’s National Map licensing FAQ says map services and data from The National Map are free and in the public domain, with no restrictions, and requests the following acknowledgement when citing, copying, or reprinting derived products:

> Map services and data available from U.S. Geological Survey, National Geospatial Program.

The `USGSImageryOnly` REST service identifies its imagery attribution as:

> USDA, USGS The National Map: Orthoimagery.

These statements are strong evidence that the ordinary National Map public-domain imagery may be used commercially with appropriate source acknowledgement. They distinguish this candidate from Google Maps content, whose standard terms restrict creating content by tracing/digitizing satellite features.

### Rights matrix for BuildPro use

| Proposed use | Evidence-based assessment | Gate |
|---|---|---|
| Display the public USGS imagery service in authenticated BuildPro screens | **Generally supported** by USGS’s public-domain/no-restrictions statement for National Map services and the service’s public REST access. | Confirm the complete `USGSImageryOnly` service’s underlying source mix and display attribution for the production configuration. |
| Draw a property boundary over the imagery | **Likely permitted for public-domain source imagery**, but the FAQ does not give a specific example for customer-created property polygons or address every source in the composite service. | Ask USGS to confirm the use for the exact service and confirm any source-specific exception. |
| Calculate area, perimeter, and distance from user-drawn vectors | **Likely a user-created derived product** when based only on public-domain imagery, but the exact commercial derivative workflow is not explicitly answered by the general FAQ. | Written confirmation for this use is recommended before treating it as approved. |
| Save polygons and measurements in BuildPro’s database | **Not specifically addressed as a BuildPro SaaS customer-data workflow** by the FAQ. Public-domain data status supports reuse, but the mosaic/source exception remains. | Obtain confirmation that geometry and derived measurements can be retained indefinitely, independently of USGS tile availability. |
| Associate results with customer properties/estimates and reuse for later estimates | **No restriction identified for public-domain derived data**, but this exact association/reuse case is not enumerated in the FAQ. | Include it in the written confirmation request. |
| Show measurements and overlays in a customer quote PDF | **Likely permissible for measurement outputs**, provided the PDF does not reproduce or embed restricted source imagery. | Confirm derived-output reuse; omit imagery tiles/screenshots from quote documents. |
| Retain BuildPro geometry if the imagery service changes or is unavailable | **Likely permissible for BuildPro-authored vectors derived from public-domain imagery**, but not conclusively established for every mixed-source tile. | Confirm per-source rights; retain source/date/provenance with geometry. |
| Cache, download, or redistribute imagery tiles | **Not needed for the proposed design and not approved by this review.** USGS public-domain data statements are broad, but the imagery service metadata notes source-specific download restrictions. | Do not cache/download/redistribute tiles until the exact service/source terms are confirmed. Keep only user geometry and metrics. |

### Required written question

The exact unresolved question for the U.S. Geological Survey is:

> May a commercial customer-facing application use the public `USGSImageryOnly` MapServer/WMTS imagery returned for Kentucky, Indiana, and Illinois as a visual reference for customers or employees to draw property boundaries and service-area polygons, calculate area/perimeter, store the geometry and derived measurements in its own database, associate/reuse those values in estimates, include measurement overlays or numeric results in customer quote PDFs, and retain the user-created geometry if the imagery service or source imagery changes? Please identify any source-specific exceptions, required attribution/disclaimers, tile caching/downloading restrictions, rate/request limits, and production service availability terms. The service metadata identifies multiple imagery sources; how can an application identify the source and acquisition date for each location/zoom, and are any of those sources excluded from this use?

**Appropriate contact:** The USGS FAQ for The National Map products/services directs questions to **The National Map service desk, `tnm_help@usgs.gov`**. Request that the question be routed to the USGS/USDA imagery data owner or licensing authority if the service desk cannot confirm usage rights.

### Important boundary

This is a technical/source review, not a legal opinion. The source terms strongly favor use of National Map public-domain data, but the service mosaic has multiple sources and the prompt specifically requires not treating ambiguity as permission. Record written confirmation and service/source metadata before enabling saved commercial measurements.

## 4. Measurement resolution and suitability

### Known resolution

- The service’s description says source orthoimagery varies from **6 inches to 1 meter**. It says the majority of the CONUS service source is NAIP at **1-meter ground sample distance**.
- The cached service’s effective last observed tile level at Owensboro is about **1.9 meters per displayed pixel** at latitude 38°. Higher cached tile levels returned 404 in that sample. A close-extent export was visibly enlarged and did not restore fine detail.
- The national service metadata does not state the exact GSD or horizontal accuracy of the individual sample tiles. It also does not provide an acquisition date in the returned tile payload.

### Practical category assessment

| Feature | Assessment with current evidence |
|---|---|
| Large lawn boundary | **Conditional** for rough area estimates if the underlying tile is recent and at least 0.6m GSD; 1m imagery may support large lawn estimates with user review, but the tested cached view is coarser. |
| Landscaping beds | **Not reliable at 1m or coarser** for small/irregular bed edges, particularly under trees or shadows. Prefer ≤0.3m GSD or retain manual/on-site measurement. |
| Driveways | **Large driveway areas: conditional** at ≤0.6m source GSD; narrow edges, shared drives, or surface material boundaries require sharper imagery and field confirmation. |
| Parking lots | **Large lot area: conditional** at ≤0.6m GSD. Individual stalls/curbs/islands and small exclusions need finer detail. |
| Sidewalks | **Generally unsuitable** at 1m source GSD and especially at the observed cached display scale; a typical narrow sidewalk occupies too few pixels for dependable edges. |
| Buildings | Roof outlines may be visible at 1m in unobstructed areas, but eaves, overhangs, trees, and roof shadows make building-footprint tracing uncertain. Do not treat it as a parcel/survey boundary. |
| Asphalt surfaces | Large, visually distinct areas may be approximated; patchwork, shadows, parked vehicles, and similar-looking concrete/asphalt reduce edge confidence. |
| Custom areas | Depends on size and contrast; apply the same resolution/freshness gate and permit manual entry. |

### Recommended product threshold

These are proposed acceptance thresholds for Aerial Quote, not published USGS standards:

- **≤0.3m GSD (~1ft/pixel):** preferred minimum for fine service regions such as sidewalks, narrow beds, and detailed edges.
- **≤0.6m GSD (~2ft/pixel):** possible for large lawn, driveway, and parking-area estimates only after validation against field measurements and a user-visible “approximate” label.
- **>0.6m GSD:** do not enable automatic save as a trusted measured area for the full service catalog. Offer manual/on-site values, or allow a clearly marked rough estimate only if the business explicitly accepts that error range.
- **1m source imagery:** not a universal measurement layer; not enough evidence for narrow features and precise surface classification.
- **10m imagery:** unsuitable for property-level measurement.

At 1m GSD, one source pixel represents about 10.8 square feet; at 0.6m it is about 3.9 square feet; at 0.3m it is about 1 square foot. Boundary uncertainty spans multiple pixels in practice, so total area error can be larger than one pixel. Screen upscaling or a zoomed export does not create new source detail.

### Survey and construction accuracy

Drawing a polygon on an orthorectified aerial image estimates the visible surface boundary. It does not identify legal parcel lines or correct for image age, tree cover, georeferencing error, perspective/orthorectification residuals, or user vertex placement. No horizontal accuracy specification for the nine test points was established here.

Therefore, Aerial Quote results should be described as **planning/estimating measurements**, not survey-grade or construction-grade measurements. Property boundaries should be user-confirmed visual boundaries, not legal lot lines. Continue to permit field measurement for contractual or high-consequence quantities.

## 5. Costs, limits, and operational suitability

### Cost/access observations

- The REST tile requests succeeded without authentication, API key, registration, or a payment step.
- USGS states National Map data/services are free and public domain.
- No usage-based price or per-request charge was identified for this public service.
- No published numeric per-IP rate limit, production SLA, or guarantee of unlimited commercial tile volume was found in the service metadata or reviewed FAQs.
- The service is operated as a public USGS map service. It may change, be throttled, or become temporarily unavailable; the absence of a documented quota is not a promise of unlimited use or uptime.
- Do not fetch tiles in bulk, mirror the service, or build offline caches as part of this proposal. The service’s source-specific download restriction and unknown operational limits make that unnecessary and premature.

### Cost/production decision

**No new subscription appears necessary to display this public service at modest interactive volume.** However, a production application that depends on a public service has availability and request-volume risk. Before release, ask the National Map service desk about intended production volume, request limits, availability expectations, caching, and the correct service URL. Monitor response errors and provide a manual/on-site fallback. If BuildPro later needs guaranteed uptime, offline access, or large-scale tile hosting, estimate infrastructure/vendor costs separately; those needs are not covered by the free public endpoint.

## 6. Go/no-go decision

### Gate results

1. **Coverage:** **Provisional pass for sampled availability.** Nine points across KY/IN/IL returned tiles. Not a statewide completeness/date validation.
2. **Commercial drawing and saved derived data:** **Pending written confirmation.** General USGS National Map terms are permissive, but exact service/source and derived-data workflow confirmation is outstanding.
3. **Resolution:** **Fail for a universal Aerial Quote measurement layer on current evidence.** The source is predominantly 1m CONUS NAIP, sample tile dates/GSD are unknown, cached tile detail is coarser at the tested effective maximum, and close exports are upscaled. It may be useful for rough large-area preview, not all requested feature types.
4. **Cost:** **Provisional pass for no subscription at modest volume.** Public endpoint required no key in tests and has no identified per-request fee; request limits and SLA remain unconfirmed.

### Decision

**Do not approve the USGS imagery service as the single map-measurement source yet.** It is worth a small, non-production evaluation after written terms confirmation. If the service cannot provide adequate source resolution/date metadata or service guarantees for the required feature set, keep the map as an optional reference and preserve manual/on-site measurement rather than committing to it as an authoritative measurement workflow.

## 7. Next validation actions before implementation

These are validation actions only, not approved implementation tasks:

1. Send the written question above to `tnm_help@usgs.gov`.
2. Ask USGS how to obtain the source imagery and acquisition date for a clicked coordinate/zoom, and whether all layers used in `USGSImageryOnly` for KY/IN/IL allow commercial digitizing and derived-value retention.
3. Expand the sample across the actual service territory with a grid and parcel-level visual checks; record point, state, returned tile level, source/date, and observed quality. Do not use a single city result to infer statewide suitability.
4. Compare the imagery against field-measured examples for a large lawn, narrow bed, driveway, parking area, sidewalk, and building edge. Decide acceptable error by service category.
5. Confirm public-service request expectations, outage behavior, any throttling, and caching rules for production use.
6. Only after those checks, decide whether to approve a small first implementation phase. Do not approve all seven roadmap units based on this report.

## 8. Sources and methods

### Service test

- Public service: [USGSImageryOnly MapServer REST metadata](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer?f=pjson)
- Tile requests used the MapServer `/tile/{level}/{row}/{column}` endpoint; nine point tiles were requested at level 16. Owensboro tile levels 15–19 were also checked; levels 17–19 returned 404.
- Three 512×512 close-extent image exports were inspected for Owensboro, Evansville, and Carmi. They returned image files but did not show source detail beyond the cached/source image clarity.
- Requests were limited to these public USGS endpoints. No paid service, API key, production database, or provider account was used.

### Official policy and service documentation

- [USGS National Map service and data licensing](https://www.usgs.gov/faqs/what-are-terms-uselicensing-map-services-and-data-national-map)
- [USGS costs/restrictions for National Map data](https://www.usgs.gov/faqs/are-there-any-costs-or-restrictions-usage-data-downloaded-national-map)
- [USGSImageryOnly service metadata and source description](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer?f=pjson)
- [USGS imagery service URLs and cached/dynamic behavior](https://www.usgs.gov/faqs/what-are-urls-imagery-services-national-map-and-are-they-cached-or-dynamic)
- [USGS National Agriculture Imagery Program overview](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip)
- [Contact The National Map service desk](https://www.usgs.gov/faqs/how-can-i-submit-a-question-or-report-issues-regarding-national-map-products-and-services)
- [Google Maps Platform terms](https://cloud.google.com/maps-platform/terms)
- [Google Geocoding API policies](https://developers.google.com/maps/documentation/geocoding/policies)
- [Mapbox temporary versus permanent geocoding](https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [OpenStreetMap Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)

### Interpretation limits

- A successful tile request establishes that an image was served for that coordinate/zoom at request time; it does not prove freshness, source rights, survey accuracy, statewide coverage, or commercial suitability.
- A general public-domain statement does not identify the source/date for each composite tile.
- This report is not a legal opinion and does not treat ambiguous source rights as permission.
