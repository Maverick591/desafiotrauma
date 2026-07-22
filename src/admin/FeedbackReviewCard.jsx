import { useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'

export function FeedbackReviewCard({ review, formatDate, onReview }) {
  const [values, setValues] = useState({
    anonymizedText: review.anonymized_text || '',
    approvedExcerpt: review.approved_excerpt || '',
    reviewNotes: review.review_notes || '',
  })
  const canApprove = useMemo(
    () => Boolean(values.anonymizedText.trim() && values.approvedExcerpt.trim()),
    [values.anonymizedText, values.approvedExcerpt],
  )
  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }))

  return (
    <article>
      <div className="review-list__meta"><span className={`status status--${review.status}`}>{review.status === 'in_review' ? 'Em revisão' : 'Pendente'}</span><small>{formatDate(review.created_at)}</small></div>
      <h3>Referência {review.feedback_id}</h3>
      <div className="review-form-grid">
        <label className="review-form-grid__full"><span>Texto anonimizado</span><textarea rows="4" value={values.anonymizedText} onChange={update('anonymizedText')} placeholder="Remova nomes e qualquer identificador pessoal…" /></label>
        <label><span>Trecho aprovado</span><textarea rows="3" value={values.approvedExcerpt} onChange={update('approvedExcerpt')} placeholder="Trecho autorizado para publicação…" /></label>
        <label><span>Nota de revisão</span><textarea rows="3" value={values.reviewNotes} onChange={update('reviewNotes')} placeholder="Registre a decisão editorial…" /></label>
      </div>
      <div className="review-list__actions">
        <button className="button button--danger" type="button" onClick={() => onReview('rejected', values)}><X aria-hidden="true" /> Rejeitar</button>
        <button className="button button--primary" type="button" disabled={!canApprove} title={canApprove ? undefined : 'Preencha o texto anonimizado e o trecho aprovado'} onClick={() => onReview('approved', values)}><Check aria-hidden="true" /> Aprovar</button>
      </div>
    </article>
  )
}
