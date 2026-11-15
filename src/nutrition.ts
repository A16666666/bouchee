// Modèle nutritionnel, unités et calculs.

export type Nutr = {
  kcal: number; prot: number; carbs: number; fat: number;
  fiber?: number; sugars?: number; satFat?: number; salt?: number;
};
export const NKEYS = ['kcal', 'prot', 'carbs', 'fat', 'fiber', 'sugars', 'satFat', 'salt'] as const;
export type NKey = typeof NKEYS[number];

export type Cat = 'generic' | 'liquid' | 'oil' | 'powder' | 'sugar' | 'honey' | 'spread' | 'grain' | 'sauce';
export const CAT_LABEL: Record<Cat, string> = {
  generic: 'Autre (solide)', liquid: 'Liquide', oil: 'Huile', powder: 'Poudre (farine, whey…)',
  sugar: 'Sucre / sel', honey: 'Miel / confiture', spread: 'Pâte à tartiner / beurre',
  grain: 'Céréales / graines', sauce: 'Sauce / crème',
};

export type Portion = { label: string; grams: number };

export type ItemKind = 'base' | 'off' | 'custom' | 'recipe' | 'import';
export type Item = {
  id: string; kind: ItemKind; name: string; brand?: string;
  per100: Nutr; cat: Cat; portions: Portion[]; barcode?: string; noSpoons?: boolean;
};

// Une quantité d'un aliment (entrée de journal, ingrédient, élément de repas).
export type Serving = { item: Item; qty: number; unit: string; unitGrams: number };

// Grammes pour 1 c. à soupe / 1 c. à café, et densité (g/ml) pour les liquides.
const CAT_CONV: Record<Cat, { tbsp: number; tsp: number; density?: number }> = {
  generic: { tbsp: 15, tsp: 5 },
  liquid: { tbsp: 15, tsp: 5, density: 1 },
  oil: { tbsp: 13.5, tsp: 4.5, density: 0.92 },
  powder: { tbsp: 8, tsp: 3 },
  sugar: { tbsp: 12.5, tsp: 4.2 },
  honey: { tbsp: 21, tsp: 7, density: 1.4 },
  spread: { tbsp: 16, tsp: 5.5 },
  grain: { tbsp: 12, tsp: 4 },
  sauce: { tbsp: 16, tsp: 5.5, density: 1.05 },
};

export function unitsFor(item: Item): Portion[] {
  const c = CAT_CONV[item.cat] ?? CAT_CONV.generic;
  const out: Portion[] = [...item.portions, { label: 'g', grams: 1 }, { label: '100 g', grams: 100 }];
  if (!item.noSpoons) {
    if (c.density) {
      const d = c.density;
      out.push(
        { label: 'ml', grams: d }, { label: 'cl', grams: 10 * d }, { label: 'l', grams: 1000 * d },
        { label: 'verre (200 ml)', grams: 200 * d }, { label: 'tasse (250 ml)', grams: 250 * d },
      );
    }
    out.push({ label: 'c. à soupe', grams: c.tbsp }, { label: 'c. à café', grams: c.tsp });
    if (!c.density && item.cat !== 'oil') out.push({ label: 'kg', grams: 1000 });
  }
  const seen = new Set<string>();
  return out.filter(p => p.grams > 0 && !seen.has(p.label) && (seen.add(p.label), true));
}

export function defaultServing(item: Item): { qty: number; unit: string; unitGrams: number } {
  if (item.portions.length) return { qty: 1, unit: item.portions[0].label, unitGrams: item.portions[0].grams };
  return { qty: 100, unit: 'g', unitGrams: 1 };
}

export const zero = (): Required<Nutr> => ({ kcal: 0, prot: 0, carbs: 0, fat: 0, fiber: 0, sugars: 0, satFat: 0, salt: 0 });

export function scale(per100: Nutr, grams: number): Required<Nutr> {
  const r = zero();
  for (const k of NKEYS) r[k] = ((per100[k] ?? 0) * grams) / 100;
  return r;
}
export function add(a: Required<Nutr>, b: Nutr): Required<Nutr> {
  for (const k of NKEYS) a[k] += b[k] ?? 0;
  return a;
}
export const servingGrams = (s: Serving) => s.qty * s.unitGrams;
export const servingNutr = (s: Serving) => scale(s.item.per100, servingGrams(s));
export function sumServings(list: Serving[]): Required<Nutr> {
  return list.reduce((acc, s) => add(acc, servingNutr(s)), zero());
}

// Recettes -----------------------------------------------------------------
export type Recipe = { id: string; name: string; servings: number; ingredients: Serving[]; updated: number };
export type Meal = { id: string; name: string; items: Serving[]; updated: number };

export function recipeToItem(r: Recipe): Item {
  const total = sumServings(r.ingredients);
  const grams = r.ingredients.reduce((g, s) => g + servingGrams(s), 0);
  const per100 = zero();
  if (grams > 0) for (const k of NKEYS) per100[k] = (total[k] * 100) / grams;
  const n = Math.max(1, r.servings || 1);
  const portions: Portion[] = n > 1
    ? [{ label: 'portion', grams: grams / n }, { label: 'recette complète', grams }]
    : [{ label: 'recette complète', grams }];
  return { id: r.id, kind: 'recipe', name: r.name, per100, cat: 'generic', portions, noSpoons: true };
}

// Formatage ----------------------------------------------------------------
export function fmt(n: number, d = 1): string {
  if (!isFinite(n)) return '0';
  const v = Math.round(n * 10 ** d) / 10 ** d;
  return v.toLocaleString('fr-CH', { maximumFractionDigits: d, minimumFractionDigits: 0 });
}
export function parseNum(s: string): number {
  const v = parseFloat(String(s).replace(',', '.').replace(/\s/g, ''));
  return isFinite(v) ? v : 0;
}
export function servingLabel(s: Serving): string {
  const q = fmt(s.qty, 2);
  if (s.unit === 'g' || s.unit === 'ml' || s.unit === 'cl' || s.unit === 'kg' || s.unit === 'l') return `${q} ${s.unit}`;
  if (s.unit === '100 g') return `${fmt(s.qty * 100, 0)} g`;
  return `${q} × ${s.unit}`;
}
export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Sections du journal ------------------------------------------------------
export const SECTIONS = [
  { id: 'nonclasse', label: 'Non classé' },
  { id: 'petitdej', label: 'Petit-déjeuner' },
  { id: 'dejeuner', label: 'Déjeuner' },
  { id: 'diner', label: 'Dîner' },
  { id: 'collations', label: 'Collations' },
] as const;
export type SectionId = typeof SECTIONS[number]['id'];
export function sectionForNow(): SectionId {
  const d = new Date(); const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 10.5) return 'petitdej';
  if (h >= 10.5 && h < 14.5) return 'dejeuner';
  if (h >= 18 && h < 22.5) return 'diner';
  return 'collations';
}

// Dates (locales, format YYYY-MM-DD) ---------------------------------------
export function isoDate(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseIso(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s: string, n: number): string { const d = parseIso(s); d.setDate(d.getDate() + n); return isoDate(d); }
export const today = () => isoDate(new Date());
export function dayLabel(s: string): string {
  const t = today();
  if (s === t) return 'Ajd';
  if (s === addDays(t, -1)) return 'Hier';
  if (s === addDays(t, 1)) return 'Demain';
  return parseIso(s).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
