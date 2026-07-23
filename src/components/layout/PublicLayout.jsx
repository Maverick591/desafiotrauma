import { useState } from 'react'
import { Activity, BarChart3, BookOpenCheck, LayoutDashboard, Menu, MessageSquareHeart, Target, X } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { GlobalFilters } from '../filters/GlobalFilters.jsx'
import { InsightTicker } from '../ui/InsightTicker.jsx'
import { Footer } from './Footer.jsx'
import { useDashboard } from '../../state/DashboardContext.jsx'

const navItems = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/participacao', label: 'Participação', icon: BarChart3 },
  { to: '/aprendizagem', label: 'Aprendizagem', icon: BookOpenCheck },
  { to: '/avaliacao', label: 'Avaliação', icon: MessageSquareHeart },
  { to: '/assuntos', label: 'Assuntos', icon: Target },
]

export function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { snapshot } = useDashboard()
  const publishedAt = snapshot?.metadata?.published_at

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__inner">
          <NavLink className="brand" to="/" aria-label="Desafio Trauma — início">
            <span className="brand__mark brand__mark--identity"><img src={`${import.meta.env.BASE_URL}desafio-trauma-identity.png`} alt="" /><Activity aria-hidden="true" /></span>
            <span><strong>Desafio Trauma</strong><small>Command Center Clínico</small></span>
          </NavLink>
          <button
            className="menu-button"
            aria-expanded={menuOpen}
            aria-controls="main-navigation"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setMenuOpen((current) => !current)}
            type="button"
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
          <nav id="main-navigation" className={`main-nav${menuOpen ? ' is-open' : ''}`} aria-label="Navegação principal">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} onClick={() => setMenuOpen(false)}>
                <Icon aria-hidden="true" /><span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <NavLink className="admin-link" to="/admin">Área restrita</NavLink>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="Seções do painel">
          <NavLink className="sidebar-brand" to="/" aria-label="Desafio Trauma — início">
            <span className="brand__mark brand__mark--identity"><img src={`${import.meta.env.BASE_URL}desafio-trauma-identity.png`} alt="" /><Activity aria-hidden="true" /></span>
            <span><strong>Desafio Trauma</strong><small>Command Center Clínico</small></span>
          </NavLink>
          <div className="sidebar__intro">
            <span>Painel público</span>
            <p>Indicadores agregados de educação médica em trauma.</p>
          </div>
          <nav aria-label="Navegação lateral">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}>
                <Icon aria-hidden="true" /><span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar__status">
            <span className="status-dot" aria-hidden="true" />
            <div><strong>Publicação vigente</strong><small>{publishedAt ? `Publicada em ${new Intl.DateTimeFormat('pt-BR').format(new Date(publishedAt))}` : 'Aguardando publicação'}</small></div>
          </div>
        </aside>

        <div className="content-column">
          <GlobalFilters />
          <InsightTicker items={snapshot?.overview?.highlights} />
          <main id="conteudo" className="main-content" tabIndex="-1"><Outlet /></main>
          <Footer />
        </div>
      </div>
    </div>
  )
}
