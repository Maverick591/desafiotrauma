import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'

const topics = ['Atendimento inicial/ABCDE', 'Choque e ressuscitação', 'TCE e coluna', 'Tórax', 'Abdome e pelve', 'Vascular', 'Extremidades', 'Pediatria', 'Gestante', 'Idoso', 'Queimaduras', 'Imagem e diagnóstico', 'Procedimentos e técnica operatória', 'Complicações e UTI', 'Ética, sistemas e prevenção', 'Outros']
const cognitiveTasks = ['diagnóstico', 'conduta', 'priorização', 'prognóstico', 'anatomia', 'mecanismo', 'outro']
const bloomLevels = ['lembrar', 'compreender', 'aplicar', 'analisar', 'avaliar', 'criar']
const difficulties = [
  { value: 'very_hard', label: 'Muito difícil' }, { value: 'hard', label: 'Difícil' },
  { value: 'medium', label: 'Moderada' }, { value: 'easy', label: 'Fácil' },
  { value: 'very_easy', label: 'Muito fácil' },
]

export function QuestionReviewCard({ question, formatDate, onReview }) {
  const [values, setValues] = useState({
    primaryTopic: question.primary_topic || '',
    subtopic: question.subtopic || '',
    cognitiveTask: question.cognitive_task || '',
    bloomLevel: question.bloom_level || '',
    predictedDifficulty: question.predicted_difficulty || '',
    reviewNotes: question.review_notes || '',
  })
  const required = ['primaryTopic', 'subtopic', 'cognitiveTask', 'bloomLevel', 'predictedDifficulty']
  const canApprove = useMemo(() => required.every((key) => values[key].trim()), [values])
  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }))

  return (
    <article>
      <div className="review-list__meta"><span className="status status--in_review">Revisar taxonomia</span><small>{formatDate(question.updated_at)}</small></div>
      <h3>{question.prompt}</h3>
      <div className="taxonomy-grid">
        <label><span>Assunto principal</span><select value={values.primaryTopic} onChange={update('primaryTopic')}><option value="">Selecione</option>{topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select></label>
        <label><span>Subassunto</span><input value={values.subtopic} onChange={update('subtopic')} /></label>
        <label><span>Tarefa cognitiva</span><select value={values.cognitiveTask} onChange={update('cognitiveTask')}><option value="">Selecione</option>{cognitiveTasks.map((task) => <option key={task} value={task}>{task}</option>)}</select></label>
        <label><span>Nível de Bloom</span><select value={values.bloomLevel} onChange={update('bloomLevel')}><option value="">Selecione</option>{bloomLevels.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
        <label><span>Dificuldade prevista</span><select value={values.predictedDifficulty} onChange={update('predictedDifficulty')}><option value="">Selecione</option>{difficulties.map((difficulty) => <option key={difficulty.value} value={difficulty.value}>{difficulty.label}</option>)}</select></label>
        <label><span>Nota de revisão</span><input value={values.reviewNotes} onChange={update('reviewNotes')} /></label>
      </div>
      <div className="review-list__actions">
        <button className="button button--primary" type="button" disabled={!canApprove} onClick={() => onReview(values)}><Check aria-hidden="true" /> Aprovar taxonomia</button>
      </div>
    </article>
  )
}
