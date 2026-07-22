import { Download, ShieldCheck } from 'lucide-react'
import { TrendChart } from '../components/charts/Charts.jsx'
import { DashboardGate } from '../components/ui/DataState.jsx'
import { MetricCard } from '../components/ui/MetricCard.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { Panel, SectionHeading } from '../components/ui/Panel.jsx'
import { listFrom, numberFrom } from '../lib/dashboard.js'

export function OverviewPage() {
  return (
    <>
      <PageHeader title="Visão geral" description="O retrato executivo da participação, aprendizagem e experiência no Desafio Trauma." />
      <DashboardGate section="overview">{(overview, snapshot) => {
        const trend = listFrom(overview, 'trend', 'timeline', 'series')
        const highlights = listFrom(overview, 'highlights', 'insights')
        const files = Array.isArray(snapshot.public_files) ? snapshot.public_files : []
        const dictionary = Array.isArray(snapshot.metric_dictionary) ? snapshot.metric_dictionary : []
        return (
          <div className="page-stack">
            <section className="metrics-grid" aria-label="Indicadores principais">
              <MetricCard featured label="Participantes" value={numberFrom(overview, ['participants', 'total_participants'])} note="Pessoas com participação válida" />
              <MetricCard label="Apresentações" value={numberFrom(overview, ['presentations', 'total_presentations'])} />
              <MetricCard label="Taxa de resposta" value={numberFrom(overview, ['response_rate'])} suffix="%" />
              <MetricCard label="Acurácia" value={numberFrom(overview, ['accuracy_rate', 'accuracy'])} suffix="%" />
              <MetricCard label="Experiência" value={numberFrom(overview, ['experience_score', 'score'])} suffix="/5" />
            </section>

            <div className="dashboard-grid dashboard-grid--wide">
              <Panel className="dashboard-grid__main">
                <SectionHeading title="Pulso do programa" description="Evolução consolidada por período publicado." />
                <TrendChart data={trend} areas={[{ key: 'participation', label: 'Participação' }, { key: 'accuracy', label: 'Acurácia', color: '#4c6fff' }]} />
              </Panel>
              <Panel className="insight-panel">
                <SectionHeading title="Sinais clínicos" description="Leituras em destaque nesta seleção." />
                <div className="insight-list">
                  {highlights.length ? highlights.map((item, index) => (
                    <article key={item.title || index}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{item.title}</h3><p>{item.detail || item.description}</p></div></article>
                  )) : <p className="muted">Nenhum destaque publicado.</p>}
                </div>
              </Panel>
            </div>

            {(dictionary.length || files.length) ? (
              <Panel className="transparency-panel">
                <div className="transparency-panel__intro"><ShieldCheck aria-hidden="true" /><div><h2>Transparência da análise</h2><p>{snapshot.metadata?.privacy_note || 'Somente resultados agregados são apresentados.'}</p></div></div>
                <div className="resource-list">
                  {dictionary.slice(0, 3).map((item) => <div key={item.metric || item.name}><strong>{item.metric || item.name}</strong><span>{item.definition || item.description}</span></div>)}
                  {files.map((file) => file.url ? <a key={file.url + file.name} href={file.url} target="_blank" rel="noreferrer"><Download aria-hidden="true" />{file.name || file.title}</a> : null)}
                </div>
              </Panel>
            ) : null}
          </div>
        )
      }}</DashboardGate>
    </>
  )
}
