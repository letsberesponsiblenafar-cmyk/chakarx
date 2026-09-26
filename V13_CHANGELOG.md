# Chakar Experience v13 — Package, Destination & PDF Refinement

- Package ladder aligned to the requested meaning: Signature = Budget/3 Star; Signature Plus = upgraded 3 Star; Signature Premium = 4 Star; Elite = 5 Star/Luxury.
- Hotel auto-selection no longer falls back to a hotel from the wrong package category.
- Day 1 explicitly displays `Srinagar local sightseeing` when the first overnight is Srinagar.
- Day cards keep the About This Day narrative and remove the separate sightseeing/place-chip section from the main view.
- Destination picker now orders Core/popular destinations first, then Secondary, then Offbeat/Lower priority, using the intelligence registry and a Kashmir popular-destination ordering.
- Costing no longer prices meals under Others. Others is only an operator-entered additional package cost.
- Cost sequence is accommodation → transport → others → cost range → custom profit/markup → GST 5% → final customer total.
- GST is calculated after profit/markup.
- Client PDF download now uses an explicit Blob/object-URL browser download for more reliable Vercel/browser behavior.
- PDF day/stay layouts retain bounded text wrapping and page-break protection to prevent text overlap.
