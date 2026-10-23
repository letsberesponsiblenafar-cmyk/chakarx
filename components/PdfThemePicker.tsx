'use client';

import { Check } from 'lucide-react';
import { pdfThemes, resolvePdfTheme, type PdfThemeId } from '@/lib/pdf-themes';
import './pdf-themes.css';

export default function PdfThemePicker({ value, onChange, name = 'pdf-theme' }: {
  value?: string; onChange: (theme: PdfThemeId) => void; name?: string;
}) {
  const selected = resolvePdfTheme(value);
  return <div className="pdf-theme-options" role="radiogroup" aria-label="PDF theme">
    {pdfThemes.map(theme => <label key={theme.id} className={`pdf-theme-option${theme.id === selected.id ? ' is-selected' : ''}`}>
      <input type="radio" name={name} value={theme.id} checked={selected.id === theme.id} onChange={() => onChange(theme.id)}/>
      <span className={`pdf-theme-preview pdf-theme-preview-${theme.id}`}><img src={theme.preview} alt="" loading="lazy"/></span>
      <span className="pdf-theme-details"><span className="pdf-theme-name">{theme.name}<span className="pdf-theme-check" aria-hidden="true">{theme.id === selected.id && <Check size={13}/>}</span></span><span className="pdf-theme-description">{theme.description}</span></span>
    </label>)}
  </div>;
}
