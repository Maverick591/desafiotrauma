import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProfileStackedBarChart, TrendChart } from './Charts.jsx'

describe('chart accessibility', () => {
  it('oferece a série e seus valores em tabela para leitores de tela', () => {
    render(<TrendChart data={[{ label: 'Jul', accuracy: 80 }]} areas={[{ key: 'accuracy', label: 'Acurácia' }]} valueSuffix="%" />)
    expect(screen.getByRole('table', { name: 'Dados da evolução dos indicadores' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Jul' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '80' })).toBeInTheDocument()
  })

  it('publica a evolução mensal dos perfis em tabela acessível', () => {
    render(<ProfileStackedBarChart data={[
      { month: '2026-07', label: 'jul/26', profile: 'Residente', count: 42 },
      { month: '2026-07', label: 'jul/26', profile: 'Aluno', count: 18 },
    ]} />)
    expect(screen.getByRole('table', { name: 'Evolução mensal dos perfis informados' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Residente' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '42' })).toBeInTheDocument()
  })
})
