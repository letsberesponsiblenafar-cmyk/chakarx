"""Clip unused rows of the original Asna hotel table without raster patches.

This helper edits PDF operators only. Call it before a PDF tool rewrites the
content stream; the original paper is already drawn beneath the table groups.
"""
from pypdf.generic import ContentStream, FloatObject, NameObject


TABLE_BOUNDS = (135.789703, 781.3382, 1921.8751, 2221.875)
TABLE_TOP = 781.3382
TABLE_SCALE = 3.125
# Grid lines in the source table's own downward-y coordinate system.
ROW_BOTTOMS = (78.403374, 209.91431, 386.26849, 548.43237, 710.59625)


def clip_hotel_rows(page, reader, count):
    """Keep the table header and ``count`` rows; preserve the page underneath.

    The source's page transform maps 2250 x 3250 units onto 540 x 780 pt.
    Gradient fills and the grid each have an independently saved graphics
    group with the same table bounds. Clip both, leaving other page artwork,
    including the heading, icons, original texture and footer, untouched.
    """
    if not isinstance(count, int) or not 0 <= count <= 4:
        raise ValueError("Hotel row count must be an integer between 0 and 4")
    if count == 4:
        return page

    content = ContentStream(page.get_contents(), reader)
    operations = content.operations
    starts = []
    stack = []
    for index, (operands, operator) in enumerate(operations):
        if operator == b"q":
            stack.append(index)
        elif operator == b"Q":
            if not stack:
                raise ValueError("Unbalanced source PDF graphics stack")
            stack.pop()
        elif operator == b"re" and len(operands) == 4:
            matching = all(abs(float(value) - expected) < 0.02
                           for value, expected in zip(operands, TABLE_BOUNDS))
            if matching:
                if not stack:
                    raise ValueError("Hotel table rectangle has no graphics group")
                starts.append(stack[-1])
    if stack:
        raise ValueError("Unbalanced source PDF graphics stack")
    if len(starts) != 2 or len(set(starts)) != 2:
        raise ValueError(f"Expected two native hotel table groups, found {len(starts)}")

    # Half a source pixel keeps the horizontal border stroke at the cutoff.
    bottom = TABLE_TOP + TABLE_SCALE * ROW_BOTTOMS[count] + 0.5
    clip = [
        ([FloatObject(0), FloatObject(0), FloatObject(2250), FloatObject(bottom)], b"re"),
        ([], b"W"),
        ([], b"n"),
    ]
    output = []
    starts = set(starts)
    for index, operation in enumerate(operations):
        output.append(operation)
        if index in starts:
            output.extend(clip)
    content.operations = output
    page[NameObject("/Contents")] = content
    return page
