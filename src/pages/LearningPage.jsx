import { HorizontalBarChart, TrendChart } from '../components/charts/Charts.jsx'
import { DashboardGate } from '../components/ui/DataState.jsx'
import { DataTable } from '../components/ui/DataTable.jsx'
import { MetricCard } from '../components/ui/MetricCard.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { Panel, SectionHeading } from '../components/ui/Panel.jsx'
import { listFrom, numberFrom } from '../lib/dashboard.js'

export function LearningPage() {
  return (
    <>
      <PageHeader title="Aprendizagem e questões" description="Desempenho educacional, complexidade e pontos que pedem reforço." />
      <DashboardGate section="learning">{(data) => (
        <div className="page-stack">
          <section className="metrics-grid">
            <MetricCard featured label="Acurácia global" value={numberFrom(data, ['accuracy_rate', 'accuracy'])} suffix="%" trend={numberFrom(data, ['improvement'])} />
            <MetricCard label="Questões" value={numberFrom(data, ['questions', 'total_questions'])} />
            <MetricCard label="Respostas avaliadas" value={numberFrom(data, ['answers', 'responses'])} />
          </section>
          <div className="dashboard-grid">
            <Panel><SectionHeading title="Evolução da acurácia" description="Percentual de respostas corretas." /><TrendChart data={listFrom(data, 'trend', 'timeline')} areas={[{ key: 'accuracy', label: 'Acurácia' }]} valueSuffix="%" /></Panel>
            <Panel><SectionHeading title="Por dificuldade" description="Acurácia em cada nível publicado." /><HorizontalBarChart data={listFrom(data, 'by_difficulty', 'difficulty')} valueKey="accuracy" suffix="%" /></Panel>
          </div>
          <Panel>
            <SectionHeading title="Desempenho por questão" description="Itens com volume elegível para análise pública." />
            <DataTable caption="Desempenho das questões" rows={listFrom(data, 'question_performance', 'items', 'questions_detail')} columns={[
              { key: 'question', label: 'Questão' },
              { key: 'topic', label: 'Assunto' },
              { key: 'accuracy', label: 'Acurácia', render: (row) => row.accuracy == null ? null : `${row.accuracy}%` },
              { key: 'wilson', label: 'IC 95%', render: (row) => row.wilson_low == null ? '—' : `${row.wilson_low}%–${row.wilson_high}%` },
              { key: 'discrimination', label: 'Discriminação', render: (row) => row.discrimination == null ? '—' : row.discrimination },
              { key: 'ineffective_distractors', label: 'Distratores <5%', render: (row) => row.ineffective_distractors?.length ? row.ineffective_distractors.join(', ') : '—' },
              { key: 'responses', label: 'Respostas' },
            ]} />
          </Panel>
        </div>
      )}</DashboardGate>
    </>
  )
}
