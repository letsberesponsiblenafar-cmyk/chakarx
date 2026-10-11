# Chakar Experience

Kashmir itinerary intelligence and B2B trip-package builder.

## Product flow
Build Your Trip -> Destinations and overnight stays -> Hotels -> Activities & Transport -> Itinerary descriptions -> Costing -> Client PDF -> Saved Itineraries

`/saved-itineraries` is a private client library. A PDF download saves the editable trip to Supabase before offering the file. Open a saved client to change days, hotels or costing, use **Save changes** to keep edits, or download a revised PDF. **Build New** clears only the current planner draft and starts a separate trip; it does not delete prior clients. Existing PDF files created before this feature are not imported automatically.

## Destination library
The planner ships with 44 Kashmir destination records. Each record is destination-first and carries:
- short description
- minimum / ideal / maximum days
- minimum / ideal / maximum nights where overnight is supported
- overnight capability
- editable local sightseeing, each with a client itinerary sentence; these records automatically form the tickable Things to Do list
- popular activities with editable client sentences and library availability switches
- a photo query for the library profile

The Destinations step is date-first: each day has a visit or sightseeing destination and an overnight base. Changing the overnight base keeps the day visit, so an overnight in Gulmarg can become a Gulmarg day trip with a Srinagar hotel night. The later Itinerary step displays the chosen route, hotels and day copy; only the “About this day” description is editable there.

Ticked sightseeing places form the selected programme. The planner includes them once across the days spent exploring that destination, using each place's planned itinerary sentence. Standard days run from 08:00 to 22:00, adjusted for actual arrival and departure times. Nearby stops are preferred after a long transfer; major excursions are kept for a full visit day when one exists. Returning to a Srinagar hotel does not automatically add Srinagar sightseeing. If an older or manual route has no dedicated city day, its selected Srinagar circuit is grouped on one suitable return day. Shared attractions are assigned once, including overlapping destination records. Visit-duration estimates guide distribution and can show a nonblocking planning note; they do not silently remove selected places. About This Day remains manually editable. Quoted activities add their own sentence and group price independently of sightseeing selection. Suggested routes use Srinagar as a hub: short trips use day visits, while longer trips add outlying hotel nights with a return through Srinagar before the next major base.

Departure at or before 14:00 requires the final hotel night in Srinagar. This rule runs before sightseeing allocation and hotel pricing, including when an older saved route is reopened. The former outlying destination remains a day visit, and the final overnight control is locked. Departures after 14:00 keep the operator's chosen final base. Hotel selections and prices follow the actual route nights; any changed night dates need hotel verification again.

## Hotel master
Six supplied October 2026 hotel workbooks were verified as identical copies of the same six-destination source and deduplicated to 166 unique hotel records.

Hotel dashboard: `/hotels` (admin sign-in required). The dashboard lists the shared Supabase hotel master, filters by destination and search, and links to an individual edit page for every hotel. Admins can create, update, or delete a hotel. A single text-based PDF using the record format shown in the dashboard can update many hotels at once; the importer previews matched and new records before applying them. The dashboard includes a downloadable sample PDF.

Supplier B2B rates are omitted from the customer PDF. The browser now loads hotel data from an authenticated server endpoint after sign-in and does not bundle or persist the master in localStorage.

Every generated overnight base gets a hotel-selection record. The Destinations step controls exact hotel nights; the Hotels step shows their dates and lets the operator change the suggested hotel, occupancy and internal rates. Hotel suggestions favor a positive room rate, a matching category and rate validity for the selected stay dates. One confirmation at the bottom verifies all selected hotel rates, availability, rooms and meal plan; changing any stay clears its confirmation. An incomplete quote cannot be downloaded as a client PDF. Missing supplier rates are never invented; the dashboard filters hotels needing a rate. The hotel import uses “Sonmarg” while the destination library uses “Sonamarg”; the planner maps these names when attaching hotels.

## Costing
Activities enabled in the destination library are offered on the Activities & Transport step. An untouched option stays off the client PDF; the operator explicitly includes it with a group price or marks it as an exclusion. Disabled library activities cannot be newly quoted. A selected but unpriced activity blocks client PDF download. Short-trip arrival excursions require an early arrival time, and departure-day sightseeing requires a late departure.

The internal model is:

B2B accommodation + transport + operator-entered other package costs = internal B2B cost

Operator profit / markup is adjustable from 0-100% with presets. The selected vehicle’s daily rate is charged for every package day, including local sightseeing and departure. The customer selling total is the internal B2B cost plus the selected markup and 5% GST. Internal values are not printed in the client PDF. Payment-plan selection is left to the customer; the operator does not set instalments in Costing.

## PDF
The client PDF uses the supplied Chakar itinerary design at 540 x 780 pt. The cover changes only the traveller name. The cover letter, inclusions, exclusions, policies, testimonials and thank-you pages are fixed artwork. Policies retain both sample payment-plan choices for the customer.

Trip-specific values fill the tour summary, compact day-wise pages (up to five days per page), package/investment table and hotel table. The latter includes each destination’s exact night numbers. The day text uses the master itinerary and route playbook to explain transfers, excursions and overnight stays. The package table shows the current final customer total, vehicle, meal plan and rooms. B2B room rates, B2B subtotal and operator margin are not printed.

The site and PDF now use a transparent full-resolution copy of the original logo embedded in the supplied itinerary PDF, instead of an enlarged crop from a small screenshot. Regenerate its white and ink variants with `node scripts/make-transparent-logo.mjs`.

## Photos
Destination profile photos are loaded on demand from Wikimedia Commons through `/api/photos`. The library still works when the photo service returns no results.

## Sources
The daily Vercel cron and manual source checks save their latest HTTP observations to the existing `source_observations` table in Supabase. The `/sources` screen shows actual check times and reachability. A successful HTTP response is not a verification of travel facts or live supplier inventory. `CRON_SECRET` is required for scheduled checks; the proxy passes bearer-authenticated cron requests to the handler, which validates the exact secret.

## Development
```bash
npm install
npm run dev
```

## Vercel
Connect the repository and keep the root directory unchanged. Vercel should auto-detect Next.js. Set the admin and Supabase environment variables described in `DEPLOY_TO_VERCEL.md` before promoting this version.

For an existing Supabase project, run `supabase/saved_itineraries.sql` once in the SQL editor. The table uses RLS with no browser policy; only the authenticated Chakar server can read and write client plans with its secret key.

## Production boundary
The itinerary builder and hotel manager require an admin session. The current Git tree no longer contains the supplier-rate JSON; older commits in this public repository still contain that historical snapshot. New Supabase rows are protected by RLS, and the service-role key stays server-side. Import the supplied hotel master into Supabase from a text-based PDF once the project is connected.

Live hotel inventory is distinct from a supplied B2B rate. A dated provider query is required before claiming live room availability.
