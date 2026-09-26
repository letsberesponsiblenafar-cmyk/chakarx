# Chakar Experience v12 — UX & Commercial Workflow Update

## Build Your Trip
- Removed the large “Your Kashmir journey, planned around…” hero section.
- Build Your Trip is now the first visible section.
- Traveller's name, dates and pickup are the first fields.
- Pickup defaults to `Srinagar, Jammu`, supports `Jammu`, and supports a custom pickup point.
- Adults are directly writable rather than stepper-only.
- Replaced “Young travelers” with `Children`.
- Child count is directly writable and each child's age is editable.
- Age > 14 automatically moves that child into Adults.
- Budget is explicitly per person.
- Replaced Hotel category with Itinerary category:
  - Signature
  - Signature Plus
  - Signature Premium
  - Elite
- Removed Travel Style from the user form.
- Removed Transport from the user form; transport remains an internal costing/routing assumption.
- Removed “What matters most?” from the user form.
- Meal plan is now Breakfast Only / Breakfast & Dinner / None.
- Primary action is `Next`.

## Itinerary
- Day heading hierarchy is larger and clearer.
- Day 1 now reads as `Srinagar local sightseeing` rather than `Stay: Srinagar`.
- Added an About This Day section.
- About sections use the destination description plus the destination's local sightseeing library.
- Edit Day shows destination summaries in the same About format.
- Hotel management now sits below the day About section.
- Overnight state remains explicit.

## Hotels
- Common operator-controlled rooms / extra beds / CNB setup.
- Common B2B room / extra-bed / CNB rates can be applied across all stays.
- Individual hotel overrides remain possible for customer-specific requests.
- Hotel search is now typeable/searchable.
- Custom hotel names can be typed directly.
- Internal B2B calculations remain separate from client-facing values.

## Costing
- Sections are now:
  1. Accommodation
  2. Transport
  3. Others
  4. GST @ 5%
  5. Customer selling range
  6. Profit / markup
- GST is calculated on accommodation + transport + others.
- Profit / markup remains internal.
- Client-facing total remains separate from internal B2B detail.

## Client PDF
- Added a visual PDF preview inside the application.
- Added Download Client PDF.
- Rebuilt dynamic day pages with bounded text areas and explicit wrapping to prevent text overlap.
- Client PDF shows accommodation, transport, others and GST plus final customer selling total.
- Internal B2B rates and profit remain private.

## Readability
- Increased typography throughout the planner, itinerary, hotels, costing and PDF preview.
- Reduced dependence on tiny micro-copy.
