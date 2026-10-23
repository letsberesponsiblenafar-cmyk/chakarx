'use client';

import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PdfThemePicker from '@/components/PdfThemePicker';
import { usePlanner } from '@/components/PlannerProvider';
import { resolvePdfTheme } from '@/lib/pdf-themes';

export default function PdfDesignsPage() {
  const { input, setInputField, hydrated } = usePlanner();
  const selected = resolvePdfTheme(input.pdfTheme);
  return <AppShell><main className="page pdf-designs-page">
    <header className="pdf-designs-heading"><h1>PDF designs</h1><Link href="/">Build your trip</Link></header>
    {hydrated ? <><PdfThemePicker value={selected.id} onChange={theme => setInputField('pdfTheme', theme)} name="catalog-pdf-theme"/>
    <div className="pdf-designs-selection"><span role="status">{selected.name} selected for this trip</span><Link href="/">Continue building</Link></div></> : <p role="status">Loading your selected design…</p>}
  </main></AppShell>;
}
