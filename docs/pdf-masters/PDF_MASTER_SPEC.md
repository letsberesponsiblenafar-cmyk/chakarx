# Chakar client PDF layout

The generator follows the supplied Asna itinerary design on 540 × 780 pt pages.

| Order | Page | Variable fields |
| --- | --- | --- |
| 1 | Discover Kashmir cover | Traveller name only |
| 2 | Cover letter | None |
| 3 | Tour summary | Duration, dates, pickup, traveller counts and ages |
| 4+ | Day-wise itinerary | Four or five detailed days per page, with transfer and overnight details |
| Next | Package type / investment | Category, customer total, vehicle, meal plan, room count |
| Next | Hotel type | Destination night numbers and selected hotels, up to four destinations per page |
| Final five | Inclusions, exclusions, policies, testimonials, thanks | None |

The fixed pages are full-page artwork from the supplied sample. The policies page contains two fixed payment-plan choices for the customer; the operator does not edit or select a payment plan in the planner. The first page changes only the traveller name. The variable pages use cleaned copies of the sample artwork and overlay current planner values.

The investment table shows the current calculated total, including transport, markup and GST. If a hotel rate is missing, the total is marked provisional rather than hidden. Internal hotel rates and markup are omitted from the customer PDF.

`node scripts/verify-pdf.mjs` renders a representative trip through the production PDF builder and checks that the full document and artwork are present.
