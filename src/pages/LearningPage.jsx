import { HistoricalComboChart, HorizontalBarChart, TrendChart } from '../components/charts/Charts.jsx'
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
            <MetricCard label="Assuntos históricos" value={data.historical?.by_topic?.length} />
            <MetricCard label="Prioridades de reforço" value={data.historical?.priority_questions?.length} />
          </section>
          <div className="dashboard-grid">
            <Panel><SectionHeading title="Evolução da acurácia" description="Resultado de cada sessão e média móvel das oito sessões acadêmicas mais recentes, sem lacunas artificiais." /><TrendChart data={listFrom(data, 'trend', 'timeline')} areas={[{ key: 'accuracy', label: 'Acurácia da sessão', color: '#4c6fff' }, { key: 'moving_accuracy', label: 'Média móvel (8)', color: '#0f766e' }]} valueSuffix="%" /></Panel>
            <Panel><SectionHeading title="Por dificuldade" description="Acurácia em cada nível publicado." /><HorizontalBarChart data={listFrom(data, 'by_difficulty', 'difficulty')} valueKey="accuracy" suffix="%" /></Panel>
          </div>
          <Panel className="historical-panel">
            <SectionHeading title="Análise histórica das questões" description="Quantidade de questões e acurácia agregada por mês em toda a série disponível." />
            <HistoricalComboChart data={data.historical?.by_month || []} />
          </Panel>
          <div className="dashboard-grid dashboard-grid--wide">
            <Panel>
              <SectionHeading title="Desempenho histórico por assunto" description="Acurácia acumulada e recorrência das questões classificadas." />
              <DataTable caption="Histórico dos assuntos" rows={data.historical?.by_topic || []} columns={[
                { key: 'topic', label: 'Assunto' },
                { key: 'accuracy', label: 'Acurácia', render: (row) => row.accuracy == null ? '—' : `${row.accuracy}%` },
                { key: 'questions', label: 'Questões' },
                { key: 'responses', label: 'Respostas' },
                { key: 'recurrence', label: 'Encontros' },
                { key: 'opportunity', label: 'Leitura' },
              ]} />
            </Panel>
            <Panel className="priority-panel">
              <SectionHeading title="Prioridades históricas" description="Questões com menos de 60% de acerto e pelo menos 30 respostas." />
              <div className="priority-list">
                {(data.historical?.priority_questions || []).map((item, index) => (
                  <article key={`${item.question}-${item.date}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div><strong>{item.question}</strong><small>{item.topic} · {item.responses} respostas</small></div>
                    <b>{item.accuracy}%</b>
                  </article>
                ))}
                {!data.historical?.priority_questions?.length ? <p className="muted">Nenhuma questão atingiu o critério de reforço nesta seleção.</p> : null}
              </div>
              <h3 className="priority-subheading">Maiores domínios históricos</h3>
              <div className="priority-list priority-list--positive">
                {(data.historical?.strongest_questions || []).slice(0, 3).map((item, index) => (
                  <article key={`${item.question}-${item.date}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div><strong>{item.question}</strong><small>{item.topic} · {item.responses} respostas</small></div>
                    <b>{item.accuracy}%</b>
                  </article>
                ))}
                {!data.historical?.strongest_questions?.length ? <p className="muted">Série de maior domínio em formação.</p> : null}
              </div>
            </Panel>
          </div>
          <Panel>
            <SectionHeading title="Arquivo histórico por questão" description="Todos os itens com volume elegível, intervalo de confiança, discriminação e distratores." />
            <DataTable caption="Desempenho das questões" rows={listFrom(data, 'question_performance', 'items', 'questions_detail')} columns={[
              { key: 'question', label: 'Questão' },
              { key: 'topic', label: 'Assunto' },
              { key: 'date', label: 'Data', render: (row) => row.date ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${row.date}T00:00:00Z`)) : '—' },
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
