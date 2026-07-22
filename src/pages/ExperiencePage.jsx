import { TrendChart } from '../components/charts/Charts.jsx'
import { DashboardGate } from '../components/ui/DataState.jsx'
import { MetricCard } from '../components/ui/MetricCard.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { Panel, SectionHeading } from '../components/ui/Panel.jsx'
import { listFrom, numberFrom } from '../lib/dashboard.js'

export function ExperiencePage() {
  return (
    <>
      <PageHeader title="Avaliação e experiência" description="Percepção dos participantes sobre qualidade, aplicabilidade e ambiente de aprendizagem." />
      <DashboardGate section="experience">{(data) => {
        const criteria = listFrom(data, 'criteria', 'dimensions')
        return (
          <div className="page-stack">
            <section className="metrics-grid">
              <MetricCard featured label="Avaliação global" value={numberFrom(data, ['score', 'experience_score'])} suffix="/5" />
              <MetricCard label="NPS" value={numberFrom(data, ['nps'])} />
              <MetricCard label="Avaliadores" value={numberFrom(data, ['evaluations', 'responses'])} />
              <MetricCard label="Adesão" value={numberFrom(data, ['evaluation_rate'])} suffix="%" />
              <MetricCard label="Recomendaria" value={numberFrom(data, ['recommendation_rate'])} suffix="%" />
            </section>
            <div className="dashboard-grid dashboard-grid--wide">
              <Panel className="dashboard-grid__main"><SectionHeading title="Experiência ao longo do tempo" description="Avaliação média e NPS por período." /><TrendChart data={listFrom(data, 'trend', 'timeline')} areas={[{ key: 'score', label: 'Avaliação' }, { key: 'nps', label: 'NPS', color: '#4c6fff' }]} /></Panel>
              <Panel><SectionHeading title="Dimensões avaliadas" description="Médias em escala de 1 a 5." /><div className="score-list">{criteria.map((item) => item.score == null ? null : <div key={item.label}><div><span>{item.label}</span><strong>{item.score}</strong></div><progress max="5" value={item.score}>{item.score} de 5</progress></div>)}</div></Panel>
            </div>
          </div>
        )
      }}</DashboardGate>
    </>
  )
}
