import { useState } from 'react';
import { db } from './db';
import {
  CAT_LABEL, fmt, parseNum, recipeToItem, servingLabel, servingNutr, sumServings, uid,
  type Cat, type Item, type Meal, type Portion, type Recipe, type Serving,
} from './nutrition';
import { FoodPicker, QuantityForm } from './FoodPicker';
import { COLORS, I, Sheet, toast, useNav } from './ui';

// ---------------------------------------------------------------------------
// Aliment personnalisé
export function CustomFoodEditor({ food, barcode, initialName, onSaved }: {
  food?: Item; barcode?: string; initialName?: string; onSaved?: (it: Item) => void;
}) {
  const nav = useNav();
  const p = food?.per100;
  const s = (v?: number) => (v == null ? '' : fmt(v, 2).replace(/\s/g, ''));
  const [name, setName] = useState(food?.name ?? initialName ?? '');
  const [brand, setBrand] = useState(food?.brand ?? '');
  const [code, setCode] = useState(food?.barcode ?? barcode ?? '');
  const [basis, setBasis] = useState<'100' | 'portion'>('100');
  const [basisG, setBasisG] = useState('');
  const [v, setV] = useState({
    kcal: s(p?.kcal), prot: s(p?.prot), carbs: s(p?.carbs), fat: s(p?.fat),
    fiber: s(p?.fiber), sugars: s(p?.sugars), satFat: s(p?.satFat), salt: s(p?.salt),
  });
  const [cat, setCat] = useState<Cat>(food?.cat ?? 'generic');
  const [portions, setPortions] = useState<{ label: string; grams: string }[]>(
    (food?.portions ?? []).map(x => ({ label: x.label, grams: s(x.grams) })));

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const kcalAuto = parseNum(v.prot) * 4 + parseNum(v.carbs) * 4 + parseNum(v.fat) * 9;

  async function save() {
    if (!name.trim()) return toast('Donne un nom à l\'aliment');
    const factor = basis === 'portion' ? (parseNum(basisG) > 0 ? 100 / parseNum(basisG) : NaN) : 1;
    if (!isFinite(factor)) return toast('Indique le poids de la portion');
    const opt = (x: string) => (x.trim() === '' ? undefined : parseNum(x) * factor);
    const per100 = {
      kcal: (v.kcal.trim() === '' ? kcalAuto : parseNum(v.kcal)) * factor,
      prot: parseNum(v.prot) * factor, carbs: parseNum(v.carbs) * factor, fat: parseNum(v.fat) * factor,
      fiber: opt(v.fiber), sugars: opt(v.sugars), satFat: opt(v.satFat), salt: opt(v.salt),
    };
    const ps: Portion[] = portions.filter(x => x.label.trim() && parseNum(x.grams) > 0).map(x => ({ label: x.label.trim(), grams: parseNum(x.grams) }));
    if (basis === 'portion' && !ps.some(x => x.grams === parseNum(basisG))) ps.unshift({ label: 'portion', grams: parseNum(basisG) });
    const item: Item = {
      id: food?.id ?? 'c:' + uid(), kind: 'custom', name: name.trim(), brand: brand.trim() || undefined,
      barcode: code.replace(/\D/g, '') || undefined, per100, cat, portions: ps,
    };
    await db.foods.put(item);
    toast('Aliment enregistré');
    nav.pop();
    onSaved?.(item);
  }
  async function del() {
    if (!food || !confirm('Supprimer cet aliment ? Les entrées déjà dans ton journal sont conservées.')) return;
    await db.foods.delete(food.id); nav.pop();
  }

  const F = (label: string, k: keyof typeof v, unit = 'g', ph = '') => (
    <label className="field"><span>{label}</span><input inputMode="decimal" value={v[k]} onChange={set(k)} placeholder={ph} /><em>{unit}</em></label>
  );

  return (
    <Sheet title={food ? 'Modifier l\'aliment' : 'Nouvel aliment'} right={<button className="link" onClick={save}>OK</button>}>
      <div className="form">
        <label className="field col"><span>Nom</span><input value={name} onChange={e => setName(e.target.value)} placeholder="ex. Croissant pistache" /></label>
        <label className="field col"><span>Marque (facultatif)</span><input value={brand} onChange={e => setBrand(e.target.value)} /></label>
        <label className="field col"><span>Code-barres (facultatif)</span><input inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} /></label>

        <div className="list-title">Valeurs nutritionnelles</div>
        <div className="seg">
          <button className={basis === '100' ? 'on' : ''} onClick={() => setBasis('100')}>Pour 100 g</button>
          <button className={basis === 'portion' ? 'on' : ''} onClick={() => setBasis('portion')}>Pour une portion</button>
        </div>
        {basis === 'portion' && <label className="field"><span>Poids de la portion</span><input inputMode="decimal" value={basisG} onChange={e => setBasisG(e.target.value)} /><em>g</em></label>}
        {F('Énergie', 'kcal', 'kcal', kcalAuto ? fmt(kcalAuto, 0) + ' (auto)' : '')}
        {F('Protéines', 'prot')}
        {F('Glucides', 'carbs')}
        {F('dont sucres', 'sugars')}
        {F('Lipides', 'fat')}
        {F('dont AG saturés', 'satFat')}
        {F('Fibres', 'fiber')}
        {F('Sel', 'salt')}

        <div className="list-title">Unités</div>
        <label className="field col"><span>Type (pour convertir cuillères et ml)</span>
          <select value={cat} onChange={e => setCat(e.target.value as Cat)}>
            {Object.entries(CAT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        {portions.map((x, i) => (
          <div className="row gap portion-row" key={i}>
            <input placeholder="ex. pièce, tranche, scoop" value={x.label} onChange={e => setPortions(portions.map((y, j) => j === i ? { ...y, label: e.target.value } : y))} />
            <input className="g" inputMode="decimal" placeholder="g" value={x.grams} onChange={e => setPortions(portions.map((y, j) => j === i ? { ...y, grams: e.target.value } : y))} />
            <button className="icon-btn" onClick={() => setPortions(portions.filter((_, j) => j !== i))}><I.trash size={20} /></button>
          </div>
        ))}
        <button className="btn" onClick={() => setPortions([...portions, { label: '', grams: '' }])}><I.plus size={18} /> Ajouter une portion</button>

        <button className="btn primary block mt" onClick={save}>Enregistrer</button>
        {food && <button className="btn danger block" onClick={del}>Supprimer l'aliment</button>}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Liste d'éléments éditable (ingrédients d'une recette ou éléments d'un repas)
function ServingList({ items, setItems, pickerMode, excludeRecipe }: {
  items: Serving[]; setItems: (s: Serving[]) => void; pickerMode: 'ingredient' | 'mealItem'; excludeRecipe?: string;
}) {
  const nav = useNav();
  return (
    <>
      <ul className="list">
        {items.map((s, i) => (
          <li key={i} onClick={() => nav.push(
            <Sheet title="Modifier">
              <QuantityForm item={s.item} init={s} confirmLabel="Enregistrer"
                onConfirm={ns => { setItems(items.map((x, j) => j === i ? ns : x)); nav.pop(); }}
                extra={<button className="btn danger block" onClick={() => { setItems(items.filter((_, j) => j !== i)); nav.pop(); }}>Retirer</button>} />
            </Sheet>)}>
            <div><div className="b">{s.item.name}</div><div className="muted small">{servingLabel(s)}</div></div>
            <span className="muted">{fmt(servingNutr(s).kcal, 0)} kcal</span>
          </li>
        ))}
      </ul>
      <button className="btn block" onClick={() => nav.push(
        <FoodPicker mode={pickerMode} excludeRecipe={excludeRecipe} onPick={s => setItems([...items, s])} />)}>
        <I.plus size={18} /> {pickerMode === 'ingredient' ? 'Ajouter un ingrédient' : 'Ajouter un aliment'}
      </button>
    </>
  );
}

function Totals({ list, div = 1, label }: { list: Serving[]; div?: number; label: string }) {
  const t = sumServings(list);
  return (
    <div className="card totals">
      <div className="muted small">{label}</div>
      <div className="kcal-big"><span>{fmt(t.kcal / div, 0)}</span> kcal</div>
      <div className="macros3">
        <div><i style={{ background: COLORS.prot }} />Protéines<b>{fmt(t.prot / div)} g</b></div>
        <div><i style={{ background: COLORS.carbs }} />Glucides<b>{fmt(t.carbs / div)} g</b></div>
        <div><i style={{ background: COLORS.fat }} />Lipides<b>{fmt(t.fat / div)} g</b></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function RecipeEditor({ recipe }: { recipe?: Recipe }) {
  const nav = useNav();
  const [id] = useState(recipe?.id ?? 'r:' + uid());
  const [name, setName] = useState(recipe?.name ?? '');
  const [servings, setServings] = useState(String(recipe?.servings ?? 1));
  const [items, setItems] = useState<Serving[]>(recipe?.ingredients ?? []);
  const n = Math.max(1, Math.round(parseNum(servings)) || 1);
  const grams = items.reduce((g, s) => g + s.qty * s.unitGrams, 0);

  async function save() {
    if (!name.trim()) return toast('Donne un nom à la recette');
    if (!items.length) return toast('Ajoute au moins un ingrédient');
    await db.recipes.put({ id, name: name.trim(), servings: n, ingredients: items, updated: Date.now() });
    toast('Recette enregistrée'); nav.pop();
  }
  async function del() {
    if (!recipe || !confirm('Supprimer cette recette ?')) return;
    await db.recipes.delete(recipe.id); nav.pop();
  }
  return (
    <Sheet title={recipe ? 'Modifier la recette' : 'Nouvelle recette'} right={<button className="link" onClick={save}>OK</button>}>
      <div className="form">
        <label className="field col"><span>Nom</span><input value={name} onChange={e => setName(e.target.value)} placeholder="ex. Skyr whey chia spéculos" /></label>
        <label className="field"><span>Nombre de portions</span><input inputMode="numeric" value={servings} onChange={e => setServings(e.target.value)} /></label>
        <div className="list-title">Ingrédients <span className="muted small">· {fmt(grams, 0)} g au total</span></div>
        <ServingList items={items} setItems={setItems} pickerMode="ingredient" excludeRecipe={id} />
        {items.length > 0 && <Totals list={items} label="Recette complète" />}
        {items.length > 0 && n > 1 && <Totals list={items} div={n} label={`Par portion (${fmt(grams / n, 0)} g)`} />}
        <button className="btn primary block mt" onClick={save}>Enregistrer</button>
        {recipe && <button className="btn danger block" onClick={del}>Supprimer la recette</button>}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
export function MealEditor({ meal, initialItems }: { meal?: Meal; initialItems?: Serving[] }) {
  const nav = useNav();
  const [name, setName] = useState(meal?.name ?? '');
  const [items, setItems] = useState<Serving[]>(meal?.items ?? initialItems ?? []);
  async function save() {
    if (!name.trim()) return toast('Donne un nom au repas');
    if (!items.length) return toast('Ajoute au moins un aliment');
    await db.meals.put({ id: meal?.id ?? 'm:' + uid(), name: name.trim(), items, updated: Date.now() });
    toast('Repas enregistré'); nav.pop();
  }
  async function del() {
    if (!meal || !confirm('Supprimer ce repas ?')) return;
    await db.meals.delete(meal.id); nav.pop();
  }
  return (
    <Sheet title={meal ? 'Modifier le repas' : 'Nouveau repas'} right={<button className="link" onClick={save}>OK</button>}>
      <div className="form">
        <label className="field col"><span>Nom</span><input value={name} onChange={e => setName(e.target.value)} placeholder="ex. Pâtes pesto parmesan" /></label>
        <div className="list-title">Aliments et recettes</div>
        <ServingList items={items} setItems={setItems} pickerMode="mealItem" />
        {items.length > 0 && <Totals list={items} label="Total du repas" />}
        <button className="btn primary block mt" onClick={save}>Enregistrer</button>
        {meal && <button className="btn danger block" onClick={del}>Supprimer le repas</button>}
      </div>
    </Sheet>
  );
}

export { recipeToItem };
