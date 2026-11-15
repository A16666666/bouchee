import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_GOALS, exportAll, getGoals, importAll, setGoals, type Entry } from './db';
import { fmt, parseNum, type SectionId } from './nutrition';
import { toast } from './ui';

// --- CSV --------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

function mapGroup(g: string): SectionId {
  const s = g.toLowerCase();
  if (/break|petit/.test(s)) return 'petitdej';
  if (/lunch|déj|dej/.test(s)) return 'dejeuner';
  if (/dinner|dîn|din/.test(s)) return 'diner';
  if (/snack|collation/.test(s)) return 'collations';
  return 'nonclasse';
}

async function importCronometer(text: string): Promise<number> {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const head = rows[0].map(h => h.trim());
  const col = (...names: string[]) => { for (const n of names) { const i = head.findIndex(h => h.toLowerCase() === n.toLowerCase()); if (i >= 0) return i; } return -1; };
  const iDay = col('Day', 'Date'), iGroup = col('Group'), iName = col('Food Name'), iAmt = col('Amount');
  const iK = col('Energy (kcal)'), iP = col('Protein (g)'), iNC = col('Net Carbs (g)'), iC = col('Carbs (g)'), iF = col('Fat (g)');
  const iFib = col('Fiber (g)'), iSug = col('Sugars (g)'), iSat = col('Saturated (g)'), iNa = col('Sodium (mg)');
  if (iDay >= 0 && iK < 0 && iName >= 0) throw new Error('Ce fichier ne contient pas les valeurs nutritionnelles (export gratuit). Importe plutôt le fichier dailysummary.csv.');
  if (iDay < 0 || iK < 0) throw new Error('Colonnes Cronometer introuvables (Day, Energy (kcal)…).');
  const n = (r: string[], i: number) => (i >= 0 ? parseNum(r[i] ?? '') : 0);
  const out: Entry[] = [];
  rows.slice(1).forEach((r, k) => {
    const date = (r[iDay] ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const name = iName >= 0 ? (r[iName] || 'Aliment importé') : 'Résumé Cronometer';
    const per100 = {
      kcal: n(r, iK), prot: n(r, iP), carbs: iNC >= 0 ? n(r, iNC) : n(r, iC), fat: n(r, iF),
      fiber: n(r, iFib), sugars: n(r, iSug), satFat: n(r, iSat), salt: (n(r, iNa) * 2.5) / 1000,
    };
    out.push({
      date, section: iGroup >= 0 ? mapGroup(r[iGroup] ?? '') : 'nonclasse', ts: Date.parse(date) + k,
      item: { id: 'i:' + date + ':' + k, kind: 'import', name, cat: 'generic', per100, portions: [{ label: iAmt >= 0 && r[iAmt] ? r[iAmt] : 'portion importée', grams: 100 }], noSpoons: true },
      qty: 1, unit: iAmt >= 0 && r[iAmt] ? r[iAmt] : 'portion importée', unitGrams: 100,
    });
  });
  await db.entries.bulkAdd(out);
  return out.length;
}

async function shareOrDownload(name: string, content: string, type: string) {
  const file = new File([content], name, { type });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch { /* annulé */ } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = () => res(i.files?.[0] ?? null); i.click();
  });
}

export function Settings() {
  const goals = useLiveQuery(getGoals);
  const [g, setG] = useState({ kcal: '', prot: '', carbs: '', fat: '' });
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const stats = useLiveQuery(async () => ({ e: await db.entries.count(), f: await db.foods.where('kind').equals('custom').count(), r: await db.recipes.count(), m: await db.meals.count() }));
  useEffect(() => { if (goals) setG({ kcal: fmt(goals.kcal, 1), prot: fmt(goals.prot, 1), carbs: fmt(goals.carbs, 1), fat: fmt(goals.fat, 1) }); }, [goals]);
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted).catch(() => { }); }, []);
  const fromMacros = parseNum(g.prot) * 4 + parseNum(g.carbs) * 4 + parseNum(g.fat) * 9;

  return (
    <div className="screen">
      <header className="big-head"><h1>Plus</h1></header>

      <div className="card form">
        <h3 className="ctitle">Objectifs quotidiens</h3>
        {([['Énergie', 'kcal', 'kcal'], ['Protéines', 'prot', 'g'], ['Glucides', 'carbs', 'g'], ['Lipides', 'fat', 'g']] as const).map(([l, k, u]) => (
          <label className="field" key={k}><span>{l}</span><input inputMode="decimal" value={g[k]} onChange={e => setG({ ...g, [k]: e.target.value })} /><em>{u}</em></label>
        ))}
        <p className="muted small">Les macros représentent {fmt(fromMacros, 0)} kcal.{' '}
          <button className="link small" onClick={() => setG({ ...g, kcal: fmt(fromMacros, 1) })}>Utiliser cette valeur</button></p>
        <div className="row gap">
          <button className="btn primary grow" onClick={async () => {
            await setGoals({ kcal: parseNum(g.kcal), prot: parseNum(g.prot), carbs: parseNum(g.carbs), fat: parseNum(g.fat) }); toast('Objectifs enregistrés');
          }}>Enregistrer</button>
          <button className="btn" onClick={() => setG({ kcal: fmt(DEFAULT_GOALS.kcal, 1), prot: fmt(DEFAULT_GOALS.prot, 1), carbs: fmt(DEFAULT_GOALS.carbs, 1), fat: fmt(DEFAULT_GOALS.fat, 1) })}>Défaut</button>
        </div>
      </div>

      <div className="card">
        <h3 className="ctitle">Mes données</h3>
        <p className="muted small">Tout est stocké uniquement sur ce téléphone : {stats?.e ?? 0} entrée(s), {stats?.f ?? 0} aliment(s), {stats?.r ?? 0} recette(s), {stats?.m ?? 0} repas.
          {persisted === false && ' Pense à exporter une sauvegarde de temps en temps.'}</p>
        <button className="btn block" onClick={async () => {
          const d = await exportAll(); await shareOrDownload(`bouchee-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d), 'application/json');
        }}>Exporter une sauvegarde</button>
        <button className="btn block" onClick={async () => {
          const f = await pickFile('.json,application/json'); if (!f) return;
          if (!confirm('Restaurer cette sauvegarde ? Les données actuelles seront remplacées.')) return;
          try { await importAll(JSON.parse(await f.text())); toast('Sauvegarde restaurée'); } catch (e) { alert('Import impossible : ' + (e as Error).message); }
        }}>Restaurer une sauvegarde</button>
        <button className="btn block" onClick={async () => {
          const f = await pickFile('.csv,text/csv'); if (!f) return;
          try { const n = await importCronometer(await f.text()); toast(`${n} entrée(s) importée(s)`); } catch (e) { alert('Import impossible : ' + (e as Error).message); }
        }}>Importer un export Cronometer (CSV)</button>
        <details className="muted small">
          <summary>Comment exporter depuis Cronometer ?</summary>
          Sur cronometer.com (navigateur), va dans Settings → Account → Export Data, puis choisis « Food &amp; Recipe Entries » (fichier servings.csv). Ouvre le fichier depuis l'app Fichiers via le bouton ci-dessus.
        </details>
      </div>

      <div className="card">
        <h3 className="ctitle">Zone sensible</h3>
        <button className="btn danger block" onClick={async () => {
          if (!confirm('Effacer tout le journal ? Les aliments, recettes et repas perso sont conservés.')) return;
          if (!confirm('Vraiment ? Cette action est définitive.')) return;
          await db.entries.clear(); toast('Journal effacé');
        }}>Effacer tout le journal</button>
      </div>

      <div className="card muted small about">
        <b>Bouchée</b> · v1.0<br />
        Données produits : Open Food Facts (licence ODbL), contributeurs bénévoles — les valeurs peuvent contenir des erreurs.
        Aliments de base : valeurs moyennes indicatives (ordres de grandeur Ciqual/USDA).
      </div>
    </div>
  );
}
