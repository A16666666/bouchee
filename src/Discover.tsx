import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getGoalHistory, goalsFor, type Goals } from './db';
import { add, addDays, fmt, NKEYS, parseIso, servingNutr, today, zero, type Nutr } from './nutrition';
import { COLORS } from './ui';

const PERIODS = [
  ['7', '7 derniers jours'], ['14', '2 semaines'], ['21', '3 semaines'], ['30', '1 mois'], ['60', '2 mois'],
  ['90', '3 mois'], ['180', '6 mois'], ['365', '1 an'], ['all', 'Depuis toujours'], ['custom', 'Dates personnalisées'],
] as const;
type Period = typeof PERIODS[number][0];
type Metric = 'kcal' | 'prot' | 'carbs' | 'fat';
const METRIC: Record<Metric, { label: string; unit: string }> = {
  kcal: { label: 'Calories', unit: 'kcal' }, prot: { label: 'Protéines', unit: 'g' },
  carbs: { label: 'Glucides', unit: 'g' }, fat: { label: 'Lipides', unit: 'g' },
};
const short = (d: string) => parseIso(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)); const m = v / p;
  return (m <= 1.2 ? 1.2 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p;
}

function Chart({ days, data, metric, goals }: { days: string[]; data: Map<string, Required<Nutr>>; metric: Metric; goals: number[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 360, H = 230, L = 38, R = 8, T = 12, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const vals = days.map(d => {
    const n = data.get(d);
    if (!n) return null;
    return metric === 'kcal' ? { stack: [n.prot * 4, n.carbs * 4, n.fat * 9], total: n.kcal } : { stack: [n[metric]], total: n[metric] };
  });
  const max = niceMax(Math.max(...goals, ...vals.map(v => (v ? Math.max(v.total, v.stack.reduce((a, b) => a + b, 0)) : 0))) * 1.05);
  const y = (v: number) => T + ph - (v / max) * ph;
  const step = pw / Math.max(1, days.length);
  const bw = Math.max(1, Math.min(14, step * 0.62));
  const colors = metric === 'kcal' ? [COLORS.prot, COLORS.carbs, COLORS.fat] : [COLORS[metric]];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max);
  const labelIdx = days.length <= 1 ? [0] : [0, Math.floor((days.length - 1) / 2), days.length - 1];
  const s = sel != null ? vals[sel] : null;

  return (
    <div className="chart">
      <div className="chart-info">
        {sel != null ? (
          <><b>{short(days[sel])}</b> · {s ? `${fmt(s.total, metric === 'kcal' ? 0 : 1)} ${METRIC[metric].unit}` : 'rien de consigné'}
            {s && metric === 'kcal' && <span className="muted"> · P {fmt(data.get(days[sel])!.prot, 0)} g · G {fmt(data.get(days[sel])!.carbs, 0)} g · L {fmt(data.get(days[sel])!.fat, 0)} g</span>}</>
        ) : <span className="muted">Touche une barre pour voir le détail</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Graphique ${METRIC[metric].label}`}>
        {ticks.map((tv, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(tv)} y2={y(tv)} stroke="#3a3f55" strokeWidth={0.6} />
            <text x={L - 5} y={y(tv) + 3.5} textAnchor="end" className="axis">{tv >= 1000 ? fmt(tv / 1000, 1) + 'k' : fmt(tv, 0)}</text>
          </g>
        ))}
        {vals.map((v, i) => {
          const cx = L + step * i + step / 2;
          let acc = 0;
          return (
            <g key={i} opacity={sel == null || sel === i ? 1 : 0.45}>
              {v && v.stack.map((part, j) => {
                const y1 = y(acc + part), h = Math.max(0, y(acc) - y1); acc += part;
                return <rect key={j} x={cx - bw / 2} y={y1} width={bw} height={h} fill={colors[j]} rx={Math.min(3, bw / 2)} />;
              })}
              <rect x={L + step * i} y={T} width={step} height={ph} fill="transparent" onClick={() => setSel(sel === i ? null : i)} />
            </g>
          );
        })}
        {goals.length > 0 && (
          <path fill="none" stroke="#fff" strokeWidth={1.2} strokeDasharray="5 4"
            d={goals.map((gv, i) => `${i === 0 ? 'M' : 'L'}${L + step * i},${y(gv)} H${L + step * (i + 1)}`).join(' ')} />
        )}
        <line x1={L} x2={W - R} y1={T + ph} y2={T + ph} stroke="#cfd3e0" strokeWidth={1} />
        {labelIdx.map((i, k) => (
          <text key={k} x={L + step * i + step / 2} y={H - 8} textAnchor={k === 0 ? 'start' : k === labelIdx.length - 1 ? 'end' : 'middle'} className="axis">{short(days[i])}</text>
        ))}
      </svg>
      <div className="legend">
        {metric === 'kcal'
          ? <><span><i style={{ background: COLORS.prot }} />Protéines</span><span><i style={{ background: COLORS.carbs }} />Glucides</span><span><i style={{ background: COLORS.fat }} />Lipides</span></>
          : <span><i style={{ background: COLORS[metric] }} />{METRIC[metric].label}</span>}
        <span><i className="dash" />Objectif</span>
      </div>
    </div>
  );
}

export function Discover() {
  const [seg, setSeg] = useState<'dash' | 'charts' | 'report'>('dash');
  const [period, setPeriod] = useState<Period>('7');
  const [from, setFrom] = useState(addDays(today(), -29));
  const [to, setTo] = useState(today());
  const [onlyLogged, setOnlyLogged] = useState(true);
  const [withToday, setWithToday] = useState(false);
  const [metric, setMetric] = useState<Metric>('kcal');
  const history = useLiveQuery(getGoalHistory);
  const first = useLiveQuery(async () => (await db.entries.orderBy('date').first())?.date, []);

  const range = useMemo(() => {
    const end = period === 'custom' ? to : withToday ? today() : addDays(today(), -1);
    let start: string;
    if (period === 'custom') start = from;
    else if (period === 'all') start = first ?? end;
    else start = addDays(end, -(Number(period) - 1));
    if (start > end) start = end;
    return { start, end };
  }, [period, from, to, withToday, first]);

  const entries = useLiveQuery(() => db.entries.where('date').between(range.start, range.end, true, true).toArray(), [range.start, range.end]) ?? [];
  const byDay = useMemo(() => {
    const m = new Map<string, Required<Nutr>>();
    for (const e of entries) m.set(e.date, add(m.get(e.date) ?? zero(), servingNutr(e)));
    return m;
  }, [entries]);
  const days = useMemo(() => {
    const out: string[] = []; let d = range.start;
    while (d <= range.end && out.length < 3700) { out.push(d); d = addDays(d, 1); }
    return out;
  }, [range]);
  const counted = onlyLogged ? days.filter(d => byDay.has(d)) : days;
  const avg = zero();
  for (const d of counted) { const n = byDay.get(d); if (n) add(avg, n); }
  if (counted.length) for (const k of NKEYS) avg[k] /= counted.length;
  const goalDays = days.map(d => goalsFor(history, d));
  const goalBase = (counted.length ? counted : days).map(d => goalsFor(history, d));
  const goals: Goals = { kcal: 0, prot: 0, carbs: 0, fat: 0 };
  for (const gd of goalBase) for (const k of ['kcal', 'prot', 'carbs', 'fat'] as const) goals[k] += gd[k] / goalBase.length;
  const gArr = (m: Metric) => goalDays.map(gd => gd[m]);
  const mk = { p: avg.prot * 4, c: avg.carbs * 4, f: avg.fat * 9 }; const mt = mk.p + mk.c + mk.f || 1;

  const controls = (
    <div className="card controls">
      <label className="crow"><span>Période</span>
        <select value={period} onChange={e => setPeriod(e.target.value as Period)}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </label>
      {period === 'custom' && (
        <div className="crow"><span>Du</span><input type="date" value={from} onChange={e => e.target.value && setFrom(e.target.value)} />
          <span>au</span><input type="date" value={to} onChange={e => e.target.value && setTo(e.target.value)} /></div>
      )}
      <label className="crow"><span>Jours comptés</span>
        <select value={onlyLogged ? 'l' : 'a'} onChange={e => setOnlyLogged(e.target.value === 'l')}>
          <option value="l">Consignés</option><option value="a">Tous</option>
        </select>
      </label>
      {period !== 'custom' && (
        <label className="crow"><span>Inclure aujourd'hui</span>
          <input type="checkbox" className="switch" checked={withToday} onChange={e => setWithToday(e.target.checked)} />
        </label>
      )}
      <div className="muted small">{short(range.start)} – {short(range.end)} · {byDay.size} jour(s) consigné(s) sur {days.length}</div>
    </div>
  );

  return (
    <div className="screen">
      <header className="big-head"><h1>Découvrir</h1></header>
      <div className="seg main-seg">
        {([['dash', 'Résumé'], ['charts', 'Graphiques'], ['report', 'Rapport']] as const).map(([k, l]) => (
          <button key={k} className={seg === k ? 'on' : ''} onClick={() => setSeg(k)}>{l}</button>
        ))}
      </div>
      {controls}

      {seg === 'dash' && (
        <>
          <div className="card">
            <div className="muted small upper">Consommé en moyenne</div>
            <div className="avg-big">{fmt(avg.kcal, 1)} kcal <span className="muted small">/ jour</span></div>
            <table className="mtable">
              <tbody>
                <tr><td><i style={{ background: COLORS.prot }} /><b>Protéines</b></td><td>{fmt(mk.p, 0)} kcal - {fmt(avg.prot)} g</td><td>{fmt((mk.p / mt) * 100, 0)}%</td></tr>
                <tr><td><i style={{ background: COLORS.carbs }} /><b>Glucides</b></td><td>{fmt(mk.c, 0)} kcal - {fmt(avg.carbs)} g</td><td>{fmt((mk.c / mt) * 100, 0)}%</td></tr>
                <tr><td><i style={{ background: COLORS.fat }} /><b>Lipides</b></td><td>{fmt(mk.f, 0)} kcal - {fmt(avg.fat)} g</td><td>{fmt((mk.f / mt) * 100, 0)}%</td></tr>
              </tbody>
            </table>
          </div>
          <div className="card"><h3 className="ctitle">Calories consommées (kcal)</h3><Chart days={days} data={byDay} metric="kcal" goals={gArr('kcal')} /></div>
        </>
      )}

      {seg === 'charts' && (
        <div className="card">
          <div className="seg small-seg">
            {(Object.keys(METRIC) as Metric[]).map(m => <button key={m} className={metric === m ? 'on' : ''} onClick={() => setMetric(m)}>{METRIC[m].label}</button>)}
          </div>
          <h3 className="ctitle">{METRIC[metric].label} ({METRIC[metric].unit})</h3>
          <Chart days={days} data={byDay} metric={metric} goals={gArr(metric)} />
          <div className="muted small center">Moyenne : {fmt(avg[metric], metric === 'kcal' ? 0 : 1)} {METRIC[metric].unit} / jour · objectif moyen {fmt(goals[metric], 0)}</div>
        </div>
      )}

      {seg === 'report' && (
        <div className="card">
          <h3 className="ctitle">Moyennes journalières</h3>
          <table className="rtable">
            <thead><tr><th></th><th>Moyenne</th><th>Objectif moy.</th><th>%</th></tr></thead>
            <tbody>
              {(['kcal', 'prot', 'carbs', 'fat'] as Metric[]).map(k => (
                <tr key={k}><td>{METRIC[k].label}</td><td>{fmt(avg[k], k === 'kcal' ? 0 : 1)} {METRIC[k].unit}</td><td>{fmt(goals[k], 0)}</td><td>{goals[k] ? fmt((avg[k] / goals[k]) * 100, 0) + '%' : '–'}</td></tr>
              ))}
              <tr><td>Fibres</td><td>{fmt(avg.fiber)} g</td><td></td><td></td></tr>
              <tr><td>Sucres</td><td>{fmt(avg.sugars)} g</td><td></td><td></td></tr>
              <tr><td>AG saturés</td><td>{fmt(avg.satFat)} g</td><td></td><td></td></tr>
              <tr><td>Sel</td><td>{fmt(avg.salt)} g</td><td></td><td></td></tr>
            </tbody>
          </table>
          <p className="muted small">Fibres, sucres, AG saturés et sel ne sont comptés que pour les aliments qui les renseignent.</p>
        </div>
      )}
    </div>
  );
}
