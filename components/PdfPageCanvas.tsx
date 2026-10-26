'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import styles from './pdf-page-canvas.module.css';

export type PdfCanvasRegion = {
  id: string;
  label: string;
  /** Top-left coordinates in PDF points. */
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  url: string;
  pageNumber: number;
  title: string;
  regions?: PdfCanvasRegion[];
  selectedRegion?: string | null;
  onSelectRegion?: (region: PdfCanvasRegion) => void;
};

/** The generated PDF itself, with accessible editing targets layered above it. */
export default function PdfPageCanvas({ url, pageNumber, title, regions = [], selectedRegion, onSelectRegion }: Props) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const render = useRef<RenderTask | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [size, setSize] = useState({ width: 540, height: 780 });
  const [availableWidth, setAvailableWidth] = useState(540);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ready, setReady] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setAvailableWidth(Math.round(width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let task: ReturnType<typeof import('pdfjs-dist').getDocument> | undefined;
    setDocument(null); setError(''); setLoading(true); setReady('');
    async function open() {
      try {
        // PDF.js touches browser APIs at module evaluation; keep it out of SSR.
        const pdfjs = await import('pdfjs-dist');
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        task = pdfjs.getDocument({ url, isEvalSupported: false });
        const next = await task.promise;
        if (disposed) return;
        setDocument(next);
      } catch (cause) {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : 'The PDF page could not be displayed.');
          setLoading(false);
        }
      }
    }
    void open();
    return () => { disposed = true; render.current?.cancel(); void task?.destroy(); };
  }, [url, retry]);

  useEffect(() => {
    if (!document) return;
    let disposed = false;
    const key = `${url}:${pageNumber}`;
    setLoading(true); setError(''); setReady('');
    render.current?.cancel();
    async function draw() {
      try {
        const page = await document!.getPage(Math.min(Math.max(1, pageNumber), document!.numPages));
        if (disposed) return;
        const natural = page.getViewport({ scale: 1 });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: Math.max(1, availableWidth / natural.width) * pixelRatio });
        // Render offscreen, so cancellation never leaves a half-drawn page visible.
        const buffer = window.document.createElement('canvas');
        buffer.width = Math.ceil(viewport.width); buffer.height = Math.ceil(viewport.height);
        const context = buffer.getContext('2d', { alpha: false });
        if (!context) throw new Error('This browser cannot display the PDF canvas. Use Open PDF below.');
        const next = page.render({ canvas: buffer, canvasContext: context, viewport });
        render.current = next;
        await next.promise;
        if (disposed || !canvas.current) return;
        canvas.current.width = buffer.width; canvas.current.height = buffer.height;
        canvas.current.getContext('2d', { alpha: false })?.drawImage(buffer, 0, 0);
        setSize({ width: natural.width, height: natural.height });
        setReady(key); setLoading(false);
      } catch (cause) {
        if (disposed || (cause instanceof Error && cause.name === 'RenderingCancelledException')) return;
        setError(cause instanceof Error ? cause.message : 'The PDF page could not be displayed.');
        setLoading(false);
      }
    }
    void draw();
    return () => { disposed = true; render.current?.cancel(); };
  }, [document, url, pageNumber, availableWidth]);

  const interactive = ready === `${url}:${pageNumber}` && !loading && !error;
  return <div className={styles.viewer}>
    <div className={styles.paper} ref={stage} style={{ aspectRatio: `${size.width}/${size.height}` }} aria-busy={loading}>
      <canvas ref={canvas} className={styles.canvas} role="img" aria-label={`${title}, PDF page ${pageNumber}`}/>
      {interactive && onSelectRegion && regions.map(region => <button key={region.id} type="button"
        className={`${styles.region} ${selectedRegion === region.id ? styles.selected : ''}`}
        style={{ left: `${region.x / size.width * 100}%`, top: `${region.y / size.height * 100}%`, width: `${region.width / size.width * 100}%`, height: `${region.height / size.height * 100}%` }}
        aria-label={`Edit ${region.label}`} aria-pressed={selectedRegion === region.id} onClick={() => onSelectRegion(region)}>
        <span>{region.label}</span>
      </button>)}
      {loading && <div className={styles.loading} role="status"><Loader2 size={20} className={styles.spin}/><span>Rendering page {pageNumber}…</span></div>}
      {error && <div className={styles.error} role="alert"><strong>Preview unavailable</strong><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={15}/>Try again</button></div>}
    </div>
    {!loading && !error && <p className={styles.hint}>Select a highlighted area to edit it.</p>}
  </div>;
}
