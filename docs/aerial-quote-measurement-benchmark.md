# Aerial Quote Measurement Benchmark

**Date:** 2026-11-19  
**Scope:** Public imagery only; no customer records or property data used.

## Reference dimensions

American football fields under NFHS, NCAA, and NFL rules are 360 ft by 160 ft, including end zones, for 57,600 sq ft. The distance between goal lines is 300 ft. Source: [Football Field Dimensions, Markings and Layout](https://playfieldatlas.com/guides/football-field-dimensions-markings-layout), which cites the official rule books.

Public imagery samples were taken at Rash Stadium (Owensboro, KY), Reitz Bowl (Evansville, IN), and Ken Hunt Stadium (Mt. Vernon, IL). The same locations were viewed in current Esri imagery and the corresponding state imagery layer.

## Calculation check

The Aerial Quote area and length conversions were checked with a geodesic rectangle sized to the standard field:

| Measurement | Reference | Calculated | Difference |
| --- | ---: | ---: | ---: |
| Full-field area | 57,600 sq ft | 57,600.48 sq ft | +0.0008% |
| End line to end line | 360 ft | 360.00001 ft | <0.001% |

This confirms the Turf-based unit conversion for known coordinates. It does **not** confirm that a person can place an outline on imagery with the same accuracy.

## Imagery and outline observations

- State imagery showed clearer field markings than current Esri imagery at the three public examples, especially the Illinois 2025 layer. That should make manual boundary placement easier.
- In the Illinois example, the visible painted rectangle was easy to trace on the state layer; the same edges were softer on current Esri imagery. Because the preview browser was not signed in, I could not draw and save the same polygon through Aerial Quote on both layers. I am not treating a visual pixel trace as a verified app measurement.
- Current Esri z20 tiles returned “Map data not yet available” for the sampled locations. The state layers continued to return imagery there. This is provider coverage behavior, not a failure of the measurement calculation.

## Zoom and placement sensitivity

At latitude 38° and z19, one displayed pixel represents about 0.77 ft on the ground; one zoom level out doubles that to about 1.54 ft. Moving both ends of a 360 ft length by one pixel changes it by roughly 1.5 ft. Moving both sides of a 160 ft width by one pixel also changes it by roughly 1.5 ft. For the standard field, that is about 1.4% area change at z19 or 2.8% at z18. A three-pixel placement error is roughly 4% at z19 and 8% at z18. Narrow strips and irregular boundaries are more sensitive.

## Practical use

Treat aerial quantities as estimates, not surveyed measurements. Use a 5% difference as a review trigger, not as a guaranteed accuracy level. Verify onsite when boundaries are obscured, irregular, or narrow; when imagery sources disagree by more than 5%; or when the area difference could materially change the quote. The imagery comparison supports using the sharper state layer where available, but end-to-end outline accuracy still needs an authenticated Aerial Quote draw test against known controls before it can be called validated.
