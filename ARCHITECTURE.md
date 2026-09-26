# Chakar Experience - Architecture v10

Next.js 16 + React 19 + TypeScript + App Router.

## Destination intelligence
The destination library contains 44 records. Each destination is described using day and night capacity rather than hour-based capacity:
- `min_days`, `ideal_days`, `max_days`
- `min_nights`, `ideal_nights`, `max_nights`
- `overnight_allowed`
- `local_sightseeing`
- `things_to_do`
- `activities`
- `photoQuery`

The itinerary engine keeps route distances/times as internal routing inputs, but the operator-facing itinerary is date-first and does not expose artificial clock slots.

## Itinerary editing
`retargetDay()` changes one overnight day to another overnight-capable destination. The planner rebuilds that day using the selected destination's local sightseeing library and re-syncs the hotel's stay record.

The UI shows all overnight-capable destinations as searchable suggestions and all local sightseeing options for the selected destination as one-click add/remove controls.

## Hotel data
Six supplied October 2026 B2B hotel workbooks were verified as identical copies of the same six-destination source and deduplicated to 166 hotel records.

B2B MAP / Extra Bed / CNB values are stored in the hotel master. Address, room type and website are editable enrichment fields because they were not populated in the inspected source cells.

The `/hotels` page is a standalone destination-filtered manager. The planner's Hotels step consumes the same active database and creates a hotel selection for each overnight base.

## Cost flow
For each selected hotel stay:
`nights × rooms × MAP B2B + nights × extra beds × Extra Bed B2B + nights × CNB × CNB B2B`

Then:
`B2B accommodation + transport + meals + activities + contingency = internal B2B cost`

Operator profit / markup is applied after the internal B2B cost. The customer PDF receives only the customer selling total.

## Customer PDF
Customer PDF generation uses cleaned fixed-size visual templates derived from the supplied Chakar Experience source PDF. Source page size is 540 x 780 pt. Static artwork remains the background; only designated text regions are dynamic.

PDF generation is gated until all overnight stays have a selected hotel and a positive internal MAP B2B room rate.

## Photos
Destination profiles can query Wikimedia Commons through `/api/photos` on demand.

## Production model
Prototype state is browser/localStorage-backed so the workspace can be edited without a database connection. For production, move the hotel master and B2B rates behind authenticated Supabase/Postgres APIs with RLS/role-based access. Live hotel room availability should be queried separately from supplier B2B rates using a dated provider integration.
