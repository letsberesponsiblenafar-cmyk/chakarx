# Chakar Experience v17

## Itinerary
- Day 1 now explicitly includes arrival based on the selected pickup point, followed by local sightseeing around the first overnight destination.
- Day 1 default heading is editable and reflects the arrival point.
- Every day has an editable heading and editable About This Day text.
- Hotel control remains a direct link to the existing Manage Hotels step.
- Added full-day add/remove controls; changing a day updates the night count and hotel layer.
- Removed the old sightseeing list from the main day card; destination places remain available inside Edit Day as optional additions.
- Popular/core destinations are surfaced before secondary/offbeat destinations.

## Hotels
- Added a complete night-allocation editor for the full trip.
- All overnight-capable destinations can be assigned 0..N nights.
- Allocation must equal the total trip nights before applying.
- Applying allocation rebuilds the route and hotel rows while preserving compatible day edits.
- Existing hotel search, custom hotel names, occupancy, common operator policy and B2B controls remain intact.

## PDF
- Supplied cover/rules artwork remains the fixed master artwork.
- PDF image assets are loaded through fetch -> Blob -> data URL before jsPDF addImage.
- Master artwork uses highest-quality jsPDF image insertion available here.
- Dynamic day, hotel and overview text now uses measured/wrapped blocks and page-break checks to prevent collisions.
- Day About text no longer enumerates sightseeing names; it uses the destination description and arrival context.
- Custom day title/about content is carried into the client PDF.
- Hotel names and addresses are wrapped safely.
- Missing hotel rates do not block PDF generation.

## Validation
- TypeScript source parse check passed for modified TS/TSX files.
- Internal itinerary/data/intelligence/hotel TypeScript check passed with a temporary isolated tsconfig.
- Full Next.js build could not be executed because dependency installation timed out in the build environment; no claim of a production build is made here.
