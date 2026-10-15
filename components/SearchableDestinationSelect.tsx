'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import './searchable-destination-select.css';

type Option = { value: string; label: string };
type Props = {
  id: string;
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

const searchText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();

export default function SearchableDestinationSelect({ id, label, value, options, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeValue, setActiveValue] = useState(value);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; height: number }>({ top: 0, left: 0, width: 0, height: 320 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const filtered = options.filter((option) => searchText(option.label).includes(searchText(query)));
  const activeIndex = Math.max(0, filtered.findIndex((option) => option.value === activeValue));
  const active = filtered[activeIndex];
  const selected = options.find((option) => option.value === value);

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  function positionPanel() {
    if (!trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
    const viewportRight = viewportLeft + (viewport?.width || window.innerWidth);
    const below = viewportBottom - rect.bottom - 12;
    const above = rect.top - viewportTop - 12;
    const up = below < 260 && above > below;
    const height = Math.min(340, Math.max(120, up ? above : below));
    const width = Math.min(rect.width, viewportRight - viewportLeft - 24);
    setPosition({ ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }), left: Math.max(viewportLeft + 12, Math.min(rect.left, viewportRight - width - 12)), width, height });
  }

  function show() {
    if (disabled) return;
    positionPanel();
    setQuery('');
    setActiveValue(value);
    setOpen(true);
  }

  function choose(option: Option) {
    if (option.value !== value) onChange(option.value);
    close(true);
  }

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    }
    function scroll(event: Event) {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      positionPanel();
    }
    function resize() { positionPanel(); }
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', resize);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open || !list.current) return;
    const option = list.current.querySelector<HTMLElement>('[data-active="true"]');
    if (!option) return;
    const top = option.offsetTop;
    if (top < list.current.scrollTop) list.current.scrollTop = top;
    else if (top + option.offsetHeight > list.current.scrollTop + list.current.clientHeight) list.current.scrollTop = top + option.offsetHeight - list.current.clientHeight;
  }, [open, query, activeValue]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!filtered.length) return;
      const next = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
      setActiveValue(filtered[next].value);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (active) choose(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      close(true);
    }
  }

  return <>
    <button ref={trigger} id={id} type="button" className="destination-select-trigger" disabled={disabled}
      aria-label={`${label}: ${selected?.label || value}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined}
      onClick={() => open ? close() : show()} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); }
      }}>
      <span>{selected?.label || value || 'Choose destination'}</span><ChevronDown size={16} aria-hidden="true"/>
    </button>
    {open && createPortal(<div ref={panel} id={`${id}-panel`} role="dialog" aria-label={label} className="destination-select-panel"
      style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width, maxHeight: position.height }}>
      <div className="destination-select-search"><Search size={16} aria-hidden="true"/><input ref={input} role="combobox" aria-label={`Search ${label.toLowerCase()}`} aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={active ? `${id}-option-${activeIndex}` : undefined}
        value={query} placeholder="Search destinations…" autoComplete="off" onChange={(event) => { setQuery(event.target.value); setActiveValue(''); }} onKeyDown={onKeyDown}/></div>
      <div ref={list} id={`${id}-list`} role="listbox" aria-label={label} className="destination-select-options">
        {filtered.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={value === option.value} data-active={active?.value === option.value} className="destination-select-option"
          onPointerMove={() => setActiveValue(option.value)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
          <span>{option.label}</span>{value === option.value && <Check size={15} aria-hidden="true"/>}
        </div>)}
        {!filtered.length && <p className="destination-select-empty" role="status">No destinations found. Try another name.</p>}
      </div>
    </div>, document.body)}
  </>;
}
