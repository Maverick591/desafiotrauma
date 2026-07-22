import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

export function MetricCard({ label, value, suffix = '', note, trend, featured = false }) {
  if (value === null || value === undefined || value === '') return null
  const trendValue = Number(trend)
  return (
    <article className={`metric-card${featured ? ' metric-card--featured' : ''}`}>
      <p className="metric-card__label">{label}</p>
      <div className="metric-card__value">{value}<span>{suffix}</span></div>
      {note ? <p className="metric-card__note">{note}</p> : null}
      {Number.isFinite(trendValue) ? (
        <div className={`metric-card__trend${trendValue < 0 ? ' is-negative' : ''}`}>
          {trendValue < 0 ? <ArrowDownRight aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}
          <span>{Math.abs(trendValue)} p.p. no período</span>
        </div>
      ) : null}
    </article>
  )
}
