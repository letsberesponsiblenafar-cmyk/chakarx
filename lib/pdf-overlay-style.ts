import type { jsPDF, TextOptionsLight } from 'jspdf';
import type { PdfDesignSettings } from '@/lib/pdf-designs';
import { pdfPageId } from '@/lib/pdf-design-pages';
import { mapPdfDesignRgb } from '@/lib/pdf-master-style';
import type { PdfArtworkPage } from '@/lib/pdf-composition';

/** Style text at draw-time. Planning/wrapping still uses the original metrics;
 * replacement fonts fit each original line rather than changing table/route layout. */
export function installPdfOverlayStyle(doc: jsPDF, design: PdfDesignSettings, pages: () => PdfArtworkPage[]) {
  const pageStyle = () => design.pages?.[pdfPageId(pages()[doc.getCurrentPageInfo().pageNumber - 1]?.key || 'cover')] || {};
  const methods = doc as unknown as Record<'setTextColor' | 'setFillColor' | 'setDrawColor', (...channels: (string | number)[]) => jsPDF>;
  for (const method of ['setTextColor', 'setFillColor', 'setDrawColor'] as const) {
    const original = methods[method].bind(doc);
    methods[method] = (...args) => {
      if (args.length !== 3 || !args.every(value => typeof value === 'number')) return original(...args);
      const style = pageStyle();
      return original(...mapPdfDesignRgb(args as [number, number, number], { colors: { accent: style.accent || design.colors.accent, dark: style.dark || design.colors.dark } }));
    };
  }
  const text = doc.text.bind(doc);
  doc.text = ((value: string | string[], x: number, y: number, options: TextOptionsLight = {}) => {
    const style = pageStyle(), oldFont = doc.getFont(), oldSize = doc.getFontSize(), oldColor = doc.getTextColor();
    const choice = style.bodyFont, scale = style.bodyScale ?? 1;
    const light = /^#[a-f\d]{6}$/i.test(oldColor) && [1, 3, 5].every(i => parseInt(oldColor.slice(i, i + 2), 16) > 220);
    const color = y > 738 && style.footerColor ? style.footerColor : light ? style.lightTextColor : style.bodyColor;
    if ((!choice || choice === 'original') && scale === 1 && !color) return text(value, x, y, options);
    try {
      if (color) doc.setTextColor(color);
      if ((!choice || choice === 'original') && scale === 1) return text(value, x, y, options);
      const lines = Array.isArray(value) ? value : [value], widths = lines.map(line => doc.getTextWidth(line));
      const font = choice === 'serif' ? 'times' : choice === 'redhat' ? 'redhat' : choice === 'evolventa' ? 'evolventa' : oldFont.fontName;
      doc.setFont(font, oldFont.fontStyle === 'bold' ? 'bold' : 'normal'); doc.setFontSize(oldSize * scale);
      const step = oldSize * (options.lineHeightFactor || doc.getLineHeightFactor());
      lines.forEach((line, index) => {
        const width = doc.getTextWidth(line), horizontalScale = width ? widths[index] / width : 1;
        const left = options.align === 'center' ? x - widths[index] / 2 : options.align === 'right' ? x - widths[index] : x;
        text(line, left, y + index * step, { ...options, align: 'left', horizontalScale });
      });
      return doc;
    } finally { doc.setFont(oldFont.fontName, oldFont.fontStyle); doc.setFontSize(oldSize); doc.setTextColor(oldColor); }
  }) as typeof doc.text;
}
