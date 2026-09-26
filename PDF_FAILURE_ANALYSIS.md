# PDF Failure Analysis — v16

## Root causes found

1. `jsPDF.addImage()` was given public URL strings (`/pdf-assets/...`) directly. In a browser build, this is not a reliable image-loading mechanism. The generator can fail before `doc.save()`/Blob creation because jsPDF expects image data, an image element, canvas, or a supported data URI rather than a raw application URL.
2. The UI treated missing hotel rates as a hard PDF-generation gate. This made the button show `PDF not ready` even though a document could safely be produced with customer-facing `To be confirmed` pricing.
3. Hotel-selection count was also treated as a hard gate. The PDF now creates a placeholder hotel card when an overnight stay has no selected hotel.

## Fix

- Fetch both master artwork files from the same origin.
- Convert them to data URLs with `FileReader` before passing them to jsPDF.
- Fail with a precise asset-loading message if an artwork file cannot be fetched or decoded.
- Generate the PDF whenever a valid itinerary exists.
- Mark incomplete hotel pricing as `To be confirmed` instead of generating a misleading total.
- Keep the supplied cover unchanged.
- Keep the supplied rules master as the background and place fixed rules only in its reserved upper area.
- Preserve bounded text wrapping and page-break logic for dynamic pages.
- Guard the resulting Blob against empty output before downloading.

## External dependency decision

No new external PDF service is required. The project already contains `jspdf@4.2.1`; the failure is in browser-side asset handling and PDF gating, not the absence of a PDF library.
