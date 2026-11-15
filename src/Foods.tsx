import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { fmt, recipeToItem, sumServings } from './nutrition';
import { CustomFoodEditor, MealEditor, RecipeEditor } from './Editors';
import { I, Sheet, useNav } from './ui';

function MealsList() {
  const nav = useNav();
  const meals = useLiveQuery(() => db.meals.toArray()) ?? [];
  return (
    <Sheet title="Repas personnalisés" right={<button className="icon-btn" onClick={() => nav.push(<MealEditor />)}><I.plus /></button>}>
      <ul className="list">
        {meals.sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(m => (
          <li key={m.id} onClick={() => nav.push(<MealEditor meal={m} />)}>
            <div><div className="b">{m.name}</div><div className="muted small">{m.items.length} élément(s)</div></div>
            <span className="muted">{fmt(sumServings(m.items).kcal, 0)} kcal</span>
          </li>
        ))}
      </ul>
      {!meals.length && <p className="muted center pad">Aucun repas pour l'instant.</p>}
    </Sheet>
  );
}

function RecipesList() {
  const nav = useNav();
  const recipes = useLiveQuery(() => db.recipes.toArray()) ?? [];
  return (
    <Sheet title="Recettes personnalisées" right={<button className="icon-btn" onClick={() => nav.push(<RecipeEditor />)}><I.plus /></button>}>
      <ul className="list">
        {recipes.sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(r => {
          const it = recipeToItem(r); const g = it.portions[0].grams;
          return (
            <li key={r.id} onClick={() => nav.push(<RecipeEditor recipe={r} />)}>
              <div><div className="b">{r.name}</div><div className="muted small">{r.servings > 1 ? `${r.servings} portions` : '1 recette complète'}</div></div>
              <span className="muted">{fmt(it.per100.kcal * g / 100, 0)} kcal{r.servings > 1 ? '/portion' : ''}</span>
            </li>
          );
        })}
      </ul>
      {!recipes.length && <p className="muted center pad">Aucune recette pour l'instant.</p>}
    </Sheet>
  );
}

function CustomList() {
  const nav = useNav();
  const foods = useLiveQuery(() => db.foods.where('kind').equals('custom').toArray()) ?? [];
  return (
    <Sheet title="Aliments personnalisés" right={<button className="icon-btn" onClick={() => nav.push(<CustomFoodEditor />)}><I.plus /></button>}>
      <ul className="list">
        {foods.sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(f => (
          <li key={f.id} onClick={() => nav.push(<CustomFoodEditor food={f} />)}>
            <div><div className="b">{f.name}</div><div className="muted small">{f.brand ?? ''}</div></div>
            <span className="muted">{fmt(f.per100.kcal, 0)} kcal/100 g</span>
          </li>
        ))}
      </ul>
      {!foods.length && <p className="muted center pad">Aucun aliment perso pour l'instant.</p>}
    </Sheet>
  );
}

export function Foods() {
  const nav = useNav();
  const counts = useLiveQuery(async () => ({ m: await db.meals.count(), r: await db.recipes.count(), f: await db.foods.where('kind').equals('custom').count() }));
  const Card = ({ icon, color, title, text, n, open, actions }: { icon: React.ReactNode; color: string; title: string; text: string; n?: number; open: () => void; actions: React.ReactNode }) => (
    <div className="card fcard">
      <div className="fcard-top" onClick={open}>
        <div className="ficon" style={{ background: color }}>{icon}</div>
        <div className="grow"><h3>{title}{n ? <span className="count">{n}</span> : null}</h3><p className="muted">{text}</p></div>
        <I.right />
      </div>
      <div className="row gap">{actions}</div>
    </div>
  );
  return (
    <div className="screen">
      <header className="big-head"><h1>Aliments</h1></header>
      <Card icon={<I.fork />} color="#2a9d8f" title="Repas personnalisés" n={counts?.m}
        text="Combine tes recettes et aliments préférés en un seul repas pour l'ajouter en un geste."
        open={() => nav.push(<MealsList />)} actions={<button className="btn outline" onClick={() => nav.push(<MealEditor />)}>CRÉER UN REPAS</button>} />
      <Card icon={<I.book />} color="#3b82f6" title="Recettes personnalisées" n={counts?.r}
        text="Crée tes recettes à partir d'ingrédients : les macros sont calculées par portion."
        open={() => nav.push(<RecipesList />)} actions={<button className="btn outline" onClick={() => nav.push(<RecipeEditor />)}>CRÉER UNE RECETTE</button>} />
      <Card icon={<I.apple />} color="#ef4444" title="Aliments personnalisés" n={counts?.f}
        text="Ajoute tout aliment absent de la base, avec ses valeurs et ses portions."
        open={() => nav.push(<CustomList />)} actions={<button className="btn outline" onClick={() => nav.push(<CustomFoodEditor />)}>CRÉER UN ALIMENT</button>} />
    </div>
  );
}
