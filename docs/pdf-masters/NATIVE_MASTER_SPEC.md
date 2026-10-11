# Native client PDF artwork

`public/pdf-assets/client-master.pdf` preserves the supplied Asna reference's
embedded fonts, vector headings, table gradients, rules, decorative artwork,
photographic crops and original paper texture. It is a PDF background library,
not a rasterized document. Each page measures exactly 540 x 780 pt.

The client PDF composer imports the appropriate native background and places
the current jsPDF-generated text and logo above it. The JPEG/PNG assets remain
available for browser previews. They are not full-page images in the download.

## Rebuilding

Run the PDF skill's artifact-operation marker once before authoring. Use the
original 12-page Asna itinerary supplied by the user as the script argument:

```powershell
python -m pip install --target out/pdf-tools PyMuPDF
python scripts/prepare-vector-pdf-masters.py original-asna-itinerary.pdf
```

The script also requires the bundled `pypdf` and `pypdfium2` dependencies.
PyMuPDF is used only while preparing artwork; Vercel does not require Python.
The generated `client-master.json` maps artwork names to zero-based PDF page
indices. Hotel variants retain the table header and zero to four filled rows.
Unused rows are clipped at the native table groups to reveal the exact paper
texture already underneath; no texture strip is copied or stretched.

Sample traveller details, sample itinerary text, table values, the obsolete
353 x 155 logo, old footer numbers and the old rate disclaimer are removed
from PDF content before import. Text-only redactions preserve photographs and
vector shapes. The inclusion and exclusion pages additionally remove the
sample list text, body bullets and sample white paper-shaped decoration.

## Quality limits

Original photography stays at its source resolution without being enlarged or
recompressed as a full-page JPEG. The supplied references contain the same
640 x 464 inclusion photo, 994 x 663 exclusion photo and 900 x 1300 paper
texture. Native output preserves that detail; it cannot create details absent
from those sources. Text, borders and gradients stay sharp at any zoom.

After rebuilding, inspect the master and a generated client PDF. Verify all
page kinds, hotel row counts, sample-text removal, current logo, transparent
overlay alignment, pagination and preservation of the source design.
