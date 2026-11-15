import { useState } from 'react';
import { Journal } from './Journal';
import { Foods } from './Foods';
import { Discover } from './Discover';
import { Settings } from './Settings';
import { FoodPicker } from './FoodPicker';
import { sectionForNow, today } from './nutrition';
import { I, NavProvider, useNav } from './ui';

type Tab = 'discover' | 'journal' | 'foods' | 'more';

function Shell() {
  const nav = useNav();
  const [tab, setTab] = useState<Tab>('journal');
  const [date, setDate] = useState(today());
  const [menu, setMenu] = useState(false);

  const open = (scan: boolean) => {
    setMenu(false);
    setTab('journal');
    nav.push(<FoodPicker mode="journal" date={date} initialSection={date === today() ? sectionForNow() : 'nonclasse'} startWithScan={scan} />);
  };
  const T = ({ id, icon, label }: { id: Tab; icon: React.ReactNode; label: string }) => (
    <button className={'tab ' + (tab === id ? 'on' : '')} onClick={() => setTab(id)}>{icon}<span>{label}</span></button>
  );

  return (
    <div className="app">
      <main>
        {tab === 'journal' && <Journal date={date} setDate={setDate} />}
        {tab === 'discover' && <Discover />}
        {tab === 'foods' && <Foods />}
        {tab === 'more' && <Settings />}
      </main>
      <nav className="tabbar">
        <T id="discover" icon={<I.chart />} label="Découvrir" />
        <T id="journal" icon={<I.book />} label="Journal" />
        <button className="fab" onClick={() => setMenu(true)} aria-label="Ajouter"><I.plus size={30} /></button>
        <T id="foods" icon={<I.apple />} label="Aliments" />
        <T id="more" icon={<I.dots />} label="Plus" />
      </nav>
      {menu && (
        <div className="menu-backdrop" onClick={() => setMenu(false)}>
          <div className="menu" onClick={e => e.stopPropagation()}>
            <button onClick={() => open(false)}><span>Rechercher un aliment</span><I.search /></button>
            <button onClick={() => open(true)}><span>Scanner un code-barres</span><I.barcode /></button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return <NavProvider><Shell /></NavProvider>;
}
