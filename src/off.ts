// Open Food Facts (données ouvertes, licence ODbL) — appelé directement depuis le téléphone.
import type { Cat, Item, Portion } from './nutrition';
import { norm } from './nutrition';
import { db } from './db';

const FIELDS = [
  'code', 'product_name', 'product_name_fr', 'generic_name_fr', 'brands', 'nutriments', 'serving_size',
  'serving_quantity', 'product_quantity', 'product_quantity_unit', 'quantity', 'categories_tags',
].join(',');
const HOST = 'https://world.openfoodfacts.org';

type OffProduct = {
  code?: string; product_name?: string; product_name_fr?: string; generic_name_fr?: string; brands?: string;
  nutriments?: Record<string, number | string>; serving_size?: string; serving_quantity?: number | string;
  product_quantity?: number | string; product_quantity_unit?: string; quantity?: string; categories_tags?: string[];
};

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return isFinite(n) ? n : undefined;
}

function inferCat(p: OffProduct, name: string): Cat {
  const t = norm(name + ' ' + (p.categories_tags ?? []).join(' '));
  const unit = (p.product_quantity_unit || p.quantity || '').toLowerCase();
  if (/huile|oil/.test(t)) return 'oil';
  if (/\bmiel\b|honey|confiture|jam|sirop/.test(t)) return 'honey';
  if (/whey|proteine en poudre|protein-powder|farine|flour|cacao en poudre|poudre/.test(t)) return 'powder';
  if (/sucre|sugar|\bsel\b|salt/.test(t) && !/sans sucre/.test(t)) return 'sugar';
  if (/beurre|butter|pate a tartiner|spread|houmous|hummus/.test(t)) return 'spread';
  if (/sauce|creme|yaourt|yogurt|skyr|fromage blanc|compote|ketchup|mayonnaise|moutarde/.test(t)) return 'sauce';
  if (/boisson|beverage|drink|lait|milk|jus|juice|soda|eau|water|biere|vin\b/.test(t) || /\bml\b|\bcl\b|\bl\b/.test(unit)) return 'liquid';
  if (/cereal|flocon|riz|rice|pates|pasta|graine|seed|muesli|granola|noix|nuts|amande/.test(t)) return 'grain';
  return 'generic';
}

export function offToItem(p: OffProduct): Item | null {
  const n = p.nutriments ?? {};
  const name = (p.product_name_fr || p.product_name || p.generic_name_fr || '').trim();
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null) { const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']); if (kj != null) kcal = kj / 4.184; }
  const prot = num(n['proteins_100g']), carbs = num(n['carbohydrates_100g']), fat = num(n['fat_100g']);
  if (!name || kcal == null || (prot == null && carbs == null && fat == null)) return null;
  const portions: Portion[] = [];
  const sq = num(p.serving_quantity);
  if (sq && sq > 0) portions.push({ label: p.serving_size ? `portion (${p.serving_size.trim()})` : `portion (${sq} g)`, grams: sq });
  const pq = num(p.product_quantity);
  if (pq && pq > 0 && pq !== sq) portions.push({ label: `emballage entier (${p.quantity?.trim() || pq + ' g'})`, grams: pq });
  const salt = num(n['salt_100g']) ?? ((num(n['sodium_100g']) ?? NaN) * 2.5);
  return {
    id: 'off:' + p.code, kind: 'off', barcode: p.code, name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    cat: inferCat(p, name),
    per100: {
      kcal, prot: prot ?? 0, carbs: carbs ?? 0, fat: fat ?? 0,
      fiber: num(n['fiber_100g']), sugars: num(n['sugars_100g']),
      satFat: num(n['saturated-fat_100g']), salt: isFinite(salt) ? salt : undefined,
    },
    portions,
  };
}

export type BarcodeResult = { item: Item } | { notFound: true } | { error: string };

export async function lookupBarcode(code: string): Promise<BarcodeResult> {
  code = code.replace(/\D/g, '');
  const local = await db.foods.where('barcode').equals(code).first();
  if (local) return { item: local };
  try {
    const r = await fetch(`${HOST}/api/v2/product/${code}.json?fields=${FIELDS}`);
    if (r.status === 404) return { notFound: true };
    const j = await r.json();
    if (j.status !== 1 || !j.product) return { notFound: true };
    const item = offToItem({ ...j.product, code });
    if (!item) return { notFound: true };
    await db.foods.put(item);
    return { item };
  } catch {
    return { error: 'Pas de connexion à Open Food Facts.' };
  }
}

export async function searchOff(q: string, signal?: AbortSignal): Promise<Item[]> {
  const url = `${HOST}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30&lc=fr&fields=${FIELDS}`;
  const r = await fetch(url, { signal });
  const j = await r.json();
  return ((j.products ?? []) as OffProduct[]).map(offToItem).filter((x): x is Item => !!x);
}
