import { AlertTriangle, Database, Loader2, RotateCw } from 'lucide-react'
import { useDashboard } from '../../state/DashboardContext.jsx'

export function DashboardGate({ section, children }) {
  const { status, error, retry, snapshot } = useDashboard()

  if (status === 'loading') {
    return (
      <div className="state-card" role="status" aria-live="polite">
        <Loader2 className="spin" aria-hidden="true" />
        <h2>Atualizando indicadores</h2>
        <p>Consultando a publicação mais recente.</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="state-card state-card--error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <h2>Dados indisponíveis</h2>
        <p>{error}</p>
        <button className="button button--secondary" onClick={retry} type="button">
          <RotateCw aria-hidden="true" /> Tentar novamente
        </button>
      </div>
    )
  }

  const data = snapshot?.[section]
  if (!data || (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0)) {
    return (
      <div className="state-card">
        <Database aria-hidden="true" />
        <h2>Nenhum dado publicado</h2>
        <p>Não há resultados disponíveis para esta seleção.</p>
      </div>
    )
  }

  return children(data, snapshot)
}
