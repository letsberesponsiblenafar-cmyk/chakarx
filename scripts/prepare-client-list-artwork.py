"""Render seamless 300 DPI client-list backgrounds from the original Asna PDF.

Usage: python scripts/prepare-client-list-artwork.py original-asna-itinerary.pdf

The landscape, its original crop, shading, texture, heading and footer remain
in one PDF page. Mutable sample text and the obsolete low-resolution logo are
removed from PDF content streams before rendering, rather than patched over
or assembled from separately scaled bitmap strips.

Requires the bundled pypdf, pypdfium2 and Pillow dependencies. Only the two
client-list assets are written. Original input and other artwork stay intact.
"""

from io import BytesIO
from pathlib import Path
import sys

from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import ContentStream, NameObject, RectangleObject
import pypdfium2


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public" / "pdf-assets"
DPI = 300
PAGES = ((7, "inclusions"), (8, "exclusions"))


def clean_page(page, reader, index):
    resources = page["/Resources"]
    # The reference defines the italic title, footer page number and terms as
    # F9, F10 and F11. Keep the title and terms; the old sample page number is
    # removed because generated documents may have more itinerary pages.
    if not all(font in resources["/Font"] for font in ("/F9", "/F10", "/F11")):
        raise ValueError("Unexpected reference font structure")
    objects = resources["/XObject"]
    if objects["/X6"].get_object().get("/Subtype") != "/Form":
        raise ValueError("Expected the original full-page landscape Form")
    if objects["/X12"].get_object().get("/Subtype") != "/Image":
        raise ValueError("Expected the separately placed sample logo image")

    original = ContentStream(page.get_contents(), reader)
    result = []
    text_block = None
    matrix = (1, 0, 0, 1, 0, 0)
    stack = []
    path_points = []

    def transformed(x, y):
        a, b, c, d, e, f = matrix
        return a * float(x) + c * float(y) + e, b * float(x) + d * float(y) + f

    for operands, operator in original.operations:
        if operator == b"q":
            stack.append(matrix)
        elif operator == b"Q":
            matrix = stack.pop()
        elif operator == b"cm":
            a, b, c, d, e, f = matrix
            na, nb, nc, nd, ne, nf = map(float, operands)
            matrix = (a * na + c * nb, b * na + d * nb,
                      a * nc + c * nd, b * nc + d * nd,
                      a * ne + c * nf + e, b * ne + d * nf + f)
        elif operator in (b"m", b"l", b"c", b"v", b"y"):
            path_points.extend(transformed(operands[i], operands[i + 1]) for i in range(0, len(operands), 2))
        elif operator == b"re":
            x, y, width, height = map(float, operands)
            path_points.extend(transformed(px, py) for px, py in
                               ((x, y), (x + width, y), (x, y + height), (x + width, y + height)))
        elif operator in (b"S", b"s", b"f", b"F", b"f*", b"B", b"B*", b"b", b"b*", b"n"):
            # Exclusion bullets and a sample paper-shaped decoration are
            # separate vector paths in the body area. The photo itself stays
            # inside X6. Retain the title icon and gold accent above the body.
            body_path = bool(path_points) and min(y for _, y in path_points) > 50 and max(y for _, y in path_points) < 650
            path_points = []
            if operator != b"n" and body_path:
                result.append(([], b"n"))
                continue
        if operator == b"BT":
            if text_block is not None:
                raise ValueError("Unexpected nested PDF text block")
            text_block = [(operands, operator)]
        elif text_block is not None:
            text_block.append((operands, operator))
            if operator == b"ET":
                fonts = {str(args[0]) for args, op in text_block if op == b"Tf"}
                if fonts and fonts <= {"/F9", "/F11"}:
                    result.extend(text_block)
                text_block = None
        elif operator == b"Do" and (
            str(operands[0]) == "/X12"
            or (index == 7 and str(operands[0]) == "/X8")
        ):
            # X8 is the inclusion list's text-and-bullets Form. Exclusions use
            # ordinary text objects. X12 is the old logo on both pages.
            continue
        else:
            result.append((operands, operator))
    if text_block is not None:
        raise ValueError("Unterminated PDF text block")
    original.operations = result
    page[NameObject("/Contents")] = original
    # Remove inaccessible sample strings retained in tagged-PDF metadata.
    if "/Annots" in page:
        del page["/Annots"]
    return page


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__.splitlines()[2])
    source = Path(sys.argv[1])
    reader = PdfReader(source)
    if len(reader.pages) != 12:
        raise ValueError("Expected the supplied 12-page Asna itinerary")
    for index, key in PAGES:
        page = reader.pages[index]
        if round(float(page.mediabox.width)) != 540 or round(float(page.mediabox.height)) != 780:
            raise ValueError("Expected 540 x 780 pt reference pages")
        if f"List of {key.title()}" not in page.extract_text():
            raise ValueError(f"Expected the reference {key} heading")
        cleaned = clean_page(page, reader, index)
        # The reference's media box begins at y=7.9200063, and its rounded top
        # differs by a few millionths of a point. Normalize the PDF coordinate
        # box before rendering so ceil-based rasterizers don't add a pixel.
        cleaned.add_transformation(Transformation().translate(0, -float(cleaned.mediabox.bottom)))
        cleaned.mediabox = RectangleObject((0, 0, 540, 780))
        cleaned.cropbox = RectangleObject((0, 0, 540, 780))
        writer = PdfWriter()
        writer.add_page(cleaned)
        memory_pdf = BytesIO()
        writer.write(memory_pdf)
        rendered = pypdfium2.PdfDocument(memory_pdf.getvalue())
        # Subtract less than one millionth of a pixel from the scale to avoid
        # binary 300/72 rounding up the 3250px page height to 3251px.
        bitmap = rendered[0].render(scale=DPI / 72 - 1e-9)
        image = bitmap.to_pil().convert("RGB")
        if image.size != (2250, 3250):
            raise ValueError(f"Unexpected rendered size: {image.size}")
        destination = OUTPUT / f"client-{key}.jpg"
        image.save(destination, format="JPEG", quality=98, subsampling=0,
                   optimize=True, dpi=(DPI, DPI))
        print(f"{destination.name}: {image.width} x {image.height}, {DPI} DPI")
        bitmap.close()
        rendered.close()


if __name__ == "__main__":
    main()
