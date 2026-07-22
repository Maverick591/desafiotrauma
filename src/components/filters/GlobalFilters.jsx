import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useDashboard } from '../../state/DashboardContext.jsx'

const filterConfig = [
  { key: 'period', source: ['periods', 'period'], label: 'Período' },
  { key: 'presentation', source: ['presentations', 'presentation'], label: 'Apresentação' },
  { key: 'profile', source: ['profiles', 'profile'], label: 'Perfil' },
  { key: 'format', source: ['formats', 'format'], label: 'Formato' },
  { key: 'topic', source: ['topics', 'topic'], label: 'Assunto' },
  { key: 'difficulty', source: ['difficulties', 'difficulty'], label: 'Dificuldade' },
]

function normalizeOption(option) {
  if (typeof option === 'string' || typeof option === 'number') return { value: String(option), label: String(option) }
  return { value: String(option.value ?? option.id ?? option.key ?? option.label), label: option.label ?? option.name ?? option.title ?? String(option.value) }
}

export function GlobalFilters() {
  const { filters, snapshot, updateFilter, clearFilters, status } = useDashboard()
  const options = snapshot?.filters || {}
  const hasActiveFilters = Object.values(filters).some(Boolean)

  return (
    <section className="filters" aria-label="Filtros globais">
      <div className="filters__title"><SlidersHorizontal aria-hidden="true" /><span>Refinar análise</span></div>
      <div className="filters__grid">
        {filterConfig.map((filter) => {
          const source = filter.source.find((key) => Array.isArray(options[key]))
          const items = source ? options[source].map(normalizeOption) : []
          return (
            <label className="select-field" key={filter.key}>
              <span>{filter.label}</span>
              <select
                aria-label={filter.label}
                disabled={status === 'loading' && !snapshot}
                onChange={(event) => updateFilter(filter.key, event.target.value)}
                value={filters[filter.key]}
              >
                <option value="">Todos</option>
                {items.filter((item) => item.value && !item.label.toLocaleLowerCase('pt-BR').startsWith('todo')).map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          )
        })}
      </div>
      <button className="filters__clear" type="button" disabled={!hasActiveFilters} onClick={clearFilters}>
        <RotateCcw aria-hidden="true" /> Limpar
      </button>
      <p className="filters__note">Os recortes são aplicados uma dimensão por vez para preservar a privacidade estatística.</p>
    </section>
  )
}
