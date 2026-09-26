# Chakar v11 — Intelligence Specification

This rebuild starts from the uploaded **Chakar-Experience-v10-Vercel-TypeScript-Fix(1).zip** and keeps its Next.js/TypeScript architecture, hotel master, costing flow, PDF flow and latest visual language.

The intelligence layer is normalized from the Chakar itinerary playbook/master/database source material supplied in the project.

## 1. Destination hierarchy

- **CORE:** Srinagar, Gulmarg, Pahalgam, Sonamarg, Doodhpathri.
- **SEASONAL:** Gurez — May–October planning window; current road/access still requires verification.
- **OFFBEAT / SECONDARY / LOW PRIORITY:** Aharbal, Chatbal/Chatpal, Sinthan Top, Margan Top, Bangus, Lolab, Keran, Tosa Maidan, Wular, Dachigam, Watlab, Ningli, Botapathri, Alpather, Gagangeer, Tulail, Drang, Kanihama, Peer Ki Gali, Dubjan, Shikargah, Sitaharan, Nilnag, Drangyari and other lower-priority records from the structured database.
- Offbeat/low-priority records are **not** automatically preferred over the core circuit; interests, trip length or explicit selection must justify them.
- Trek-only products are not silently inserted into ordinary sightseeing.

## 2. Overnight state

- A day trip never changes the overnight location.
- The next day's origin is always the actual previous overnight.
- The engine separates `day trip`, `transfer`, `sightseeing` and `overnight` states.
- Srinagar is used as the normal hub when a circuit can be built without unnecessary direct cross-valley movement.

## 3. Route policy

Route preference values are:

- `PREFERRED`
- `ALLOWED`
- `AVOID`
- `NOT_ALLOWED`

Core Srinagar ↔ destination routes are preferred.

Direct cross-valley examples such as:

- Gulmarg ↔ Pahalgam
- Pahalgam ↔ Sonamarg
- Gulmarg ↔ Sonamarg
- Doodhpathri ↔ Gulmarg
- Doodhpathri ↔ Pahalgam

are treated as **AVOID by default**, not impossible. They may be manually selected and then trigger an explicit comparison/warning and the correct vehicle-day charging rule.

## 4. Vehicle costing

- Standard preferred transfer: 1 vehicle day.
- Long direct AVOID transfer: 2 vehicle days where the route template specifies it.
- Day-trip round trips consume a vehicle service day but do not create an overnight change.
- Route text is never used as pricing data.

## 5. Sightseeing status

The database preserves:

- `MANDATORY` → standard sightseeing
- `OPTIONAL` → can be added
- `CONDITIONAL` → weather/access/operation dependent
- `EXTRA` → separately charged where applicable
- `EXCLUDED` → not in base package

Examples include Alpather, Nilnag, Sinthan Top, protected-area visits, high-altitude excursions and other access-sensitive products.

## 6. Activity rules

Optional/extra activities remain outside the base package unless explicitly quoted.

Examples include:

- Gondola tickets
- Skiing
- Snowboarding
- Snowmobile / snowbike
- Sledging
- Pony/horse rides
- ATV
- Lidder rafting
- Sindh rafting
- Fishing/angling
- Trek products
- Camping
- Wular boating
- Dachigam wildlife visit
- Kani shawl experience
- Paragliding

The costing engine therefore does **not invent an activity price from the number of sightseeing blocks**. Activity pricing must be explicitly supplied through the costing layer.

## 7. Access / seasonal rules

- **Gurez:** blocked outside May–October unless an authorized override exists; current access must still be checked.
- **Daksum:** live/manual access verification.
- **Weather-sensitive mountain destinations:** conditional warnings.
- **Remote/border destinations:** current local/security/access verification.
- **Protected areas:** current permit/entry/timing checks.

## 8. Data separation

The implementation keeps these concepts separate:

`Destination → Itinerary Template → Route → Sightseeing → Activity → Hotel → Pricing`

This prevents descriptive text from becoming pricing, and allows the same destination to have multiple trip-length templates.

## 9. Data gaps deliberately left as live/operational inputs

- hotel availability / blackout dates
- seasonal hotel rates
- meal and occupancy rules
- supplier rates
- vehicle rate tables
- taxes and markup
- cancellation rules
- exact live route distance / travel time
- activity operator availability and current pricing

The UI now exposes these boundaries rather than pretending they are confirmed.

## 10. UI/UX improvements

The v10 design language is retained and refined with:

- Intelligence banner
- Route-policy chips
- Overnight-state visibility
- Live-check indicators
- Optional/extra badges
- Decision trace
- Package-boundary messaging
- Cleaner route editing context
- Better destination priority visibility when editing an overnight
- Explicit transport-day calculation
- Cleaner activity costing boundary

