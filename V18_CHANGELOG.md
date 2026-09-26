# Chakar Experience v18

## Requested UX changes

- Pickup points are now separate: **Srinagar**, **Jammu**, and **Other**. Legacy `Srinagar, Jammu` saved state is normalized to `Srinagar`.
- Day editing is inline: the heading becomes an input in the heading itself, About This Day becomes a textarea inside the About section, and the overnight destination picker appears inside the existing overnight row.
- Removed the long **Day Places** / local sightseeing editor from the Edit Day area.
- Overnight destination choices show destination names only; descriptions are no longer repeated in the picker.
- Changing an overnight destination clears stale custom title/about text so the destination's own intelligence description automatically becomes the new baseline.
- Hotel management remains a direct link from the same overnight row.

## Exact-night hotel allocation

- Replaced the long destination-night allocation grid with a compact exact-night planner.
- Each destination shows its current night count.
- Clicking the count opens `Night 1 ... Night N` controls.
- Selecting a night moves that night to the selected destination, allowing non-contiguous stays such as Gurez on Night 1 and Night 3.
- Added `setNightSequence()` so the exact night order is preserved instead of collapsing everything into contiguous destination blocks.
- Added a compact `Add another overnight destination` control using the source destination library and priority ordering.

## Hotel selection UX

- Search and database selection remain one **Search hotel** tab.
- `Custom hotel` is a second tab for manually entering hotel name and pricing.
- Custom room, extra-bed and CNB rates remain available without leaving the hotel card.
- Existing common occupancy and common B2B policy controls are preserved.

## Costing / PDF data flow

- Final customer total receives stronger visual emphasis after GST.
- The client PDF continues to calculate from the live planner state (`calculateCosts(plan, hotelSelections, costModel)`), so accommodation, transport, other amount, markup and 5% GST remain synchronized with the costing page.
- No PDF artwork/master-page replacement was made in this iteration.
