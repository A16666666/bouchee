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

export async function getGoals(): Promise<Goals> {
  const r = await db.kv.get('goals');
  return (r?.v as Goals) ?? DEFAULT_GOALS;
}
export const setGoals = (g: Goals) => db.kv.put({ k: 'goals', v: g });

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
export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  if (data?.app !== 'bouchee') throw new Error('Fichier non reconnu');
  await db.transaction('rw', [db.entries, db.foods, db.recipes, db.meals, db.favs, db.kv], async () => {
    await Promise.all([db.entries.clear(), db.foods.clear(), db.recipes.clear(), db.meals.clear(), db.favs.clear(), db.kv.clear()]);
    await db.entries.bulkAdd(data.entries.map(({ id: _id, ...e }) => e as Entry));
    await db.foods.bulkPut(data.foods); await db.recipes.bulkPut(data.recipes);
    await db.meals.bulkPut(data.meals); await db.favs.bulkPut(data.favs); await db.kv.bulkPut(data.kv);
  });
}
