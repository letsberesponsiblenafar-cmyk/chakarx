"""Rebuild clean 300 DPI itinerary artwork from the supplied vector PDF.

Run with the original Asna itinerary PDF path. The sample traveller's mutable
text is removed before rendering; fixed copy and artwork are preserved.
Then run scripts/prepare-pdf-artwork.mjs to replace the old header logo.
"""
from pathlib import Path
import os
import sys
import tempfile
import time

import pymupdf
from PIL import Image

if len(sys.argv) != 2:
    raise SystemExit("Usage: python scripts/prepare-hd-pdf-artwork.py original-itinerary.pdf")

source = Path(sys.argv[1])
if not source.is_file():
    raise SystemExit(f"Source PDF not found: {source}")

output = Path(__file__).resolve().parent.parent / "public" / "pdf-assets"
page_names = {
    0: "asna-cover-template.png",
    1: "standard-letter.jpg",
    2: "standard-summary.jpg",
    3: "standard-daywise.jpg",
    5: "standard-package.jpg",
    6: "standard-hotels.jpg",
    7: "standard-inclusions.jpg",
    8: "standard-exclusions.jpg",
    9: "standard-policies.jpg",
    10: "standard-testimonials.jpg",
    11: "standard-thanks.jpg",
}
summary_values = {"10 Nights / 11 Days", "24 sep 2026", "04 oct 2026", "Srinagar", "4 Adults plus 1 kid (11yrs)", "Number of persons"}
daywise_fixed = {
    "Day Wise Itinerary", "Do you Know?", "Know more!", "Consult Expert Free Now!",
    "Srinagar's Floating Market:", "India's only kind watery", "bazaar, Asia's top three!",
    "+91- 9797999012", "Enjoy", "Book", "Seek", "Ping", "Plan",
}

def remove_text(page: pymupdf.Page, index: int) -> None:
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                value = span["text"].strip()
                redact = (
                    (index == 0 and value.startswith("Dear Asna"))
                    or (index == 2 and value in summary_values)
                    or (index == 3 and value not in daywise_fixed)
                    or (index == 5 and value != "Package Type" and not value.startswith(("Please note that these rates", "to change and may increase")))
                    or (index == 6 and value not in {"Hotel  Type", "9"})
                )
                if redact:
                    page.add_redact_annot(pymupdf.Rect(span["bbox"]) + (-1, -1, 1, 1), fill=False)
    page.apply_redactions(images=0, graphics=0, text=0)

document = pymupdf.open(source)
if len(document) != 12 or tuple(document[0].rect)[2:] != (540.0, 780.0):
    raise SystemExit("Expected the supplied 12-page, 540×780pt Asna itinerary PDF")

for index, filename in page_names.items():
    page = document[index]
    if index in {0, 2, 3, 5, 6}:
        remove_text(page, index)
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(300 / 72, 300 / 72), alpha=False)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    destination = output / filename
    with tempfile.NamedTemporaryFile(dir=output, suffix=".tmp", delete=False) as temporary:
        temp = Path(temporary.name)
    try:
        if filename.endswith(".png"):
            image.save(temp, format="PNG", optimize=True, dpi=(300, 300))
        else:
            image.save(temp, format="JPEG", quality=97, subsampling=0, optimize=True, dpi=(300, 300))
        for attempt in range(5):
            try:
                os.replace(temp, destination)
                break
            except OSError:
                if attempt == 4:
                    raise
                time.sleep(0.5)
    finally:
        temp.unlink(missing_ok=True)
    print(f"{filename}: {pixmap.width}×{pixmap.height}")
