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

Supplier B2B rates are omitted from the customer PDF: MAP B2B, Extra Bed B2B, CNB B2B and operator profit are never printed there. The current public client-side prototype still exposes its imported rate data to anyone who can load the app or repository; see the production boundary below.

Every generated overnight base gets a hotel-selection record. Each destination card shows its exact night numbers and dates. The operator can clear the suggested pattern and select nights from scratch; a night disappears from other pickers once assigned. Applying the pattern updates the itinerary and hotel-night totals. The Hotels step also controls rooms, extra beds, CNB, vehicle and its daily rate. Missing B2B rates are flagged; the current calculated customer amount remains visible and is marked provisional in the PDF. The hotel import uses “Sonmarg” while the destination library uses “Sonamarg”; the planner maps these names when attaching hotels.

## Costing
The internal model is:

B2B accommodation + transport + operator-entered other package costs = internal B2B cost

Operator profit / markup is adjustable from 0-100% with presets. The selected vehicle’s daily rate is charged for every package day, including local sightseeing and departure. The customer selling total is the internal B2B cost plus the selected markup and 5% GST. Internal values are not printed in the client PDF. Payment-plan selection is left to the customer; the operator does not set instalments in Costing.

## PDF
The client PDF uses the supplied Chakar itinerary design at 540 x 780 pt. The cover changes only the traveller name. The cover letter, inclusions, exclusions, policies, testimonials and thank-you pages are fixed artwork. Policies retain both sample payment-plan choices for the customer.

Trip-specific values fill the tour summary, compact day-wise pages (up to five days per page), package/investment table and hotel table. The latter includes each destination’s exact night numbers. The day text uses the master itinerary and route playbook to explain transfers, excursions and overnight stays. The package table shows the current final customer total, vehicle, meal plan and rooms. B2B room rates, B2B subtotal and operator margin are not printed.

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
