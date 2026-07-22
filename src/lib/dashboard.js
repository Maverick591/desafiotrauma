import { isSupabaseConfigured, supabase } from './supabase.js'

export const initialFilters = {
  period: '',
  presentation: '',
  profile: '',
  format: '',
  topic: '',
  difficulty: '',
}

export function stripNullish(value) {
  if (Array.isArray(value)) return value.map(stripNullish).filter((item) => item != null)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item != null)
        .map(([key, item]) => [key, stripNullish(item)]),
    )
  }
  return value
}

export async function fetchDashboardSnapshot(filters, signal) {
  if (import.meta.env.VITE_USE_DEMO_DATA === 'true') {
    const { demoSnapshot } = await import('../data/demoSnapshot.js')
    return stripNullish(selectFilteredView(demoSnapshot, filters))
  }
  if (!isSupabaseConfigured) {
    throw new Error('O painel ainda não foi conectado à fonte de dados.')
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const { data, error } = await supabase.rpc('get_public_dashboard_snapshot')
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return {}
  const payload = row.snapshot && typeof row.snapshot === 'object'
    ? { ...row.snapshot, metadata: { ...(row.snapshot.metadata || {}), snapshot_id: row.snapshot_id, published_at: row.published_at, schema_version: row.schema_version } }
    : row
  const selected = selectFilteredView(payload, filters)
  return stripNullish(selected)
}

export function selectFilteredView(payload, filters) {
  const active = Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
  if (!Object.keys(active).length) return payload
  const views = [payload.views, payload.filtered_views, payload.filters?.views, payload.filters?.combinations]
    .find(Array.isArray) || []
  const view = views.find((candidate) => Object.entries(active).every(([key, value]) => String(candidate.filters?.[key] ?? '') === String(value)))
  if (view) {
    const viewSnapshot = view.snapshot || view.data || view
    return { ...payload, ...viewSnapshot, filters: payload.filters, metadata: payload.metadata }
  }
  return {
    metadata: { ...payload.metadata, empty_reason: 'filter_combination_unavailable' },
    filters: payload.filters,
    overview: {},
    participation: {},
    learning: {},
    experience: {},
    topics: {},
    metric_dictionary: payload.metric_dictionary || [],
    public_files: payload.public_files || [],
  }
}

export function listFrom(section, ...keys) {
  for (const key of keys) {
    if (Array.isArray(section?.[key])) return section[key]
  }
  return []
}

export function numberFrom(section, keys, fallback = undefined) {
  for (const key of keys) {
    const candidate = section?.[key]
    if (candidate !== null && candidate !== undefined && candidate !== '' && Number.isFinite(Number(candidate))) {
      return Number(candidate)
    }
  }
  return fallback
}
