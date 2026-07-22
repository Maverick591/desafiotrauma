import { DonutChart, HorizontalBarChart, TrendChart } from '../components/charts/Charts.jsx'
import { DashboardGate } from '../components/ui/DataState.jsx'
import { MetricCard } from '../components/ui/MetricCard.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { Panel, SectionHeading } from '../components/ui/Panel.jsx'
import { listFrom, numberFrom } from '../lib/dashboard.js'

export function ParticipationPage() {
  return (
    <>
      <PageHeader title="Participação" description="Alcance, volume e composição das interações ao longo das apresentações." />
      <DashboardGate section="participation">{(data) => (
        <div className="page-stack">
          <section className="metrics-grid">
            <MetricCard featured label="Participantes" value={numberFrom(data, ['total_participants', 'participants'])} />
            <MetricCard label="Respostas" value={numberFrom(data, ['total_responses', 'responses'])} />
            <MetricCard label="Taxa de resposta" value={numberFrom(data, ['response_rate'])} suffix="%" />
            <MetricCard label="Avaliadores" value={numberFrom(data, ['evaluators'])} />
            <MetricCard label="Adesão à avaliação" value={numberFrom(data, ['evaluation_rate'])} suffix="%" />
            <MetricCard label="Apresentações" value={numberFrom(data, ['presentations'])} />
          </section>
          <Panel>
            <SectionHeading title="Participação ao longo do tempo" description="Participantes e respostas válidas por período." />
            <TrendChart data={listFrom(data, 'trend', 'timeline')} areas={[{ key: 'participants', label: 'Participantes' }, { key: 'responses', label: 'Respostas', color: '#4c6fff' }]} />
          </Panel>
          <div className="dashboard-grid">
            <Panel><SectionHeading title="Por perfil" description="Composição percentual declarada." /><DonutChart data={listFrom(data, 'by_profile', 'profiles')} /></Panel>
            <Panel><SectionHeading title="Por formato" description="Distribuição das interações." /><HorizontalBarChart data={listFrom(data, 'by_format', 'formats')} suffix="%" /></Panel>
          </div>
        </div>
      )}</DashboardGate>
    </>
  )
}
