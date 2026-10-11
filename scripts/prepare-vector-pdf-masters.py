"""Prepare native PDF backgrounds without flattening their fonts or artwork.

Usage: python scripts/prepare-vector-pdf-masters.py original-asna-itinerary.pdf

Requires pypdf and PyMuPDF. The latter may be installed in out/pdf-tools for
authoring only; it is not a website or Vercel dependency. This script removes
sample client fields and the obsolete logo at the native PDF layer. It does
not resize, reconstruct, repaint or JPEG-compress source photographic images.
"""

from copy import copy
from io import BytesIO
from pathlib import Path
import importlib.util
import json
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "out" / "pdf-tools"))
try:
    import pymupdf
except ImportError:
    raise SystemExit("Install authoring tools: python -m pip install --target out/pdf-tools PyMuPDF")
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream, NameObject


def local_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lists = local_module("native_lists", "prepare-client-list-artwork.py")
hotels = local_module("native_hotels", "native-hotel-artwork.py")

PAGE_KINDS = (
    ("cover", 0, None), ("letter", 1, None), ("summary", 2, None),
    ("daywise", 3, None), ("package", 5, None), ("hotels4", 6, 4),
    ("inclusions", 7, None), ("exclusions", 8, None),
    ("policies", 9, None), ("testimonials", 10, None), ("thanks", 11, None),
    ("hotels0", 6, 0), ("hotels1", 6, 1), ("hotels2", 6, 2), ("hotels3", 6, 3),
)
SUMMARY_FIXED = {"Tour summary", "Duration of Tour", "Tour Starting date", "Tour End date", "Pickup Point"}
DAYWISE_FIXED = {
    "Day Wise Itinerary", "Do you Know?", "Know more!", "Consult Expert Free Now!",
    "Srinagar's Floating Market:", "India's only kind watery", "bazaar, Asia's top three!",
    "+91- 9797999012", "Enjoy", "Book", "Seek", "Ping", "Plan",
}


def remove_old_logo(container, reader, visited=None):
    """Drop only obsolete original 353 x 155 logo images and their Do calls."""
    if visited is None:
        visited = set()
    resources = container.get("/Resources", {})
    objects = resources.get("/XObject", {})
    removed = set()
    for name, reference in list(objects.items()):
        obj = reference.get_object()
        if obj.get("/Subtype") == "/Image" and obj.get("/Width") == 353 and obj.get("/Height") == 155:
            removed.add(str(name))
            del objects[name]
        elif obj.get("/Subtype") == "/Form" and id(obj) not in visited:
            visited.add(id(obj))
            remove_old_logo(obj, reader, visited)
    if not removed:
        return
    stream = ContentStream(container.get_contents() if hasattr(container, "get_contents") else container, reader)
    stream.operations = [(args, op) for args, op in stream.operations if not (op == b"Do" and str(args[0]) in removed)]
    if hasattr(container, "get_contents"):
        container[NameObject("/Contents")] = stream
    else:
        container.set_data(stream.get_data())


def keep_text(kind, span):
    value = " ".join(span["text"].split())
    if not value:
        return True
    if span["bbox"][1] > 745 and value.isdigit():
        return False
    if kind == "cover":
        return not value.lower().startswith("dear asna")
    if kind == "summary":
        return value in SUMMARY_FIXED
    if kind == "daywise":
        return value in DAYWISE_FIXED
    if kind == "package":
        return value == "Package Type"
    if kind.startswith("hotels"):
        return value == "Hotel Type"
    return True


def clean_mutable_text(page, kind):
    count = 0
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                if not keep_text(kind, span):
                    page.add_redact_annot(pymupdf.Rect(span["bbox"]) + (-0.2, -0.2, 0.2, 0.2), fill=False)
                    count += 1
    if count:
        # Text only: keep every source photograph, vector line, gradient,
        # original paper texture and decorative mark underneath the text.
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                              graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                              text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    return count


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__.splitlines()[2])
    source = Path(sys.argv[1])
    reader = PdfReader(source)
    if len(reader.pages) != 12:
        raise ValueError("Expected the supplied 12-page Asna itinerary")
    if any(round(float(page.mediabox.width)) != 540 or round(float(page.mediabox.height)) != 780 for page in reader.pages):
        raise ValueError("Expected 540 x 780 pt reference pages")
    # List-specific sample body vector paths are removed in the original PDF
    # before shared logo resources are pruned or general text is processed.
    for index in (7, 8):
        lists.clean_page(reader.pages[index], reader, index)
    for page in reader.pages:
        remove_old_logo(page, reader)

    intermediate = PdfWriter()
    for kind, index, row_count in PAGE_KINDS:
        page = copy(reader.pages[index])
        if row_count is not None:
            hotels.clip_hotel_rows(page, reader, row_count)
        intermediate.add_page(page)
    buffer = BytesIO()
    intermediate.write(buffer)
    cleaned = pymupdf.open(stream=buffer.getvalue(), filetype="pdf")
    for index, (kind, _, _) in enumerate(PAGE_KINDS):
        removed = clean_mutable_text(cleaned[index], kind)
        print(f"{kind}: page {index}, {removed} mutable text spans removed")
    # Finish all source edits before building a cached cross-document graft
    # map; redactions can allocate new font/graphics objects in the source.
    cleaned = pymupdf.open(stream=cleaned.tobytes(garbage=4, deflate=True), filetype="pdf")
    output = pymupdf.open()
    manifest = {}
    for index, (kind, _, _) in enumerate(PAGE_KINDS):
        page = output.new_page(width=540, height=780)
        # Native page import handles the source's non-zero media-box origin
        # and retains PDF text, embedded fonts, paths, patterns and images.
        page.show_pdf_page(page.rect, cleaned, index, keep_proportion=False)
        manifest[kind] = index
    manifest["hotels"] = manifest["hotels4"]
    target = ROOT / "public" / "pdf-assets"
    destination = target / "client-master.pdf"
    output.save(destination, garbage=4, deflate=True, clean=True, use_objstms=1)
    (target / "client-master.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Native master: {destination.stat().st_size:,} bytes, {len(output)} pages")
    output.close()
    cleaned.close()


if __name__ == "__main__":
    main()
