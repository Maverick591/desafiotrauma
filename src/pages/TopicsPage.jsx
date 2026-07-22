import { DashboardGate } from '../components/ui/DataState.jsx'
import { DataTable } from '../components/ui/DataTable.jsx'
import { MetricCard } from '../components/ui/MetricCard.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { Panel, SectionHeading } from '../components/ui/Panel.jsx'
import { listFrom, numberFrom } from '../lib/dashboard.js'

export function TopicsPage() {
  return (
    <>
      <PageHeader title="Assuntos e oportunidades" description="Cobertura temática e prioridades objetivas para as próximas discussões clínicas." />
      <DashboardGate section="topics">{(data) => (
        <div className="page-stack">
          <section className="metrics-grid">
            <MetricCard featured label="Assuntos cobertos" value={numberFrom(data, ['coverage', 'topics_count'])} />
            <MetricCard label="Questões mapeadas" value={numberFrom(data, ['mapped_questions', 'questions'])} />
            <MetricCard label="Oportunidades" value={numberFrom(data, ['opportunities', 'opportunities_count'])} />
          </section>
          <Panel>
            <SectionHeading title="Mapa de oportunidades" description="Desempenho agregado e recomendação editorial por assunto." />
            <DataTable caption="Oportunidades por assunto" rows={listFrom(data, 'items', 'topics', 'opportunity_map')} columns={[
              { key: 'topic', label: 'Assunto' },
              { key: 'questions', label: 'Questões' },
              { key: 'recurrence', label: 'Recorrência' },
              { key: 'last_occurrence', label: 'Última ocorrência', render: (row) => row.last_occurrence ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${row.last_occurrence}T12:00:00`)) : '—' },
              { key: 'accuracy', label: 'Acurácia', render: (row) => row.accuracy == null ? null : <span className={`score-badge${row.accuracy < 65 ? ' score-badge--attention' : ''}`}>{row.accuracy}%</span> },
              { key: 'difficulty', label: 'Dificuldade' },
              { key: 'opportunity', label: 'Próxima oportunidade' },
            ]} />
          </Panel>
        </div>
      )}</DashboardGate>
    </>
  )
}
