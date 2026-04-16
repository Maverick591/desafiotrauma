import React, { useState, useMemo } from 'react';
import { 
  Clock, Award, ChevronRight, ArrowLeft, CheckCircle2, 
  AlertCircle, Users, ShieldCheck, BookOpen, Calendar, 
  ExternalLink, BarChart3, Activity, Database, TrendingUp, Share2 
} from 'lucide-react';

const App = () => {
  const [view, setView] = useState('dashboard');
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

  return (
    <div className="min-h-screen bg-slate-50 p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-slate-900 p-10 rounded-[48px] text-center text-white shadow-2xl">
          <h1 className="text-5xl font-black uppercase italic tracking-tighter">Reunião Trauma</h1>
          <p className="text-teal-400 font-bold uppercase tracking-widest text-xs mt-2">HCFMUSP • PIPS Dashboard</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-teal-950 p-8 rounded-[32px] text-white">
            <p className="text-[10px] uppercase font-black opacity-60">NPS Médio</p>
            <h2 className="text-4xl font-black">+{averageNPS}</h2>
          </div>
          <div className="bg-white p-8 rounded-[32px] border border-slate-200">
            <p className="text-[10px] uppercase font-black opacity-60">Avaliações</p>
            <h2 className="text-4xl font-black text-slate-800">{totalEvaluations}</h2>
          </div>
          <div className="bg-white p-8 rounded-[32px] border border-slate-200">
            <p className="text-[10px] uppercase font-black opacity-60">Celeridade</p>
            <h2 className="text-4xl font-black text-rose-600">4.5</h2>
          </div>
        </div>
      </div>
    </div>
  );
};
export default App;
