# Chakar Experience v11 — Intelligence Rebuild

This package is a direct rebuild of the uploaded Chakar Experience v10 codebase, not a separate static prototype.

## Main changes

1. Added `data/itinerary-intelligence.json` containing the structured itinerary-builder database rules, route templates, sightseeing status, activities, exclusions, additional destinations, priority guide, research notes and engine rules.
2. Added `lib/intelligence.ts` as the rule access layer.
3. Reworked `lib/itinerary.ts` to use destination priority, seasonal gating, route preference, vehicle-day rules, day-trip state and explicit intelligence metadata.
4. Day trips preserve the overnight state and the next-day origin.
5. Direct cross-valley AVOID routes are surfaced instead of being silently treated as normal routes.
6. Gurez is season-gated; Daksum and other access-sensitive locations produce live-check signals.
7. Base costing no longer fabricates activity prices from sightseeing count. Optional/extra activities are excluded unless an explicit activity allowance is entered.
8. Transport costing uses route vehicle-day rules.
9. Added intelligence UI to the itinerary and trip-builder screens while retaining the existing v10 visual language.
10. Added package-boundary messaging to costing.
11. Bumped planner local-storage key to v11 to avoid stale v10 plan state.

## Validation

The environment used for this package did not contain the project's npm dependencies, so a complete Next.js build could not be executed locally. The global TypeScript compiler was used to inspect the modified TypeScript; remaining compiler errors are dependency/type-resolution errors because `next`, `react`, and `lucide-react` are not installed in the working container.

Run `npm install` followed by `npm run build` in a normal Node/Vercel environment.
