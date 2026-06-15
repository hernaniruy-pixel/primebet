'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface ComboOption { value: string; label: string }

/**
 * Select com busca (espelha o "combo" do sistema de referência): botão mostra
 * o item selecionado; ao abrir, exibe um campo de busca + lista filtrada.
 */
export default function ComboBox({
  options, value, onChange, placeholder = '— Selecione —', minWidth,
}: {
  options: ComboOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }, [options, q]);

  return (
    <div className="combo" ref={ref} style={minWidth ? { minWidth } : undefined}>
      <button type="button" className="combo-btn" onClick={() => { setOpen((v) => !v); setQ(''); }}>
        <span className={selected ? '' : 'combo-ph'}>{selected ? selected.label : placeholder}</span>
        <span className="combo-arrow">▾</span>
      </button>
      {open && (
        <div className="combo-pop">
          <input
            className="combo-search" autoFocus value={q}
            onChange={(e) => setQ(e.target.value)} placeholder="Buscar..."
          />
          <div className="combo-list">
            {filtered.map((o) => (
              <div
                key={o.value}
                className={`combo-item${o.value === value ? ' sel' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                {o.label}
              </div>
            ))}
            {filtered.length === 0 && <div className="combo-empty">Nada encontrado</div>}
          </div>
        </div>
      )}
    </div>
  );
}
