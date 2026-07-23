import { chartColors, MiniTrendChart, MultiLineChart, RadarSummaryChart, TrendChart } from '../components/charts/Charts.jsx'
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
        const consolidatedByMonth = new Map()
        criteria.forEach((criterion) => {
          criterion.trend?.forEach((point) => {
            const row = consolidatedByMonth.get(point.month) || { month: point.month, label: point.label }
            row[criterion.key] = point.score
            consolidatedByMonth.set(point.month, row)
          })
        })
        const consolidated = [...consolidatedByMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
        const shortLabel = (label) => {
          if (/aplicabilidade/i.test(label)) return 'Aplicabilidade'
          if (/global/i.test(label)) return 'Avaliação'
          if (/celeridade/i.test(label)) return 'Celeridade'
          if (/clima/i.test(label)) return 'Clima ético'
          if (/discussão/i.test(label)) return 'Discussão'
          return label.length > 20 ? `${label.slice(0, 18)}…` : label
        }
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
              <Panel className="dashboard-grid__main">
                <SectionHeading title="Evolução temporal por item" description="Média mensal de cada dimensão perguntada, em escala de 1 a 5." />
                <MultiLineChart
                  data={consolidated}
                  lines={criteria.map((criterion, index) => ({ key: criterion.key, label: shortLabel(criterion.label), color: chartColors[index % chartColors.length] }))}
                  domain={[1, 5]}
                />
              </Panel>
              <Panel>
                <SectionHeading title="Avaliação consolidada" description="Leitura comparativa das cinco dimensões." />
                <RadarSummaryChart data={criteria.map((criterion) => ({ ...criterion, shortLabel: shortLabel(criterion.label) }))} />
              </Panel>
            </div>
            <Panel>
              <SectionHeading title="Adesão e avaliação geral" description="Média consolidada e volume de avaliadores ao longo dos meses." />
              <TrendChart data={listFrom(data, 'trend', 'timeline')} areas={[{ key: 'score', label: 'Avaliação média' }]} domain={[1, 5]} />
            </Panel>
            <section className="criteria-grid" aria-label="Evolução de cada dimensão avaliada">
              {criteria.map((criterion, index) => (
                <article className="criterion-card" key={criterion.key || criterion.label}>
                  <header>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <h2 title={criterion.label}>{shortLabel(criterion.label)}</h2>
                      <p>{criterion.responses ?? '—'} avaliadores elegíveis</p>
                    </div>
                    <strong>{criterion.score == null ? '—' : criterion.score.toFixed(2)}<small>/5</small></strong>
                  </header>
                  <MiniTrendChart
                    data={criterion.trend}
                    color={chartColors[index % chartColors.length]}
                    label={shortLabel(criterion.label)}
                  />
                  <footer>
                    <span>Evolução recente</span>
                    <b className={criterion.delta < 0 ? 'is-negative' : ''}>
                      {criterion.delta == null ? 'Série em formação' : `${criterion.delta > 0 ? '+' : ''}${criterion.delta.toFixed(2)} ponto`}
                    </b>
                  </footer>
                </article>
              ))}
            </section>
          </div>
        )
      }}</DashboardGate>
    </>
  )
}
