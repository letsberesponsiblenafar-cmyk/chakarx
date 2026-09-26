# Chakar Experience v10 - implementation audit

## Destination library
- 44 destination records validated.
- 184 curated local-sightseeing entries validated.
- Every destination has a short description, days, nights/overnight capability, things to do, activities and a photo query.
- Destination stay-duration fields are expressed in days/nights; the destination model no longer contains min/ideal/max hour fields.
- Day-wise editing is date + stay + local sightseeing. Artificial clock slots are not used in the UI.

## Source hotel workbooks
Six uploaded October 2026 hotel workbooks were inspected with spreadsheet parsing. The six files contain the same six destination sheets and identical source cell data, so they were deduplicated rather than imported six times.

Unique imported hotel records:
- Srinagar: 49
- Pahalgam: 45
- Gulmarg: 34
- Sonmarg: 28
- Doodhpathri: 5
- Gurez: 5
- Total: 166

The source sheets provide hotel names, category bands and B2B MAP / Extra Bed / CNB where populated. The inspected worksheet cells do not contain separate address, room-type or website columns; those fields remain editable enrichment fields and are not fabricated.

## Hotel workflow
- Every generated overnight stay receives a hotel-selection record.
- Hotel selection is destination-filtered and package-category aware.
- Room setup uses explicit controls for rooms, extra beds and CNB.
- Per-stay accommodation cost recalculates from nights × occupancy × internal B2B rates.
- Missing hotel rates are surfaced before PDF generation.
- `/hotels` is the standalone B2B hotel master manager with destination summaries and inline editing.

## B2B privacy
The internal costing model uses the imported B2B fields. Profit / markup is operator-controlled and editable from 0-100% using presets and custom input. The client PDF contains only customer-facing hotel details and the final selling total. It does not print B2B room rates, Extra Bed B2B, CNB B2B, B2B subtotal or profit/markup.

## PDF fidelity
The supplied Chakar Experience template uses 540 x 780 pt pages. Pages are built from cleaned image templates derived from the supplied source artwork so the previous source text does not remain underneath the dynamic overlay. Static artwork, decorative elements and page structure are retained.

The dynamic day text intentionally avoids clock times and route-hour presentation. The PDF shows dates, stay destination, local sightseeing narrative, hotel names and the customer selling total.

The dynamic overlay uses standard built-in PDF fonts for new text because the source font binaries are embedded in the supplied PDF and are not distributed as project font files. The source artwork retains its original embedded typography.

## Validation performed
- Destination JSON parses and contains exactly 44 records.
- Destination library contains 184 local-sightseeing records.
- No destination record retains min/ideal/max hour fields.
- Hotel master JSON contains 166 unique hotel IDs.
- Hotel master destination counts: 49 / 45 / 34 / 28 / 5 / 5.
- 83 imported hotel records contain a populated MAP B2B value; missing values remain explicit rather than invented.
- TypeScript/TSX files were transpile-parsed with the installed TypeScript compiler: no syntax diagnostics in 29 checked source files. The maintained data check lives at `scripts/verify-model.mjs`.
- PDF template preview has 12 pages at 540 x 780 pt and was rendered for visual inspection of the cleaned template artwork.

## Dependency/build note
The working folder did not contain `node_modules`. Dependency installation timed out in the available environment, so a full `next build` could not be completed here. The app remains structured as a standard Next.js 16 / React 19 / TypeScript project.

## Production boundary
The B2B hotel master is still bundled in the prototype client and persisted in browser localStorage. This protects it from the customer PDF but is not equivalent to authenticated server-side secrecy. For production, move B2B rates to authenticated Supabase/Postgres with role-based access/RLS.

Live hotel inventory is also distinct from a supplied B2B rate. A live room result requires a dated hotel/provider query; the current hotel API is a server snapshot, not a live inventory feed.
