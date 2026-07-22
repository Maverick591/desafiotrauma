import { useEffect, useMemo, useState } from 'react'
import { Activity, Download, FileUp, History, LogOut, Play, RefreshCw, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Footer } from '../components/layout/Footer.jsx'
import { FeedbackReviewCard } from './FeedbackReviewCard.jsx'
import { QuestionReviewCard } from './QuestionReviewCard.jsx'
import {
  MAX_UPLOAD_BYTES,
  createSourceDownload,
  dispatchDashboardRefresh,
  dispatchIngestion,
  loadAdminDashboard,
  reviewFeedback,
  reviewQuestion,
  signOutAdmin,
  uploadManualImport,
} from './adminApi.js'

const date = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(Number(value || 0))

export function AdminDashboard({ user, onSignOut }) {
  const [data, setData] = useState({ reviews: [], questions: [], runs: [], imports: [], files: [] })
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState(null)
  const [importKind, setImportKind] = useState('mentimeter_export')
  const [presentationExternalId, setPresentationExternalId] = useState('')
  const [presentationTitle, setPresentationTitle] = useState('')
  const [eventDate, setEventDate] = useState('')

  async function refresh() {
    setStatus('loading')
    try {
      setData(await loadAdminDashboard())
      setStatus('ready')
    } catch (error) {
      setMessage(error?.message || 'Falha ao carregar a área administrativa.')
      setStatus('error')
    }
  }

  useEffect(() => { refresh() }, [])
  const totalCost = useMemo(() => data.runs.reduce((sum, run) => sum + Number(run.estimated_cost_usd || 0), 0), [data.runs])
  const pendingReviews = data.reviews.filter((item) => ['pending', 'in_review'].includes(item.status))
  const apiBudget = useMemo(() => Number(import.meta.env.VITE_OPENAI_MONTHLY_BUDGET_USD || data.runs.find((run) => Number(run.metadata?.budget_usd))?.metadata?.budget_usd || 5), [data.runs])
  const budgetUsage = apiBudget > 0 ? Math.min(100, (totalCost / apiBudget) * 100) : 0

  async function act(label, action) {
    setMessage('')
    try {
      await action()
      setMessage(label)
      await refresh()
    } catch (error) {
      setMessage(error?.message || 'A operação não pôde ser concluída.')
    }
  }

  async function handleUpload(event) {
    event.preventDefault()
    if (!file) return
    const form = event.currentTarget
    await act('Arquivo enviado e importação registrada.', async () => {
      await uploadManualImport(file, user.id, { importKind, presentationExternalId, presentationTitle, eventDate })
      await dispatchIngestion('manual')
      setFile(null)
      setPresentationExternalId('')
      setPresentationTitle('')
      setEventDate('')
      form.reset()
    })
  }

  function handleFileSelection(event) {
    const selected = event.target.files?.[0] || null
    if (selected && selected.size > MAX_UPLOAD_BYTES) {
      event.target.value = ''
      setFile(null)
      setMessage('O arquivo excede o limite de 50 MB.')
      return
    }
    setMessage('')
    setFile(selected)
  }

  async function handleDownload(path) {
    const url = await createSourceDownload(path)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function logout() {
    await signOutAdmin()
    onSignOut()
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header__inner">
          <Link className="brand brand--admin" to="/"><span className="brand__mark"><Activity aria-hidden="true" /></span><span><strong>Desafio Trauma</strong><small>Operações</small></span></Link>
          <div className="admin-user"><span><strong>{user.email}</strong><small>Acesso verificado por allowlist</small></span><button type="button" onClick={logout}><LogOut aria-hidden="true" /> Sair</button></div>
        </div>
      </header>
      <main className="admin-main" id="conteudo">
        <div className="admin-title"><div><h1>Central de operações</h1><p>Revisões, ingestões e observabilidade do pipeline.</p></div><button className="button button--secondary" type="button" onClick={refresh}><RefreshCw aria-hidden="true" /> Atualizar</button></div>
        {message ? <div className={`notice${status === 'error' ? ' notice--error' : ''}`} role="status">{message}</div> : null}

        <section className="admin-metrics" aria-label="Resumo operacional">
          <article><span>Trechos pendentes</span><strong>{pendingReviews.length}</strong></article>
          <article><span>Questões pendentes</span><strong>{data.questions.length}</strong></article>
          <article><span>Importações recentes</span><strong>{data.imports.length}</strong></article>
          <article className="admin-cost"><span>Custo · últimos 30 runs</span><strong>{money(totalCost)}</strong><small>{budgetUsage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do orçamento de {money(apiBudget)}</small><progress max="100" value={budgetUsage}>{budgetUsage}%</progress></article>
        </section>

        <div className="admin-grid">
          <section className="panel admin-grid__review">
            <div className="section-heading"><div><h2>Fila de trechos</h2><p>Anonimização e aprovação editorial com auditoria.</p></div><span className="count-badge">{pendingReviews.length} pendentes</span></div>
            {pendingReviews.length ? <div className="review-list">{pendingReviews.map((review) => (
              <FeedbackReviewCard key={review.id} review={review} formatDate={date} onReview={(reviewStatus, values) => act(reviewStatus === 'approved' ? 'Trecho aprovado.' : 'Trecho rejeitado.', () => reviewFeedback(review.feedback_id, reviewStatus, values))} />
            ))}</div> : <div className="inline-empty"><ShieldCheck aria-hidden="true" /><p>Fila em dia. Nenhum trecho aguardando decisão.</p></div>}
          </section>

          <section className="panel admin-grid__upload">
            <div className="section-heading"><div><h2>Nova importação</h2><p>Planilha Spreadsheet (XLSX) exportada do Mentimeter.</p></div></div>
            <form className="upload-form" onSubmit={handleUpload}>
              <label className="select-field"><span>Tipo de importação</span><select value={importKind} onChange={(event) => setImportKind(event.target.value)}><option value="mentimeter_export">Exportação Mentimeter</option><option value="historical_backfill">Carga histórica</option><option value="correction">Correção manual</option></select></label>
              <label className="select-field"><span>ID da apresentação</span><input required maxLength="255" value={presentationExternalId} onChange={(event) => setPresentationExternalId(event.target.value)} placeholder="Ex.: 987654321" /></label>
              <label className="select-field"><span>Título</span><input required maxLength="500" value={presentationTitle} onChange={(event) => setPresentationTitle(event.target.value)} placeholder="Desafio Trauma - 27/05/2026" /></label>
              <label className="select-field"><span>Data do encontro</span><input required type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></label>
              <label className="file-drop"><FileUp aria-hidden="true" /><strong>{file?.name || 'Selecionar arquivo'}</strong><span>Limite de 50 MB · somente XLSX</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required onChange={handleFileSelection} /></label>
              <button className="button button--primary button--full" type="submit" disabled={!file || !presentationExternalId.trim() || !presentationTitle.trim() || !eventDate}>Enviar e iniciar ingestão</button>
            </form>
            <button className="button button--secondary button--full" type="button" onClick={() => act('Atualização do painel solicitada.', dispatchDashboardRefresh)}><Play aria-hidden="true" /> Atualizar snapshot público</button>
            <button className="button button--secondary button--full" type="button" onClick={() => act('Reprocessamento histórico solicitado.', () => dispatchIngestion('backfill'))}><History aria-hidden="true" /> Reprocessar histórico</button>
          </section>
        </div>

        <section className="panel admin-section">
          <div className="section-heading"><div><h2>Fila de questões</h2><p>Revisão humana da taxonomia e dificuldade previstas.</p></div><span className="count-badge">{data.questions.length} pendentes</span></div>
          {data.questions.length ? <div className="review-list question-review-list">{data.questions.map((question) => (
            <QuestionReviewCard key={question.id} question={question} formatDate={date} onReview={(values) => act('Taxonomia aprovada.', () => reviewQuestion(question.id, values))} />
          ))}</div> : <div className="inline-empty"><ShieldCheck aria-hidden="true" /><p>Nenhuma questão aguarda revisão de taxonomia.</p></div>}
        </section>

        <section className="panel admin-section">
          <div className="section-heading"><div><h2>Execuções e custo de API</h2><p>Últimos 30 runs processados pelo pipeline e comparação com o orçamento.</p></div></div>
          <div className="table-wrap"><table><thead><tr><th>Pipeline</th><th>Status</th><th>Modelo</th><th>Tokens</th><th>Custo</th><th>Início</th></tr></thead><tbody>{data.runs.map((run) => <tr key={run.id}><td>{run.pipeline_name}</td><td><span className={`status status--${run.status}`}>{run.status}</span></td><td>{run.model_name || '—'}</td><td>{Number(run.total_tokens || 0).toLocaleString('pt-BR')}</td><td>{money(run.estimated_cost_usd)}</td><td>{date(run.started_at || run.created_at)}</td></tr>)}</tbody></table></div>
          {!data.runs.length ? <p className="table-empty">Nenhuma execução registrada.</p> : null}
        </section>

        <section className="panel admin-section">
          <div className="section-heading"><div><h2>Arquivos e importações</h2><p>Histórico recente com acesso temporário aos originais.</p></div></div>
          <div className="table-wrap"><table><thead><tr><th>Arquivo</th><th>Tamanho</th><th>Enviado em</th><th></th></tr></thead><tbody>{data.files.map((item) => <tr key={item.id}><td>{item.original_filename}</td><td>{(Number(item.byte_size || 0) / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB</td><td>{date(item.uploaded_at)}</td><td><button className="table-action" type="button" onClick={() => act('Link temporário aberto.', () => handleDownload(item.storage_path))}><Download aria-hidden="true" /> Baixar</button></td></tr>)}</tbody></table></div>
          {!data.files.length ? <p className="table-empty">Nenhum arquivo enviado.</p> : null}
        </section>
      </main>
      <Footer />
    </div>
  )
}
