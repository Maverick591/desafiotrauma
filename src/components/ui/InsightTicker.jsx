import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'

export function InsightTicker({ items = [] }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (items.length < 2 || paused || reducedMotion) return undefined
    const timer = window.setInterval(() => setActive((current) => (current + 1) % items.length), 6500)
    return () => window.clearInterval(timer)
  }, [items.length, paused])

  useEffect(() => {
    if (active >= items.length) setActive(0)
  }, [active, items.length])

  if (!items.length) return null
  const item = items[active]
  const change = (direction) => setActive((current) => (current + direction + items.length) % items.length)

  return (
    <section
      className="insight-ticker"
      aria-label="Insights do Desafio Trauma"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="insight-ticker__pulse" aria-hidden="true"><Sparkles /></div>
      <div className="insight-ticker__copy" aria-live="polite">
        <span>Radar Desafio Trauma</span>
        <p><strong>{item.title || 'Insight da série'}</strong> {item.detail || item}</p>
      </div>
      {items.length > 1 ? (
        <div className="insight-ticker__controls">
          <button type="button" aria-label="Insight anterior" onClick={() => change(-1)}><ChevronLeft /></button>
          <span>{active + 1}/{items.length}</span>
          <button type="button" aria-label="Próximo insight" onClick={() => change(1)}><ChevronRight /></button>
        </div>
      ) : null}
    </section>
  )
}
