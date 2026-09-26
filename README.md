# Chakar Experience

Kashmir itinerary intelligence and B2B trip-package builder.

## Product flow
Build Your Trip -> Day-wise Itinerary -> Hotels -> Costing -> Client PDF

## Destination library
The planner ships with 44 Kashmir destination records. Each record is destination-first and carries:
- short description
- minimum / ideal / maximum days
- minimum / ideal / maximum nights where overnight is supported
- overnight capability
- local sightseeing with short descriptions and tags
- things to do
- popular activities
- a photo query for the library profile

The day editor is date-first: it shows the date, stay destination and local sightseeing without artificial clock slots. Clicking an overnight destination suggestion refreshes that day's stay and the available local sightseeing list immediately.

## Hotel master
Six supplied October 2026 hotel workbooks were verified as identical copies of the same six-destination source and deduplicated to 166 unique hotel records.

Hotel manager: `/hotels`

The manager supports destination/category/search filters, clickable destination summaries, inline editing, add/delete, import/export, snapshot refresh, needs-attention filtering, and reset to the supplied import.

Supplier B2B rates are internal only: MAP B2B, Extra Bed B2B, CNB B2B and operator profit are never shown in the customer PDF.

Every generated overnight base gets a hotel-selection record. The Hotels step lets the operator set rooms, extra beds and CNB explicitly; stay accommodation cost recalculates immediately. Missing B2B rates are flagged and the client PDF stays locked until every overnight stay is price-ready.

## Costing
The internal model is:

B2B accommodation + transport + meals + activities + contingency = internal B2B cost

Operator profit / markup is adjustable from 0-100% with presets. The customer selling total is the internal B2B cost plus the selected markup. Internal values are not printed in the client PDF.

## PDF
The client PDF uses fixed-size page templates derived from the supplied Chakar Experience itinerary. The original 540 x 780 pt artwork and static layout remain intact; only cleared variable text regions are overlaid.

The customer receives customer-facing dates, stay/sightseeing content, hotel names and the final selling total. B2B room rates, B2B subtotal and operator margin are not printed.

## Photos
Destination profile photos are loaded on demand from Wikimedia Commons through `/api/photos`. The library still works when the photo service returns no results.

## Development
```bash
npm install
npm run dev
```

## Vercel
Connect the repository and keep the root directory unchanged. Vercel should auto-detect Next.js. No Python configuration is required.

## Production boundary
The current prototype keeps the imported hotel master in the browser and localStorage for offline-style editing. That is a UI/privacy separation from the customer PDF, not server-side B2B secrecy. For production, move B2B hotel rates to authenticated Supabase/Postgres with role-based access/RLS.

Live hotel inventory is distinct from a supplied B2B rate. A dated provider query is required before claiming live room availability.
