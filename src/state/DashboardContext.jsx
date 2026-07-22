import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { fetchDashboardSnapshot, initialFilters } from '../lib/dashboard.js'

const DashboardContext = createContext(null)

export function DashboardProvider({ children }) {
  const [filters, setFilters] = useState(initialFilters)
  const [snapshot, setSnapshot] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  const load = useCallback(async (activeFilters, signal) => {
    setStatus('loading')
    setError('')
    try {
      const next = await fetchDashboardSnapshot(activeFilters, signal)
      setSnapshot(next)
      setStatus('success')
    } catch (loadError) {
      if (loadError?.name === 'AbortError') return
      setSnapshot(null)
      setError(loadError?.message || 'Não foi possível carregar os indicadores.')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(filters, controller.signal)
    return () => controller.abort()
  }, [filters, load])

  const updateFilter = useCallback((name, value) => {
    // Snapshots publish privacy-checked views per dimension. Keeping one active
    // dimension prevents the UI from fabricating unsupported cross-tabulations.
    setFilters({ ...initialFilters, [name]: value })
  }, [])

  const clearFilters = useCallback(() => setFilters(initialFilters), [])
  const retry = useCallback(() => load(filters), [filters, load])
  const value = useMemo(
    () => ({ filters, snapshot, status, error, updateFilter, clearFilters, retry }),
    [filters, snapshot, status, error, updateFilter, clearFilters, retry],
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard() {
  const value = useContext(DashboardContext)
  if (!value) throw new Error('useDashboard deve ser usado dentro de DashboardProvider')
  return value
}
