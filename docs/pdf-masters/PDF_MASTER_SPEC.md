# Chakar Client PDF — Master Specification

## Fixed artwork
- `public/pdf-assets/chakar-cover-master.jpg` is the supplied cover artwork and is used as a full-bleed first page without dynamic text overlays.
- `public/pdf-assets/chakar-rules-master.jpg` is the supplied second master artwork and is used as the fixed package-notes/rules page background.
- `docs/pdf-masters/NFU-reference.pdf` is the original supplied PDF reference.

## Fixed content
The package-notes page uses the standard inclusion/exclusion rules from the Chakar itinerary route playbook. These do not depend on destination, hotel, route or price inputs.

## Dynamic content
Only the following sections change per trip:
- Traveller and trip facts
- Day-by-day itinerary and route
- Overnight stays / hotel selections
- Customer-facing investment
- GST and final selling total

## Collision prevention
- All variable copy is passed through `splitTextToSize` before rendering.
- Day-flow cards calculate their height from wrapped line counts.
- If a card cannot fit, a new PDF page is created before rendering it.
- The cover page contains no dynamic overlay text.
- Customer PDF never displays internal B2B rates or internal profit/markup.
