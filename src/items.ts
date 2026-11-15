import { BASE_BY_ID, BASE_FOODS } from './baseFoods';
import { db } from './db';
import { mealToItem, norm, recipeToItem, type Item, type Meal, type Serving } from './nutrition';

export type Result =
  | { type: 'item'; item: Item; last?: Serving }
  | { type: 'meal'; meal: Meal };

export const TAG: Record<string, string> = {
  base: 'Base', off: 'Open Food Facts', custom: 'Aliment personnalisé', recipe: 'Recette personnalisée', meal: 'Repas personnalisé', import: 'Importé',
};

// Renvoie la version à jour d'un aliment (une recette ou un aliment perso a pu être modifié).
export async function resolveItem(id: string, fallback?: Item): Promise<Item | undefined> {
  if (id.startsWith('b:')) return BASE_BY_ID.get(id) ?? fallback;
  if (id.startsWith('r:')) { const r = await db.recipes.get(id); return r ? recipeToItem(r) : fallback; }
  if (id.startsWith('m:')) { const m = await db.meals.get(id); return m ? mealToItem(m) : fallback; }
  return (await db.foods.get(id)) ?? fallback;
}

export async function recentResults(limit = 40): Promise<Result[]> {
  const entries = await db.entries.reverse().limit(400).toArray();
  const seen = new Set<string>(); const out: Result[] = [];
  for (const e of entries) {
    if (seen.has(e.item.id) || e.item.kind === 'import') continue;
    seen.add(e.item.id);
    if (e.item.kind === 'meal') { const m = await db.meals.get(e.item.id); if (m) out.push({ type: 'meal', meal: m }); continue; }
    const item = await resolveItem(e.item.id, e.item);
    if (item) out.push({ type: 'item', item, last: { item, qty: e.qty, unit: e.unit, unitGrams: e.unitGrams } });
    if (out.length >= limit) break;
  }
  return out;
}

const match = (q: string[], s: string) => { const n = norm(s); return q.every(t => n.includes(t)); };

export async function localSearch(query: string, opts: { meals: boolean; excludeRecipe?: string }): Promise<Result[]> {
  const q = norm(query).split(/\s+/).filter(Boolean);
  if (!q.length) return [];
  const [foods, recipes, meals] = await Promise.all([db.foods.toArray(), db.recipes.toArray(), opts.meals ? db.meals.toArray() : []]);
  const res: (Result & { score: number })[] = [];
  const nq = norm(query);
  const score = (name: string, base: number) => base + (norm(name).startsWith(nq) ? 0 : 1);
  for (const m of meals) if (match(q, m.name)) res.push({ type: 'meal', meal: m, score: score(m.name, 0) });
  for (const r of recipes) if (r.id !== opts.excludeRecipe && match(q, r.name)) res.push({ type: 'item', item: recipeToItem(r), score: score(r.name, 0) });
  for (const f of foods) if (match(q, f.name + ' ' + (f.brand ?? ''))) res.push({ type: 'item', item: f, score: score(f.name, f.kind === 'custom' ? 0 : 4) });
  for (const f of BASE_FOODS) if (match(q, f.name)) res.push({ type: 'item', item: f, score: score(f.name, 2) });
  return res.sort((a, b) => a.score - b.score).slice(0, 60);
}

export async function favResults(meals: boolean): Promise<Result[]> {
  const favs = await db.favs.toArray(); const out: Result[] = [];
  for (const { id } of favs) {
    if (id.startsWith('m:')) { if (meals) { const m = await db.meals.get(id); if (m) out.push({ type: 'meal', meal: m }); } continue; }
    const it = await resolveItem(id); if (it) out.push({ type: 'item', item: it });
  }
  return out;
}

export async function customResults(meals: boolean, excludeRecipe?: string): Promise<Result[]> {
  const [foods, recipes, ms] = await Promise.all([db.foods.where('kind').equals('custom').toArray(), db.recipes.toArray(), meals ? db.meals.toArray() : []]);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'fr');
  return [
    ...ms.sort(byName).map(meal => ({ type: 'meal' as const, meal })),
    ...recipes.filter(r => r.id !== excludeRecipe).sort(byName).map(r => ({ type: 'item' as const, item: recipeToItem(r) })),
    ...foods.sort(byName).map(item => ({ type: 'item' as const, item })),
  ];
}
