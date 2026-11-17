import Dexie, { type Table } from 'dexie';
import type { Item, Meal, Recipe, Serving, SectionId } from './nutrition';

export type Entry = Serving & { id?: number; date: string; section: SectionId; ts: number };
export type Goals = { kcal: number; prot: number; carbs: number; fat: number };
export const DEFAULT_GOALS: Goals = { kcal: 2202.3, prot: 137.6, carbs: 247.8, fat: 73.4 };

class DB extends Dexie {
  entries!: Table<Entry, number>;
  foods!: Table<Item, string>;      // aliments perso + cache Open Food Facts
  recipes!: Table<Recipe, string>;
  meals!: Table<Meal, string>;
  favs!: Table<{ id: string }, string>;
  kv!: Table<{ k: string; v: unknown }, string>;
  constructor() {
    super('bouchee');
    this.version(1).stores({
      entries: '++id, date, section',
      foods: 'id, kind, barcode',
      recipes: 'id',
      meals: 'id',
      favs: 'id',
      kv: 'k',
    });
  }
}
export const db = new DB();

// Objectifs datés : chaque période s'applique à partir de sa date, jusqu'à la suivante.
export type GoalPeriod = { from: string; goals: Goals };
export const FIRST_DAY = '0000-01-01';

export async function getGoalHistory(): Promise<GoalPeriod[]> {
  const h = await db.kv.get('goalsHistory');
  if (h?.v) return h.v as GoalPeriod[];
  const old = await db.kv.get('goals'); // ancienne version : un seul objectif
  return [{ from: FIRST_DAY, goals: (old?.v as Goals) ?? DEFAULT_GOALS }];
}
export function goalsFor(history: GoalPeriod[] | undefined, date: string): Goals {
  if (!history?.length) return DEFAULT_GOALS;
  let g = history[0].goals;
  for (const p of history) if (p.from <= date) g = p.goals;
  return g;
}
export async function setGoalsFrom(from: string, goals: Goals) {
  const h = (await getGoalHistory()).filter(p => p.from !== from);
  h.push({ from, goals });
  h.sort((a, b) => a.from.localeCompare(b.from));
  h[0] = { ...h[0], from: FIRST_DAY }; // la première période couvre tout le passé
  await db.kv.put({ k: 'goalsHistory', v: h });
}
export async function deleteGoalPeriod(from: string) {
  const h = (await getGoalHistory()).filter(p => p.from !== from);
  if (!h.length) return;
  h[0] = { ...h[0], from: FIRST_DAY };
  await db.kv.put({ k: 'goalsHistory', v: h });
}

export async function toggleFav(id: string) {
  if (await db.favs.get(id)) await db.favs.delete(id); else await db.favs.put({ id });
}

export async function exportAll() {
  return {
    app: 'bouchee', version: 1, exported: new Date().toISOString(),
    entries: await db.entries.toArray(), foods: await db.foods.toArray(),
    recipes: await db.recipes.toArray(), meals: await db.meals.toArray(),
    favs: await db.favs.toArray(), kv: await db.kv.toArray(),
  };
}
// Fusion (sans rien effacer, sauf ce qu'un fichier de réparation demande).
export type MergeFile = {
  app: 'bouchee'; merge: true; id: string; replaces?: string;
  purgeCronometer?: { until: string };            // retire tout ce qui vient d'un import Cronometer jusqu'à cette date
  goalsBefore?: { date: string; goals: Goals };   // objectifs appliqués à tous les jours avant cette date
  foods?: Item[]; recipes?: Recipe[]; meals?: Meal[]; entries?: Entry[]; favs?: { id: string }[];
};

// Une entrée vient d'un import Cronometer si c'est un résumé journalier importé, ou si elle
// référence un élément « crono » et porte l'horodatage des fichiers d'import (midi ± 2 h + n ms).
export function isCronometerImport(e: Entry): boolean {
  if (e.item.kind === 'import') return true;
  if (!/^[crm]:crono-/.test(e.item.id)) return false;
  const [y, m, d] = e.date.split('-').map(Number);
  const x = e.ts - new Date(y, m - 1, d, 12).getTime();
  return x >= -3 * 3600_000 && x < 3 * 3600_000 && e.ts % 60_000 < 1000;
}

export async function importMerge(data: MergeFile): Promise<{ entries: number; removed: number; already: boolean }> {
  const key = 'merged:' + data.id;
  if (!data.purgeCronometer && await db.kv.get(key)) return { entries: 0, removed: 0, already: true };
  let removed = 0;
  await db.transaction('rw', [db.entries, db.foods, db.recipes, db.meals, db.favs, db.kv], async () => {
    const until = data.purgeCronometer?.until ?? (data.replaces && await db.kv.get('merged:' + data.replaces) ? '9999-12-31' : null);
    if (until) removed = await db.entries.filter(e => e.date <= until && isCronometerImport(e)).delete();
    if (data.goalsBefore) {
      const h = (await getGoalHistory()).filter(p => p.from >= data.goalsBefore!.date);
      h.unshift({ from: FIRST_DAY, goals: data.goalsBefore.goals });
      await db.kv.put({ k: 'goalsHistory', v: h });
    }
    if (data.foods) await db.foods.bulkPut(data.foods);
    if (data.recipes) await db.recipes.bulkPut(data.recipes);
    if (data.meals) await db.meals.bulkPut(data.meals);
    if (data.favs) await db.favs.bulkPut(data.favs);
    if (data.entries) await db.entries.bulkAdd(data.entries.map(({ id: _id, ...e }) => e as Entry));
    await db.kv.put({ k: key, v: Date.now() });
  });
  return { entries: data.entries?.length ?? 0, removed, already: false };
}

export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  if (data?.app !== 'bouchee') throw new Error('Fichier non reconnu');
  await db.transaction('rw', [db.entries, db.foods, db.recipes, db.meals, db.favs, db.kv], async () => {
    await Promise.all([db.entries.clear(), db.foods.clear(), db.recipes.clear(), db.meals.clear(), db.favs.clear(), db.kv.clear()]);
    await db.entries.bulkAdd(data.entries.map(({ id: _id, ...e }) => e as Entry));
    await db.foods.bulkPut(data.foods); await db.recipes.bulkPut(data.recipes);
    await db.meals.bulkPut(data.meals); await db.favs.bulkPut(data.favs); await db.kv.bulkPut(data.kv);
  });
}
