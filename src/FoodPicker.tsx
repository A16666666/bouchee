import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, toggleFav } from './db';
import {
  defaultServing, fmt, parseNum, scale, SECTIONS, servingLabel, sumServings, unitsFor,
  type Item, type Meal, type SectionId, type Serving,
} from './nutrition';
import { customResults, favResults, localSearch, recentResults, TAG, type Result } from './items';
import { searchOff, lookupBarcode } from './off';
import { Scanner } from './Scanner';
import { COLORS, I, Sheet, toast, useNav } from './ui';
import { CustomFoodEditor } from './Editors';

// ---------------------------------------------------------------------------
// Formulaire de quantité (ajout ou modification)
export function QuantityForm({ item, init, section, onSection, confirmLabel, onConfirm, extra }: {
  item: Item; init?: { qty: number; unit: string; unitGrams: number };
  section?: SectionId; onSection?: (s: SectionId) => void;
  confirmLabel: string; onConfirm: (s: Serving) => void; extra?: ReactNode;
}) {
  const start = init ?? defaultServing(item);
  const units = useMemo(() => {
    const u = unitsFor(item);
    return u.some(p => p.label === start.unit) ? u : [{ label: start.unit, grams: start.unitGrams }, ...u];
  }, [item, start.unit, start.unitGrams]);
  const [qty, setQty] = useState(fmt(start.qty, 2));
  const [unit, setUnit] = useState(start.unit);
  const u = units.find(p => p.label === unit) ?? units[0];
  const grams = parseNum(qty) * u.grams;
  const n = scale(item.per100, grams);
  const fav = useLiveQuery(() => db.favs.get(item.id), [item.id]);

  function changeUnit(label: string) {
    const nu = units.find(p => p.label === label)!;
    if (['g', 'ml', 'cl', 'l', 'kg'].includes(label)) setQty(fmt(grams / nu.grams, 1).replace(/\s/g, ''));
    else if (label === '100 g') setQty(fmt(grams / 100, 2));
    else setQty('1');
    setUnit(label);
  }
  const kcalP = n.prot * 4, kcalC = n.carbs * 4, kcalF = n.fat * 9, kt = kcalP + kcalC + kcalF || 1;

  return (
    <div className="qform">
      <div className="qhead">
        <div>
          <h3>{item.name}</h3>
          <div className="muted small">{[item.brand, TAG[item.kind]].filter(Boolean).join(' · ')}</div>
        </div>
        {item.kind !== 'import' && (
          <button className={'icon-btn ' + (fav ? 'fav-on' : '')} onClick={() => toggleFav(item.id)} aria-label="Favori"><I.star /></button>
        )}
      </div>

      <div className="row gap">
        <input className="qty" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} onFocus={e => e.target.select()} />
        <select value={unit} onChange={e => changeUnit(e.target.value)}>
          {units.map(p => <option key={p.label} value={p.label}>{p.label}{!['g', '100 g', 'kg', 'ml', 'cl', 'l'].includes(p.label) ? ` (${fmt(p.grams, 1)} g)` : ''}</option>)}
        </select>
      </div>
      {section && onSection && (
        <select className="mt" value={section} onChange={e => onSection(e.target.value as SectionId)}>
          {SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      )}

      <div className="card ncard">
        <div className="kcal-big"><span>{fmt(n.kcal, 0)}</span> kcal · {fmt(grams, 0)} g</div>
        <div className="split">
          <div style={{ width: `${(kcalP / kt) * 100}%`, background: COLORS.prot }} />
          <div style={{ width: `${(kcalC / kt) * 100}%`, background: COLORS.carbs }} />
          <div style={{ width: `${(kcalF / kt) * 100}%`, background: COLORS.fat }} />
        </div>
        <div className="macros3">
          <div><i style={{ background: COLORS.prot }} />Protéines<b>{fmt(n.prot)} g</b></div>
          <div><i style={{ background: COLORS.carbs }} />Glucides<b>{fmt(n.carbs)} g</b></div>
          <div><i style={{ background: COLORS.fat }} />Lipides<b>{fmt(n.fat)} g</b></div>
        </div>
        <div className="details">
          {([['Fibres', 'fiber', 'g'], ['dont sucres', 'sugars', 'g'], ['AG saturés', 'satFat', 'g'], ['Sel', 'salt', 'g']] as const).map(([l, k, un]) => (
            <div key={k}><span>{l}</span><span>{item.per100[k] == null ? '–' : `${fmt(n[k], 1)} ${un}`}</span></div>
          ))}
        </div>
      </div>

      <button className="btn primary block" disabled={!(grams > 0)} onClick={() => onConfirm({ item, qty: parseNum(qty), unit: u.label, unitGrams: u.grams })}>
        {confirmLabel}
      </button>
      {extra}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ajout d'un repas perso au journal
function MealLog({ meal, section, setSection, onDone }: { meal: Meal; section: SectionId; setSection: (s: SectionId) => void; onDone: (mult: number) => void }) {
  const [mult, setMult] = useState('1');
  const m = parseNum(mult);
  const tot = sumServings(meal.items);
  const fav = useLiveQuery(() => db.favs.get(meal.id), [meal.id]);
  return (
    <div className="qform">
      <div className="qhead">
        <div><h3>{meal.name}</h3><div className="muted small">Repas personnalisé · {meal.items.length} élément(s)</div></div>
        <button className={'icon-btn ' + (fav ? 'fav-on' : '')} onClick={() => toggleFav(meal.id)}><I.star /></button>
      </div>
      <div className="row gap">
        <input className="qty" inputMode="decimal" value={mult} onChange={e => setMult(e.target.value)} onFocus={e => e.target.select()} />
        <div className="unit-fixed">× repas</div>
      </div>
      <select className="mt" value={section} onChange={e => setSection(e.target.value as SectionId)}>
        {SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <div className="card ncard">
        <div className="kcal-big"><span>{fmt(tot.kcal * m, 0)}</span> kcal</div>
        <div className="macros3">
          <div><i style={{ background: COLORS.prot }} />Protéines<b>{fmt(tot.prot * m)} g</b></div>
          <div><i style={{ background: COLORS.carbs }} />Glucides<b>{fmt(tot.carbs * m)} g</b></div>
          <div><i style={{ background: COLORS.fat }} />Lipides<b>{fmt(tot.fat * m)} g</b></div>
        </div>
      </div>
      <ul className="list">
        {meal.items.map((s, i) => (
          <li key={i}><div><div>{s.item.name}</div><div className="muted small">{servingLabel({ ...s, qty: s.qty * m })}</div></div></li>
        ))}
      </ul>
      <button className="btn primary block" disabled={!(m > 0)} onClick={() => onDone(m)}>Ajouter au journal</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ligne de résultat
export function ResultRow({ r, onClick }: { r: Result; onClick: () => void }) {
  if (r.type === 'meal') {
    const t = sumServings(r.meal.items);
    return (
      <li onClick={onClick}>
        <div><div className="b">{r.meal.name}</div><div className="muted small">repas · {fmt(t.kcal, 0)} kcal</div></div>
        <span className="tag meal">Repas personnalisé</span>
      </li>
    );
  }
  const it = r.item;
  const s = r.last ?? { item: it, ...defaultServing(it) };
  const sub = r.last ? servingLabel(s) : (it.portions[0] ? `1 × ${it.portions[0].label}` : '100 g');
  const kcal = scale(it.per100, s.qty * s.unitGrams).kcal;
  return (
    <li onClick={onClick}>
      <div>
        <div className="b">{it.name}{it.brand ? <span className="muted"> · {it.brand}</span> : null}</div>
        <div className="muted small">{sub} · {fmt(kcal, 0)} kcal</div>
      </div>
      <span className={'tag ' + it.kind}>{it.kind === 'off' ? 'OFF' : TAG[it.kind]}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Sélecteur d'aliment : recherche, favoris, perso, scan.
export function FoodPicker({ mode, date, initialSection, excludeRecipe, startWithScan, onPick }: {
  mode: 'journal' | 'ingredient' | 'mealItem';
  date?: string; initialSection?: SectionId; excludeRecipe?: string; startWithScan?: boolean;
  onPick?: (s: Serving) => void;
}) {
  const nav = useNav();
  const withMeals = mode === 'journal';
  const [view, setView] = useState<'search' | 'scan' | 'qty' | 'meal'>(startWithScan ? 'scan' : 'search');
  const [tab, setTab] = useState<'all' | 'fav' | 'custom'>('all');
  const [q, setQ] = useState('');
  const [local, setLocal] = useState<Result[]>([]);
  const [off, setOff] = useState<Item[] | null>(null);
  const [offLoading, setOffLoading] = useState(false);
  const [offErr, setOffErr] = useState(false);
  const [sel, setSel] = useState<Result | null>(null);
  const [section, setSection] = useState<SectionId>(initialSection ?? 'nonclasse');
  const [scanMsg, setScanMsg] = useState('');
  const abort = useRef<AbortController | null>(null);

  // Listes sans recherche (recalculées si la base change)
  const counts = useLiveQuery(async () => [await db.entries.count(), await db.foods.count(), await db.recipes.count(), await db.meals.count(), await db.favs.count()].join());
  const [lists, setLists] = useState<Record<string, Result[]>>({});
  useEffect(() => {
    (async () => setLists({
      all: await recentResults(), fav: await favResults(withMeals), custom: await customResults(withMeals, excludeRecipe),
    }))();
  }, [counts, withMeals, excludeRecipe]);

  useEffect(() => {
    let alive = true;
    localSearch(q, { meals: withMeals, excludeRecipe }).then(r => alive && setLocal(r));
    setOff(null); setOffErr(false);
    abort.current?.abort();
    if (q.trim().length < 3) { setOffLoading(false); return; }
    setOffLoading(true);
    const ac = new AbortController(); abort.current = ac;
    const t = setTimeout(() => {
      searchOff(q.trim(), ac.signal).then(r => { if (alive) setOff(r); })
        .catch(e => { if (alive && e.name !== 'AbortError') setOffErr(true); })
        .finally(() => alive && setOffLoading(false));
    }, 600);
    return () => { alive = false; clearTimeout(t); };
  }, [q, withMeals, excludeRecipe]);

  function choose(r: Result) { setSel(r); setView(r.type === 'meal' ? 'meal' : 'qty'); }

  async function confirm(s: Serving) {
    if (s.item.kind === 'off') await db.foods.put(s.item); // garde en cache pour l'hors-ligne
    if (mode === 'journal') {
      await db.entries.add({ ...s, date: date!, section, ts: Date.now() });
      toast(`${s.item.name} ajouté`);
      nav.pop();
    } else { onPick?.(s); nav.pop(); }
  }

  async function onCode(code: string) {
    setScanMsg('Recherche…');
    const r = await lookupBarcode(code);
    if ('item' in r) { setScanMsg(''); choose({ type: 'item', item: r.item }); return; }
    if ('error' in r) { setScanMsg(r.error); setView('search'); toast(r.error); return; }
    setScanMsg('');
    setView('search');
    if (confirm_(`Produit ${code} introuvable dans Open Food Facts. Le créer comme aliment perso ?`)) {
      nav.push(<CustomFoodEditor barcode={code.replace(/\D/g, '')} onSaved={it => choose({ type: 'item', item: it })} />);
    }
  }

  const title = mode === 'journal' ? 'Ajouter au journal' : mode === 'ingredient' ? 'Ajouter un ingrédient' : 'Ajouter un élément';

  if (view === 'qty' && sel?.type === 'item') {
    return (
      <Sheet title="Quantité" onClose={() => setView('search')}>
        <QuantityForm item={sel.item} init={sel.last} section={mode === 'journal' ? section : undefined} onSection={setSection}
          confirmLabel={mode === 'journal' ? 'Ajouter au journal' : 'Ajouter'} onConfirm={confirm} />
      </Sheet>
    );
  }
  if (view === 'meal' && sel?.type === 'meal') {
    return (
      <Sheet title="Repas" onClose={() => setView('search')}>
        <MealLog meal={sel.meal} section={section} setSection={setSection} onDone={async mult => {
          await db.entries.bulkAdd(sel.meal.items.map(s => ({ ...s, qty: s.qty * mult, date: date!, section, ts: Date.now() })));
          toast(`${sel.meal.name} ajouté`); nav.pop();
        }} />
      </Sheet>
    );
  }
  if (view === 'scan') {
    return (
      <Sheet title="Scanner" onClose={() => (startWithScan ? nav.pop() : setView('search'))}>
        {scanMsg ? <p className="center muted pad">{scanMsg}</p> : <Scanner onCode={onCode} />}
      </Sheet>
    );
  }

  const list = q.trim() ? local : (lists[tab] ?? []);
  return (
    <Sheet title={title} closeIcon="close" right={<button className="icon-btn" onClick={() => setView('scan')} aria-label="Scanner"><I.barcode /></button>}>
      <div className="search-wrap">
        <div className="search"><I.search size={20} /><input autoFocus placeholder="Rechercher tous les aliments…" value={q} onChange={e => setQ(e.target.value)} />
          {q && <button className="icon-btn sm" onClick={() => setQ('')}><I.close size={18} /></button>}</div>
        {!q.trim() && (
          <div className="seg">
            {([['all', 'Récents'], ['fav', 'Favoris'], ['custom', 'Personnalisé']] as const).map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        )}
      </div>
      <ul className="list results">
        {list.map((r, i) => <ResultRow key={i} r={r} onClick={() => choose(r)} />)}
      </ul>
      {!q.trim() && !list.length && (
        <p className="muted center pad">{tab === 'all' ? 'Tes aliments récents apparaîtront ici. Recherche un aliment ou scanne un code-barres.' : tab === 'fav' ? 'Aucun favori. Touche l\'étoile sur un aliment pour l\'ajouter.' : 'Aucun aliment, recette ou repas perso.'}</p>
      )}
      {q.trim().length >= 3 && (
        <>
          <div className="list-title">Open Food Facts {offLoading && <span className="spin" />}</div>
          {offErr && <p className="muted pad">Recherche en ligne indisponible.</p>}
          <ul className="list results">
            {(off ?? []).map(it => <ResultRow key={it.id} r={{ type: 'item', item: it }} onClick={() => choose({ type: 'item', item: it })} />)}
          </ul>
          {off && !off.length && <p className="muted pad">Aucun produit trouvé.</p>}
        </>
      )}
      {q.trim() && (
        <div className="pad">
          <button className="btn block" onClick={() => nav.push(<CustomFoodEditor initialName={q} onSaved={it => choose({ type: 'item', item: it })} />)}>
            <I.plus size={18} /> Créer « {q} » comme aliment perso
          </button>
        </div>
      )}
    </Sheet>
  );
}

const confirm_ = (m: string) => window.confirm(m);
