import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { fmt } from './nutrition';

// Icônes -----------------------------------------------------------------
const S = (d: ReactNode, size = 24) => (p: { size?: number }) => (
  <svg width={p.size ?? size} height={p.size ?? size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
export const I = {
  search: S(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  plus: S(<path d="M12 5v14M5 12h14" />),
  close: S(<path d="M6 6l12 12M18 6 6 18" />),
  back: S(<path d="m15 18-6-6 6-6" />),
  left: S(<path d="m15 18-6-6 6-6" />),
  right: S(<path d="m9 18 6-6-6-6" />),
  down: S(<path d="m6 9 6 6 6-6" />),
  up: S(<path d="m6 15 6-6 6 6" />),
  barcode: S(<><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 8v8M10 8v8M13 8v8M16 8v8" /></>),
  star: S(<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />),
  trash: S(<><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>),
  chart: S(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  book: S(<><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M9 9h6M9 13h6" /></>),
  apple: S(<><path d="M12 7c-2-2-7-1.5-7 4 0 4 3 9 5 9 1 0 1.3-.5 2-.5s1 .5 2 .5c2 0 5-5 5-9 0-5.5-5-6-7-4z" /><path d="M12 7c0-2 1-3.5 3-4" /></>),
  dots: S(<><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>),
  edit: S(<><path d="M4 20h4L19 9l-4-4L4 16z" /></>),
  fork: S(<><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1.5-3 4-3 7h3v11" /></>),
  check: S(<path d="m5 12 5 5 9-10" />),
};

// Navigation par feuilles empilées --------------------------------------
type Nav = { push: (n: ReactNode) => void; pop: () => void; popAll: () => void };
const NavCtx = createContext<Nav>({ push: () => { }, pop: () => { }, popAll: () => { } });
export const useNav = () => useContext(NavCtx);

export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<{ k: number; n: ReactNode }[]>([]);
  const push = useCallback((n: ReactNode) => setStack(s => [...s, { k: Date.now() + Math.random(), n }]), []);
  const pop = useCallback(() => setStack(s => s.slice(0, -1)), []);
  const popAll = useCallback(() => setStack([]), []);
  return (
    <NavCtx.Provider value={{ push, pop, popAll }}>
      {children}
      {stack.map((s, i) => <div key={s.k} className="layer" style={{ zIndex: 100 + i }}>{s.n}</div>)}
    </NavCtx.Provider>
  );
}

export function Sheet({ title, onClose, right, children, closeIcon = 'back' }: {
  title: ReactNode; onClose?: () => void; right?: ReactNode; children: ReactNode; closeIcon?: 'back' | 'close';
}) {
  const nav = useNav();
  const close = onClose ?? nav.pop;
  return (
    <div className="sheet">
      <header className="sheet-head">
        <button className="icon-btn" onClick={close} aria-label="Fermer">{closeIcon === 'back' ? <I.back /> : <I.close />}</button>
        <h2>{title}</h2>
        <div className="sheet-right">{right}</div>
      </header>
      <div className="sheet-body">{children}</div>
    </div>
  );
}

export const COLORS = { kcal: '#FACC15', prot: '#4ADE80', carbs: '#38BDF8', fat: '#C084FC' };

export function MacroBar({ label, value, goal, unit, color }: { label: string; value: number; goal: number; unit: string; color: string }) {
  const pct = goal > 0 ? (value / goal) * 100 : 0;
  return (
    <div className="mbar">
      <div className="mbar-top">
        <span><b>{label}</b> <span className="muted">- {fmt(value)} / {fmt(goal)} {unit}</span></span>
        <span className={pct > 105 ? 'over' : ''}>{fmt(pct, 0)}%</span>
      </div>
      <div className="mbar-track"><div className="mbar-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} /></div>
    </div>
  );
}

export function Toast({ text }: { text: string }) { return <div className="toast">{text}</div>; }

let toastTimer: number | undefined;
export function toast(text: string) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = text; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el!.classList.remove('show'), 1800);
}
