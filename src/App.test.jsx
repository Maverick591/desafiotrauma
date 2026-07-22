import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { Footer } from './components/layout/Footer.jsx'
import { DashboardProvider } from './state/DashboardContext.jsx'

describe('public dashboard', () => {
  beforeEach(() => vi.stubEnv('VITE_USE_DEMO_DATA', 'true'))

  it('renderiza uma rota analítica e a navegação principal', async () => {
    render(<MemoryRouter initialEntries={['/participacao']}><DashboardProvider><App /></DashboardProvider></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Participação', level: 1 }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Aprendizagem' }).length).toBeGreaterThan(0)
    expect(await screen.findByText('Participação ao longo do tempo', {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('mantém a assinatura obrigatória no rodapé', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>)
    expect(screen.getByText('Dr. Jocielle Miranda')).toBeInTheDocument()
    expect(screen.getByText('Developer novas tecnologias aplicadas à medicina.')).toBeInTheDocument()
    expect(screen.getByText(/Todos os direitos reservados/)).toBeInTheDocument()
  })

  it('abre uma rota profunda diretamente', async () => {
    render(<MemoryRouter initialEntries={['/avaliacao']}><DashboardProvider><App /></DashboardProvider></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Avaliação e experiência', level: 1 }, { timeout: 5000 })).toBeInTheDocument()
  })
})
