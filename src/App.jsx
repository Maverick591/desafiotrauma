import React, { useState, useMemo } from 'react';
import { 
  Clock, ArrowLeft, CheckCircle2, 
  BookOpen, Activity, Database, TrendingUp 
} from 'lucide-react';

const App = () => {
  const [view, setView] = useState('dashboard');
  const logoUrl = "https://files.oaiusercontent.com/file-KAt8mK6D3j47vM7uD8W3WJ?se=2024-10-24T12%3A34%3A46Z&sp=r&sv=2024-08-04&sr=b&rscc=max-age%3D604800%2C%20private%2C%20immutable%2C%20proxy-revalidate&rscd=attachment%3B%20filename%3Dimage.png&sig=0v/Xj8Tlv0z%2BZfD6N5eH/p7/Tz6V7H5Z8m3f6m/X5j0%3D";

  const historicalData = [
    { date: '21/01', nps: 60, celerity: 4.4, responses: 23 },
    { date: '28/01', nps: 100, celerity: 4.5, responses: 29 },
    { date: '04/02', nps: 60, celerity: 3.4, responses: 26 },
    { date: '11/02', nps: 60, celerity: 4.1, responses: 24 },
    { date: '25/02', nps: 60, celerity: 4.2, responses: 22 },
    { date: '04/03', nps: 72, celerity: 4.4, responses: 25 },
    { date: '11/03', nps: 71, celerity: 4.4, responses: 21 },
    { date: '18/03', nps: 68, celerity: 4.3, responses: 23 },
    { date: '25/03', nps: 75, celerity: 4.5, responses: 21 },
    { date: '01/04', nps: 70, celerity: 4.5, responses: 19 },
    { date: '08/04', nps: 69, celerity: 4.5, responses: 20 },
  ];

  const { totalEvaluations, averageNPS } = useMemo(() => {
    const total = historicalData.reduce((sum, item) => sum + item.responses, 0);
    const avg = Math.round(historicalData.reduce((sum, item) => sum + item.nps, 0) / historicalData.length);
    return { totalEvaluations: total, averageNPS: avg };
  }, [historicalData]);

  const criteria = [
    { label: 'Clima Ético', score: 5.0, color: 'bg-teal-700' },
    { label: 'Avaliação Global', score: 4.8, color: 'bg-teal-600' },
    { label: 'Discussão Técnica', score: 4.8, color: 'bg-teal-600' },
    { label: 'Aplicabilidade Prática', score: 4.7, color: 'bg-teal-600' },
    { label: 'Celeridade', score: 4.5, color: 'bg-indigo-500' },
  ];

  const MainTrendChart = () => {
    const width = 600, height = 200, padding = 40;
    const getX = (i) => padding + (i * (width - 2 * padding) / (historicalData.length - 1));
    const getY = (val, max) => height - padding - (val * (height - 2 * padding) / max);
    const npsPoints = historicalData.map((d, i) => ({ x: getX(i), y: getY(d.nps, 100) }));
    const celPoints = historicalData.map((d, i) => ({ x: getX(i), y: getY(d.celerity, 5) }));

    return (
      <div className="bg-white/90 backdrop-blur-md p-6 rounded-[32px] border border-slate-200/60 shadow-sm h-full relative">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <Activity size={14} className="text-teal-700" /> Performance PIPS
          </h3>
          <div className="flex gap-4 text-[9px] font-bold uppercase">
            <span className="flex items-center gap-1 text-teal-900"><div className="w-2 h-2 bg-teal-900 rounded-full"></div> NPS</span>
            <span className="flex items-center gap-1 text-rose-500"><div className="w-2 h-2 bg-rose-500 rounded-full opacity-50"></div> Fluxo</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          <polyline points={npsPoints.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#134e4a" strokeWidth="3" />
          <polyline points={celPoints.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#f43f5e" strokeWidth="2" strokeDasharray="5,4" />
          {npsPoints.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" fill="#134e4a" stroke="white" />
              {i % 2 === 0 && <text x={p.x} y={p.y - 12} textAnchor="middle" className="text-[10px] font-black">+{historicalData[i].nps}</text>}
            </g>
          ))}
          {historicalData.map((d, i) => i % 2 === 0 && <text key={i} x={getX(i)} y={height - 5} textAnchor="middle" className="text-[8px] font-bold fill-slate-400 uppercase">{d.date}</text>)}
        </svg>
      </div>
    );
  };

  const VolumeTrendChart = () => {
    const width = 600, height = 180, padding = 40;
    const getX = (i) => padding + (i * (width - 2 * padding) / (historicalData.length - 1));
    const getY = (val, max) => height - padding - (val * (height - 2 * padding) / max);
    const points = historicalData.map((d, i) => ({ x: getX(i), y: getY(d.responses, 35) }));

    return (
      <div className="bg-white/90 backdrop-blur-md p-6 rounded-[32px] border border-slate-200/60 shadow-sm h-full relative">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <TrendingUp size={14} className="text-indigo-600" /> Engajamento (n)
          </h3>
          <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">n={totalEvaluations}</span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          <path d={`M ${padding},${height-padding} L ${points.map(p => `${p.x},${p.y}`).join(' L ')} L ${width-padding},${height-padding} Z`} fill="url(#gradInd)" className="opacity-10" />
          <defs><linearGradient id="gradInd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" /><stop offset="100%" stopColor="#ffffff" /></linearGradient></defs>
          <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#4f46e5" strokeWidth="2.5" />
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="3.5" fill="#4f46e5" stroke="white" />
              {i % 2 === 0 && <text x={p.x} y={p.y - 12} textAnchor="middle" className="text-[10px] font-black fill-indigo-900">n={historicalData[i].responses}</text>}
            </g>
          ))}
          {historicalData.map((d, i) => i % 2 === 0 && <text key={i} x={getX(i)} y={height - 5} textAnchor="middle" className="text-[8px] font-bold fill-slate-400 uppercase">{d.date}</text>)}
        </svg>
      </div>
    );
  };

  const DashboardHome = () => (
    <div className="space-y-6">
      <div className="bg-slate-900 p-10 rounded-[48px] shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-5xl md:text-7xl font-black text-white italic uppercase tracking-tighter mb-2">Reunião Trauma</h1>
          <p className="text-xs md:text-sm font-bold text-teal-400 tracking-[0.5em] uppercase">Performance Improvement and Patient Safety</p>
          <div className="h-1 w-24 bg-teal-500/40 mx-auto my-5 rounded-full" />
          <p className="text-[11px] font-semibold text-slate-400 tracking-[0.2em] uppercase">HCFMUSP • Disciplina de Trauma</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-teal-950 p-6 rounded-[32px] text-white shadow-xl flex flex-col justify-between border-l-4 border-teal-500">
          <div><p className="text-teal-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">NPS Médio</p><h2 className="text-5xl font-black tracking-tighter">+{averageNPS}</h2></div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-2 text-indigo-600 mb-1"><Database size={16} /><p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total Avaliações</p></div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">{totalEvaluations}</h2>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-2 text-rose-500 mb-1"><Clock size={16} /><p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Celeridade</p></div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">4.5</h2>
        </div>
        <button onClick={() => setView('takehome')} className="bg-slate-900 text-white p-6 rounded-[32px] shadow-lg hover:bg-teal-900 transition-all flex flex-col items-center justify-center gap-2 group border-b-4 border-teal-500">
          <BookOpen size={24} className="group-hover:scale-110 transition-transform text-teal-400" />
          <span className="font-black text-[10px] uppercase tracking-widest">Take-Home Messages</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><MainTrendChart /><VolumeTrendChart /></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white/90 backdrop-blur-md p-8 rounded-[40px] border border-slate-200/60 shadow-sm">
          <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] mb-8">Breakdown por Critério</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            {criteria.map((item, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between items-end"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{item.label}</span><span className="text-xs font-black text-teal-950">{item.score.toFixed(1)}</span></div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${(item.score / 5) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-teal-50/80 backdrop-blur-md border border-teal-100 p-8 rounded-[40px] flex flex-col justify-center">
          <div className="flex items-center gap-2 text-teal-700 mb-4 font-black text-[10px] uppercase tracking-widest"><CheckCircle2 size={20} /> Conclusão</div>
          <p className="text-teal-950 text-sm leading-relaxed font-bold italic">"Sustentação da celeridade em 4.5 e clima ético em 5.0."</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4 md:p-10 text-slate-900 relative">
      <div className="fixed inset-0 pointer-events-none opacity-[0.10] flex items-center justify-center p-20"
        style={{ backgroundImage: `url(${logoUrl})`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundSize: 'contain' }} />
      <div className="max-w-6xl mx-auto relative z-10">
        {view === 'dashboard' ? <DashboardHome /> : (
          <div className="max-w-4xl mx-auto pb-12">
            <button onClick={() => setView('dashboard')} className="flex items-center gap-2 text-teal-950 font-black text-[11px] tracking-widest mb-8 uppercase hover:opacity-60 transition-all"><ArrowLeft size={16} /> Voltar</button>
            <div className="bg-white rounded-[56px] shadow-2xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-950 p-12 text-white text-center border-b-8 border-teal-500"><h2 className="text-5xl font-black uppercase italic">Take-Home Messages</h2></div>
              <div className="p-12 space-y-8">{['Eficiência de Fluxo', 'Clima Ético e Académico', 'Validade de Dados'].map((t, i) => <div key={i} className="flex gap-4 items-center font-black uppercase italic text-slate-800 text-xl tracking-tighter">0{i+1}. {t}</div>)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
