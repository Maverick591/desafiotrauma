import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TrendChart } from './Charts.jsx'

describe('chart accessibility', () => {
  it('oferece a série e seus valores em tabela para leitores de tela', () => {
    render(<TrendChart data={[{ label: 'Jul', accuracy: 80 }]} areas={[{ key: 'accuracy', label: 'Acurácia' }]} valueSuffix="%" />)
    expect(screen.getByRole('table', { name: 'Dados da evolução dos indicadores' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Jul' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '80' })).toBeInTheDocument()
  })
})
