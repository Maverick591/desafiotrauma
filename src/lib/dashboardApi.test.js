import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('./supabase.js', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))

import { fetchDashboardSnapshot, initialFilters } from './dashboard.js'

describe('public snapshot RPC', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_DEMO_DATA', 'false')
    rpc.mockReset()
  })

  it('chama a RPC v1 sem argumentos e desembrulha a linha publicada', async () => {
    rpc.mockResolvedValue({
      data: [{
        snapshot_id: 'snapshot-1',
        published_at: '2026-07-22T12:00:00Z',
        schema_version: '1.0',
        snapshot: { overview: { participants: 42 }, filters: {} },
      }],
      error: null,
    })
    const result = await fetchDashboardSnapshot(initialFilters)
    expect(rpc).toHaveBeenCalledWith('get_public_dashboard_snapshot')
    expect(result.overview.participants).toBe(42)
    expect(result.metadata.published_at).toBe('2026-07-22T12:00:00Z')
    expect(result.metadata.schema_version).toBe('1.0')
  })
})
