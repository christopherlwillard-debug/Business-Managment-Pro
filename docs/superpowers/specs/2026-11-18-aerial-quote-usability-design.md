# Aerial Quote Usability Design

**Status:** User-approved direction; awaiting spec review and user review
**Date:** 2026-11-18
**Product:** BuildPro Contractor Management App

## Goal

Make the existing Aerial Quote workflow easier to follow without removing its map, polygon drawing, length measuring, property links, measurement revisions, pricing controls, or estimate creation.

The user approved a map-first workspace and asked to keep all controls visible rather than hiding optional settings in collapsed panels.

## Approved layout

- **Desktop and laptop:** Keep the map prominent in a wide left workspace. Place the complete property, measurement, services/pricing, and estimate workflow in a narrower right column.
- **Phone and narrow screens:** Show the map first, followed by the same workflow sections in order. The page itself must scroll normally inside the app shell; the app's fixed mobile navigation must not cover the last controls.
- Keep property sharing and pricing-profile management visible. They may be compactly grouped, but must not require opening a collapsed panel.
- Keep all current controls available, with plain labels and concise instructions. Do not remove steps or change calculations to reduce page length.

## Primary workflow

Present the actions in this order:

1. Select an existing client/prospect property or enter a new property.
2. Locate the property and use the existing map drawing tools to measure areas or lengths.
3. Review and save measurements as a new immutable property revision.
4. Select the existing service and pricing profile controls.
5. Calculate and create the existing estimate.

Show the selected property's address and client/prospect association clearly. Keep saved revisions accessible; loading or revising measurements must not overwrite an earlier revision.

## Scope boundaries

- Reorganize the current Aerial Quote page and improve labels, section grouping, spacing, and scroll behavior only.
- Reuse the existing Aerial Quote map component, geocoding, boundary lookup, property records, measurement-revision APIs, pricing profiles, calculation endpoint, and estimate creation flow.
- Preserve the profile-to-Aerial-Quote links and existing business ownership checks.
- Do not add or change imagery providers, map services, drawing geometry behavior, database schema, quote lifecycle, pricing arithmetic, or production data.
- Do not introduce additional screens or modals.

## Interaction and failure states

- Keep map actions visible and enabled/disabled according to the current address and map state.
- Keep loading and error messages near the property or measurement controls they affect.
- Prevent creating a revision until the selected property's revision history has loaded.
- Preserve the current unsaved-measurement warning and require a saved revision before calculation.
- Keep actions usable at phone widths, with content scrollable above the fixed bottom navigation.

## Verification

- Check the map and drawing controls are visible in the desktop/laptop split layout and at the top of the narrow-screen flow.
- Check the page scrolls from property selection through estimate creation without clipping or nested-scroll traps.
- Verify launching from client and prospect properties, with and without measurement history.
- Verify drawing area and measuring length still add quantities to the measurement editor.
- Verify saving edits creates a new revision and leaves older revisions unchanged.
- Verify the created estimate remains attached to the selected property and its client/prospect.
- Run the contractor app typecheck, relevant tests, and production build.
- Do not deploy as part of this work.
