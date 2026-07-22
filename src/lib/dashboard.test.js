import { describe, expect, it } from 'vitest'
import { initialFilters, numberFrom, selectFilteredView, stripNullish } from './dashboard.js'

describe('dashboard privacy helpers', () => {
  it('remove campos nulos inclusive em estruturas aninhadas', () => {
    expect(stripNullish({ visible: 12, suppressed: null, rows: [{ label: 'A', n: 8 }, { label: 'B', n: null }] })).toEqual({
      visible: 12,
      rows: [{ label: 'A', n: 8 }, { label: 'B' }],
    })
  })

  it('não transforma valor suprimido em zero', () => {
    expect(numberFrom({ participants: null }, ['participants'])).toBeUndefined()
    expect(numberFrom({ participants: 0 }, ['participants'])).toBe(0)
  })

  it('retorna seções vazias quando a combinação filtrada não foi publicada', () => {
    const payload = { metadata: { published_at: '2026-07-22' }, filters: { views: [] }, overview: { participants: 999 } }
    const filtered = selectFilteredView(payload, { ...initialFilters, topic: 'Tórax' })
    expect(filtered.overview).toEqual({})
    expect(filtered.metadata.empty_reason).toBe('filter_combination_unavailable')
    expect(filtered.overview.participants).toBeUndefined()
  })

  it('usa somente a visão correspondente quando a combinação existe', () => {
    const payload = {
      metadata: { published_at: '2026-07-22' },
      filters: { views: [{ filters: { topic: 'Tórax' }, snapshot: { overview: { participants: 18 } } }] },
      overview: { participants: 999 },
    }
    expect(selectFilteredView(payload, { ...initialFilters, topic: 'Tórax' }).overview.participants).toBe(18)
  })
})
