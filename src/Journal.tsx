import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getGoalHistory, goalsFor, type Entry } from './db';
import { addDays, dayLabel, fmt, SECTIONS, servingLabel, servingNutr, sumServings, today, type SectionId } from './nutrition';
import { FoodPicker, QuantityForm } from './FoodPicker';
import { MealEditor } from './Editors';
import { resolveItem } from './items';
import { COLORS, I, MacroBar, Sheet, toast, useNav } from './ui';

function EntryEditor({ e }: { e: Entry }) {
  const nav = useNav();
  const [section, setSection] = useState<SectionId>(e.section);
  return (
    <Sheet title="Modifier">
      <QuantityForm item={e.item} init={e} section={section} onSection={setSection} confirmLabel="Enregistrer"
        onConfirm={async s => { await db.entries.update(e.id!, { ...s, section }); nav.pop(); }}
        extra={<>
          {e.date !== today() && (
            <button className="btn block" onClick={async () => {
              const { id: _id, ...rest } = e; await db.entries.add({ ...rest, date: today(), ts: Date.now() });
              toast('Copié dans le journal d\'aujourd\'hui'); nav.pop();
            }}>Copier vers aujourd'hui</button>
          )}
          <button className="btn danger block" onClick={async () => { await db.entries.delete(e.id!); nav.pop(); }}>Supprimer du journal</button>
        </>} />
    </Sheet>
  );
}

export function Journal({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const nav = useNav();
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).toArray(), [date]) ?? [];
  const history = useLiveQuery(getGoalHistory);
  const goals = goalsFor(history, date);
  const t = sumServings(entries);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const openEntry = async (e: Entry) => {
    // Une entrée garde l'instantané enregistré (nom, valeurs, poids) : modifier
    // un repas ou une recette ensuite ne change pas le journal. Pour un aliment
    // simple, on propose seulement les portions ajoutées depuis.
    if (e.item.kind === 'meal' || e.item.kind === 'recipe') { nav.push(<EntryEditor e={e} />); return; }
    const fresh = await resolveItem(e.item.id, e.item);
    nav.push(<EntryEditor e={{ ...e, item: { ...e.item, portions: fresh?.portions ?? e.item.portions } }} />);
  };

  return (
    <div className="screen">
      <header className="jhead">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Jour précédent"><I.left /></button>
        <label className="jdate">
          {dayLabel(date)}
          <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
        </label>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Jour suivant"><I.right /></button>
        {date !== today() && <button className="link today-btn" onClick={() => setDate(today())}>Ajd</button>}
      </header>

      <div className="card goals">
        <div className="goals-title"><span>OBJECTIFS</span><span className="muted">CONSOMMÉ</span></div>
        <MacroBar label="Énergie" value={t.kcal} goal={goals.kcal} unit="kcal" color={COLORS.kcal} />
        <MacroBar label="Protéines" value={t.prot} goal={goals.prot} unit="g" color={COLORS.prot} />
        <MacroBar label="Glucides" value={t.carbs} goal={goals.carbs} unit="g" color={COLORS.carbs} />
        <MacroBar label="Lipides" value={t.fat} goal={goals.fat} unit="g" color={COLORS.fat} />
      </div>

      {SECTIONS.map(sec => {
        const list = entries.filter(e => e.section === sec.id).sort((a, b) => a.ts - b.ts);
        const st = sumServings(list);
        const isClosed = closed[sec.id] ?? false;
        return (
          <div className="card section" key={sec.id}>
            <div className="sec-head">
              <button className="icon-btn plus" onClick={() => nav.push(<FoodPicker mode="journal" date={date} initialSection={sec.id} />)} aria-label={`Ajouter à ${sec.label}`}><I.plus /></button>
              <div className="sec-title" onClick={() => setClosed({ ...closed, [sec.id]: !isClosed })}>
                <span>{sec.label}</span>
                {list.length > 0 && <span className="muted small">{fmt(st.kcal, 0)} kcal · P {fmt(st.prot, 0)} · G {fmt(st.carbs, 0)} · L {fmt(st.fat, 0)}</span>}
              </div>
              {list.length > 0 && (
                <button className="icon-btn" onClick={() => setClosed({ ...closed, [sec.id]: !isClosed })}>{isClosed ? <I.down /> : <I.up />}</button>
              )}
            </div>
            {!isClosed && list.length > 0 && (
              <>
                <ul className="list entries">
                  {list.map(e => (
                    <li key={e.id} onClick={() => openEntry(e)}>
                      <div><div>{e.item.name}</div><div className="muted small">{servingLabel(e)}</div></div>
                      <span>{fmt(servingNutr(e).kcal, 0)} kcal</span>
                    </li>
                  ))}
                </ul>
                {list.length > 1 && (
                  <button className="link small save-meal" onClick={() => nav.push(<MealEditor initialItems={list.map(({ item, qty, unit, unitGrams }) => ({ item, qty, unit, unitGrams }))} />)}>
                    Enregistrer comme repas
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
      <div style={{ height: 24 }} />
    </div>
  );
}
